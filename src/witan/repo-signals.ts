import { createHash } from 'node:crypto';
import {
  type Dirent,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';

import { WITAN_RUBRIC_VERSION, WITAN_RUBRIC_VERSION_V8 } from './schemas.js';
import type {
  WitanCriterionMetric,
  WitanCriterionId,
  WitanCriterionSignal,
  WitanCriterionSignalPayload,
  WitanEvidencePointer,
  WitanFinding,
  WitanRepoArchetype,
  WitanReportInputPayload,
} from './schemas.js';

import {
  readRepoText,
  readRepoTextPrefix,
  recordContentSkip,
  recordFilesystemSkip,
  trackContentReads,
  withContentReadCriterion,
} from './content-reads.js';

import {
  WITAN_AUTHENTICATED_A1_ABSENCE_SUMMARY,
  WITAN_NO_MEASUREMENT_REASON,
} from './abstention.js';
import {
  describeGitFailure,
  execGit,
  isExpectedGitAbsence,
  type GitExecResult,
} from './git-exec.js';
import { stripBom } from './json-safe.js';
import {
  WITAN_RUBRIC_VERSION_V9,
  WITAN_RUBRIC_VERSION_V10,
  WITAN_RUBRIC_VERSION_V11,
  WITAN_RUBRIC_VERSION_V12,
  WITAN_RUBRIC_VERSION_V13,
  WITAN_RUBRIC_VERSION_V14,
  WITAN_RUBRIC_VERSION_V15,
  WITAN_RUBRIC_VERSION_V16,
  WITAN_RUBRIC_VERSION_V17,
  WITAN_RUBRIC_VERSION_V18,
  WITAN_RUBRIC_VERSION_V19,
  WITAN_RUBRIC_VERSION_V20,
  WITAN_RUBRIC_VERSION_V21,
} from './rubric-version.js';

function usesV17DetectorClosure(rubricVersion: string): boolean {
  return (
    rubricVersion === WITAN_RUBRIC_VERSION_V17 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V18 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21
  );
}

// Additive domain-signal extension point (goal_cejel_public_extraction_ip_scrub_2026-07-10):
// a collector appends one extra criterion signal computed from the same repo file inventory.
// This generic seam is what keeps domain-specific rule packs out of this general scanner
// entirely — a pack plugs in at the call site instead of being imported here.
export type WitanDomainSignalCollector = (
  repoPath: string,
  repoFiles: readonly string[],
) => WitanCriterionSignalPayload;

export interface BuildWitanInputOptions {
  productSlug: string;
  productDisplayName: string;
  repoPath: string;
  rubricVersion?: string;
  generatedAt?: string;
  additionalSignals?: readonly WitanCriterionSignal[];
  // Additive domain-profile opt-in. Never set automatically — collectRepoSignals' default
  // A1-B6 pass is unaffected either way. Each collector appends its own native signal; the
  // caller is responsible for also scoring against a rubric that includes the collector's
  // criterion so the extra signal actually surfaces in the report.
  domainCollectors?: readonly WitanDomainSignalCollector[];
}

export function buildWitanInputFromRepo(options: BuildWitanInputOptions): WitanReportInputPayload {
  const tracked = trackContentReads(options.repoPath, () => buildWitanInputFromRepoUntracked(options));
  const affectedCriteria = tracked.affectedCriteria;
  const signals = (tracked.value.signals ?? []).map((signal) => {
    if (!affectedCriteria.has(signal.criterionId)) return signal;
    return {
      criterionId: signal.criterionId,
      positiveEvidence: [],
      findings: [],
      metrics: [],
      insufficientData: true as const,
      notes:
        'Cejel abstained on this criterion because one or more relevant repository files could not be read. Resolve the content-read limitations and re-scan.',
    };
  });
  const affectedCount = affectedCriteria.size;
  const scanLimitations = [...(tracked.value.scanLimitations ?? [])];
  if (affectedCount > 0 && scanLimitations.length < 16) {
    scanLimitations.push(
      `${affectedCount} ${affectedCount === 1 ? 'criterion' : 'criteria'} abstained because relevant repository content could not be read. Counts and errno classes are recorded in contentReadSummary; file paths are intentionally omitted.`,
    );
  }
  return {
    ...tracked.value,
    signals,
    ...(scanLimitations.length > 0 ? { scanLimitations } : {}),
    contentReadSummary: tracked.summary,
  };
}

function buildWitanInputFromRepoUntracked(
  options: BuildWitanInputOptions,
): WitanReportInputPayload {
  assertRepoPathExists(options.repoPath);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const rubricVersion = options.rubricVersion ?? WITAN_RUBRIC_VERSION;
  const fileInventory = collectRepoFileInventory(options.repoPath);
  const headSha = readGitHead(options.repoPath);
  const repoFiles = fileInventory.repoFiles;
  const inventoryFiles = fileInventory.inventoryFiles;
  const ignoredTargetReason =
    repoFiles.length === 0 ? explainIgnoredScanTarget(options.repoPath) : undefined;
  const usesV17Detectors = usesV17DetectorClosure(rubricVersion);
  const usesV18NativeRls =
    rubricVersion === WITAN_RUBRIC_VERSION_V18 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21;
  const usesV19CommitYear =
    rubricVersion === WITAN_RUBRIC_VERSION_V19 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V20 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V21;
  const usesV20A3ExplicitGaps =
    rubricVersion === WITAN_RUBRIC_VERSION_V20 || rubricVersion === WITAN_RUBRIC_VERSION_V21;
  const usesV21ExecutedEscalations = rubricVersion === WITAN_RUBRIC_VERSION_V21;
  const structuralArchetype = classifyRepoArchetype(inventoryFiles, rubricVersion);
  const readableArchetype =
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? applyReadableSourceRepresentationGate(
          options.repoPath,
          inventoryFiles,
          structuralArchetype,
          headSha,
          rubricVersion,
        )
      : structuralArchetype;
  const gatedArchetype =
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? applySemanticSourceRepresentationGate(
          options.repoPath,
          inventoryFiles,
          readableArchetype,
          rubricVersion,
        )
      : readableArchetype;
  const usesV8Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V8 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV33Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV36Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV39Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const usesV47Detectors =
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion);
  const reviewableSourceProof = usesV17Detectors
    ? buildReviewableSourceProof(options.repoPath, inventoryFiles, headSha, rubricVersion)
    : undefined;
  const scanLimitations = new Set(fileInventory.scanLimitations);
  const coreSignals = collectRepoSignals(
    options.repoPath,
    generatedAt,
    repoFiles,
    usesV8Detectors,
    usesV33Detectors,
    usesV36Detectors,
    usesV39Detectors,
    usesV47Detectors,
    usesV18NativeRls,
    usesV19CommitYear,
    usesV20A3ExplicitGaps,
    usesV21ExecutedEscalations,
    reviewableSourceProof,
    scanLimitations,
  );
  const archetype =
    usesV17Detectors &&
    reviewableSourceProof?.passes === true &&
    isV17RescuableAbstention(gatedArchetype.abstentionKind) &&
    coreSignals.some(isMeasuredCriterionSignal)
      ? {
          archetype: isLikelyMonorepo(inventoryFiles) ? ('monorepo' as const) : ('source' as const),
          sourceFileCount: gatedArchetype.sourceFileCount,
          totalFileCount: gatedArchetype.totalFileCount,
        }
      : gatedArchetype;

  return {
    productSlug: options.productSlug,
    productDisplayName: options.productDisplayName,
    repo: {
      path: options.repoPath,
      ...(headSha ? { headSha } : {}),
    },
    generatedAt,
    ...(options.rubricVersion ? { rubricVersion: options.rubricVersion } : {}),
    archetype: archetype.archetype,
    ...((ignoredTargetReason ?? archetype.insufficientSourceReason)
      ? { insufficientSourceReason: ignoredTargetReason ?? archetype.insufficientSourceReason }
      : {}),
    ...(scanLimitations.size > 0
      ? { scanLimitations: [...scanLimitations] }
      : {}),
    signals: [
      ...coreSignals,
      ...(options.domainCollectors ?? []).map((collect) => collect(options.repoPath, repoFiles)),
      ...(options.additionalSignals ?? []),
    ],
  };
}

// ---- Repo archetype classification (goal_cejel_repo_archetype_detection_2026-07-06) ----------
//
// A deterministic, offline read of the file inventory that decides whether a repo has a
// ratable source tree at all. This is intentionally conservative: it only flags a repo as
// insufficient-source ('docs_only' | 'binary_only' | 'generated_only' |
// 'non_cohesive_source' | 'unrecognised_ecosystem' | 'empty') only from positive structural
// evidence — never merely "few source files detected". Many legitimate scan targets (a bare
// requirements.txt, a lockfile-only monorepo sub-package) have zero source-extension files of
// their own and must keep scoring exactly as before via the individual collectors' own
// archetype-aware N/A gates (see A2/A3 above) — this classifier must never gate those away.
//
// DOMINANCE, NOT PRESENCE (goal_cejel_archetype_dominance_not_presence_2026-07-15): a repo with
// ANY recognised-source file used to short-circuit straight to 'source' regardless of how small
// a fraction of the tree that file represented — nine incidental .sh deploy scripts scored a
// 329-file, 99%-COBOL repository (aws-samples/aws-mainframe-modernization-carddemo) on its shell
// scripts alone. `SOURCE_DOMINANCE_RATIO_THRESHOLD` below only engages when a competing
// unrecognised-language signal actually exists (collectUnrecognisedSourceFiles is non-empty);
// a repo with recognised source and nothing else is completely unaffected. See
// docs/calibration/archetype-ratio-golden-set.md for the calibration record.
export interface RepoArchetypeClassification {
  archetype: WitanRepoArchetype;
  sourceFileCount: number;
  totalFileCount: number;
  /** Present only for the non-source archetypes; explains why and points to --ingest. */
  insufficientSourceReason?: string;
  /** Internal closed reason identity used by prospective, versioned rescue policy. */
  abstentionKind?: RepoAbstentionKind;
}

type RepoAbstentionKind =
  | 'empty'
  | 'generated_only'
  | 'independent_catalog'
  | 'docs_source_role'
  | 'artifact_dominance'
  | 'binary_distribution'
  | 'docs_distribution'
  | 'unrecognised_ecosystem'
  | 'readable_representation'
  | 'semantic_auxiliary';

function isV17RescuableAbstention(kind: RepoAbstentionKind | undefined): boolean {
  return (
    kind === 'artifact_dominance' ||
    kind === 'docs_source_role' ||
    kind === 'readable_representation' ||
    kind === 'semantic_auxiliary'
  );
}

function isMeasuredCriterionSignal(signal: WitanCriterionSignalPayload): boolean {
  if (signal.notApplicable === true) return false;
  return (
    (signal.metrics?.length ?? 0) > 0 ||
    (signal.positiveEvidence?.length ?? 0) > 0 ||
    (signal.findings?.length ?? 0) > 0
  );
}

// goal_cejel_language_calibration_2026-07-12: widened to add the ecosystems that were cheap
// to recognise (shell, R, Lua, Julia, Haskell, Terraform, SQL, Perl, OCaml, Clojure, Erlang,
// Nim, Zig, F#, Groovy) on top of the original nineteen. V7 distinguishes recognition from
// modeling depth: cohesive source in a language whose collectors are not deep is still source;
// unsupported dimensions become insufficient_data rather than forcing a repository-wide
// abstention solely from its extension.
//
// goal_cejel_derive_dont_enumerate_2026-07-13 (Guard 3): this array is now the ONE canonical
// source for "which languages does cejel recognise as source, and how deeply is each
// modelled" — SOURCE_EXTENSION_PATTERN below is COMPILED from it rather than typed
// separately, and the public README/tests read this same array rather than a second,
// independently-maintained list. A language added or removed here propagates everywhere by
// construction; see claim-matches-code.test.ts (Guard 3) for the README/test-side assertion.
export type SourceLanguageTier = 'deep' | 'partial' | 'unmodelled';

export interface SourceLanguageEntry {
  readonly name: string;
  readonly tier: SourceLanguageTier;
  readonly extensions: readonly string[];
}

export const SOURCE_LANGUAGES: readonly SourceLanguageEntry[] = [
  {
    name: 'JS/TS',
    tier: 'deep',
    extensions: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'],
  },
  { name: 'Python', tier: 'deep', extensions: ['py'] },
  { name: 'Go', tier: 'partial', extensions: ['go'] },
  { name: 'Rust', tier: 'partial', extensions: ['rs'] },
  { name: 'Java', tier: 'partial', extensions: ['java'] },
  { name: 'Ruby', tier: 'partial', extensions: ['rb'] },
  { name: 'PHP', tier: 'partial', extensions: ['php'] },
  { name: 'C#', tier: 'partial', extensions: ['cs'] },
  { name: 'C/C++', tier: 'partial', extensions: ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'] },
  { name: 'Swift', tier: 'partial', extensions: ['swift'] },
  { name: 'Kotlin', tier: 'partial', extensions: ['kt', 'kts'] },
  { name: 'Dart', tier: 'partial', extensions: ['dart'] },
  { name: 'Elixir', tier: 'partial', extensions: ['ex', 'exs'] },
  { name: 'Scala', tier: 'partial', extensions: ['scala'] },
  { name: 'shell', tier: 'unmodelled', extensions: ['sh', 'bash', 'zsh', 'bat', 'cmd'] },
  { name: 'R', tier: 'unmodelled', extensions: ['r'] },
  { name: 'Lua', tier: 'unmodelled', extensions: ['lua'] },
  { name: 'Julia', tier: 'unmodelled', extensions: ['jl'] },
  { name: 'Haskell', tier: 'unmodelled', extensions: ['hs'] },
  { name: 'Terraform', tier: 'unmodelled', extensions: ['tf', 'tfvars'] },
  { name: 'SQL', tier: 'unmodelled', extensions: ['sql'] },
  { name: 'Perl', tier: 'unmodelled', extensions: ['pl', 'pm'] },
  { name: 'OCaml', tier: 'unmodelled', extensions: ['ml', 'mli'] },
  { name: 'Clojure', tier: 'unmodelled', extensions: ['clj', 'cljs', 'cljc'] },
  { name: 'Erlang', tier: 'unmodelled', extensions: ['erl', 'hrl'] },
  { name: 'Nim', tier: 'unmodelled', extensions: ['nim'] },
  { name: 'Zig', tier: 'unmodelled', extensions: ['zig'] },
  { name: 'F#', tier: 'unmodelled', extensions: ['fs', 'fsx'] },
  { name: 'Groovy', tier: 'unmodelled', extensions: ['groovy', 'gvy'] },
  { name: 'Fortran', tier: 'unmodelled', extensions: ['f', 'for', 'f77', 'f90', 'f95', 'f03'] },
  { name: 'CUDA/HIP', tier: 'unmodelled', extensions: ['cu', 'cuh', 'hip'] },
  {
    name: 'Web templates/styles',
    tier: 'unmodelled',
    extensions: [
      'html',
      'htm',
      'css',
      'scss',
      'sass',
      'less',
      'hbs',
      'handlebars',
      'variables',
      'overrides',
      'vue',
      'svelte',
      'astro',
      'erb',
      'haml',
      'slim',
      'erubis',
      'hamlit',
    ],
  },
] as const;

export const SOURCE_LANGUAGES_V10: readonly SourceLanguageEntry[] = [
  ...SOURCE_LANGUAGES,
  { name: 'COBOL', tier: 'unmodelled', extensions: ['cob', 'cbl', 'cpy'] },
  { name: 'MATLAB/Objective-C', tier: 'unmodelled', extensions: ['m'] },
] as const;

const SOURCE_EXTENSION_PATTERN = new RegExp(
  `\\.(${SOURCE_LANGUAGES.flatMap((language) => language.extensions).join('|')})$`,
  'i',
);

const SOURCE_EXTENSION_PATTERN_V10 = new RegExp(
  `\\.(${SOURCE_LANGUAGES_V10.flatMap((language) => language.extensions).join('|')})$`,
  'i',
);

export function isRecognizedSourcePath(
  path: string,
  rubricVersion = WITAN_RUBRIC_VERSION,
): boolean {
  return (
    rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
      ? SOURCE_EXTENSION_PATTERN_V10
      : SOURCE_EXTENSION_PATTERN
  ).test(path);
}
// Packaged/bundled binary artifacts a closed or docs-only distribution repo ships instead of
// source — e.g. a VS Code extension .vsix, an npm tarball, a compiled binary/installer.
const BUNDLED_BINARY_EXTENSION_PATTERN =
  /\.(vsix|zip|tgz|whl|exe|dmg|pkg|msi|jar|war|apk|ipa|dll|dylib|ttf|otf|woff2?|eot|eps)$/i;

const DOCS_OR_MEDIA_EXTENSION_PATTERN = /\.(md|mdx|rst|png|jpe?g|gif|svg|webp|ico|pdf)$/i;
const ARTIFACT_DOMINANCE_EXTENSION_PATTERN =
  /\.(vsix|zip|tgz|whl|exe|dmg|pkg|msi|jar|war|apk|ipa|dll|dylib|ttf|otf|woff2?|eot|eps|png|jpe?g|gif|svg|webp|ico|pdf)$/i;
const DOC_DISTRIBUTION_COMPANION_PATTERN =
  /(^|\/)(LICENSE|LICENCE|NOTICE|COPYING|AUTHORS|CONTRIBUTORS|CODE_OF_CONDUCT)(\.[A-Za-z0-9]+)?$/i;
const GENERATED_OR_VENDOR_PATH_PATTERN =
  /(^|\/)(vendor|vendors|dist|build|generated|gen|coverage|node_modules|site-packages|\.venv|venv|\.next|__pycache__|\.terraform|public\/assets|static\/assets)(\/|$)|(^|\/)[^/]+\.min\.(?:js|css)$/i;
const V17_BUILD_OR_DEPENDENCY_CACHE_PATH_PATTERN =
  /(^|\/)(?:target|_build|\.build|DerivedData|Pods|Carthage\/Build|\.cache|\.gradle|\.m2|\.yarn\/cache|\.pnpm-store|\.dart_tool|\.tox|\.pytest_cache|\.ruff_cache|\.mypy_cache|\.turbo|\.parcel-cache|\.angular\/cache|\.svelte-kit|\.nuxt|bazel-(?:bin|out|testlogs)|buck-out)(\/|$)/i;
const INDEPENDENT_CATALOG_PATH_PATTERN =
  /(^|\/)(solutions?|exercises?|challenges?|algorithms?)(\/|$)/i;

// Non-source, non-docs, non-binary files cejel already reads meaning from without needing to
// recognise a programming language: manifests, lockfiles, structured config, and dotfiles that
// are common to legitimate repos in ANY language (including ones whose source cejel does not
// recognise). Kept deliberately broad so a Python sub-package that is only a requirements.txt +
// lockfile slice, or a repo with nothing but a README + LICENSE, stays the existing ambiguous
// 'source' default rather than being misread as an unrecognised-language repo — the class of
// false-positive this pattern exists to prevent (goal_cejel_language_calibration_2026-07-12).
const KNOWN_NON_SOURCE_EXTENSION_PATTERN =
  /\.(json|jsonc|json5|ya?ml|toml|txt|lock|xml|csv|tsv|ini|cfg|conf|cnf|properties|env|sum|mod|graphql|gql|proto|sarif|editorconfig|gitignore|gitattributes|npmrc|nvmrc|dockerignore|prettierignore|prettierrc|log|stderr|snap|grit|po|mo|dbf|shp|shx|egg|pem|key|csr|ai|txt\.license|pf|in|case|common|fortls)$/i;

// V42 review exposed that the broad unknown-extension fallback was also treating compiled,
// compressed, certificate, patch, project-metadata, resource, and domain-data artifacts as
// source. V13 narrows only those positive non-source families. Readable uncommon code stays
// source-shaped through either the canonical language table (COBOL/MATLAB) or the conservative
// unknown-extension fallback (for example JCL, TeX, and template languages).
const V13_NON_SOURCE_EXTENSION_PATTERN =
  /\.(?:\d+|class|py[co]|gz|bz2|xz|7z|rar|mat|npy|npz|h5|hdf5|onnx|pt|pth|ckpt|safetensors|crt|cer|der|p12|pfx|diff|patch|plist|pbxproj|xcworkspacedata|xcbuild|xcplayground|xcscheme|xcsettings|xcconfig|xcprivacy|xcstrings|csproj|fsproj|vbproj|sln|slnf|props|targets|projitems|shproj|pubxml|resw|resources|storyboard|xib|entitlements|modulemap|podspec|nuspec|appxmanifest|webmanifest|manifest|map|fls|aux|bbl|bib|ocm|tdb|db|sqlite|sqlcipher\d*|bin|dat|pdb|prj|resolved|sim|input|list|fig|drawio|puml|sketch|icns|flac|wav|mp3|mp4|mov|avi|mkv|nv21|xls[xb]?|mex[a-z0-9_]*|gitconfig|profile|yapf|config|desktop|typed|example|bak|_|test(?:_[a-z0-9]+)*_location_override|xamltest|tld(?:_[a-z0-9]+)?|xsd|cmake|gradle|mk|am|pro|upri|dockerfile|dockergen|makefile|alpine|android|debian|ubuntu\d+|cuda\d+_ubuntu\d+|manylinux[a-z0-9_]*)$/i;

const INGEST_POINTER =
  'To assess a closed/bundled tool, ingest its scanner output via --ingest <sarif|scorecard>.';

// The dominance threshold calibrated against docs/calibration/archetype-ratio-golden-set.md
// (goal_cejel_archetype_dominance_not_presence_2026-07-15) — committed in an EARLIER commit
// than this constant (Guard 5 in repo-archetype.test.ts checks that ordering). At least this
// fraction of a repository's source-shaped files (recognised + unrecognised-language) must be
// in a language cejel recognises for a score to be meaningful. The golden set's upper anchor
// (50% recognised, one stray COBOL file next to one TS file) must stay 'source'; the golden
// set's motivating case (carddemo, ~2.7-3.6% recognised depending on denominator) must abstain.
// Any number in a wide middle band satisfies both, which is the point: this was not reverse-
// engineered from carddemo's file count.
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V8 = 0.2;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V9 = 0.8;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V10 = 0.5;
const SOURCE_DOMINANCE_RATIO_THRESHOLD_V11 = 0.2;
const V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD = 0.2;

// V26 structural-abstention thresholds are frozen prospectively against the synthetic boundary
// matrix in free-core-v26-detector-regressions.test.ts and documented in the v26 remediation
// specification. They are deliberately count + ratio + remainder rules: no one small directory
// or ordinary generated client is enough to suppress a headline score.
const GENERATED_SOURCE_MINIMUM = 8;
const GENERATED_SOURCE_RATIO_THRESHOLD = 0.8;
const GENERATED_AUTHORED_MAXIMUM = 3;
const CATALOG_SOURCE_MINIMUM = 12;
const CATALOG_SOURCE_RATIO_THRESHOLD = 0.9;
const CATALOG_OUTSIDE_MAXIMUM = 2;

export function classifyRepoArchetype(
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): RepoArchetypeClassification {
  const totalFileCount = repoFiles.length;
  const sourceFiles = repoFiles.filter((path) => isRecognizedSourcePath(path, rubricVersion));
  const sourceFileCount = sourceFiles.length;

  if (totalFileCount === 0) {
    return {
      archetype: 'empty',
      sourceFileCount: 0,
      totalFileCount: 0,
      abstentionKind: 'empty',
      insufficientSourceReason: 'Repository has no tracked files — there is nothing to certify.',
    };
  }

  const generatedSourceFiles = sourceFiles.filter((file) =>
    GENERATED_OR_VENDOR_PATH_PATTERN.test(file),
  );
  if (
    sourceFileCount >= GENERATED_SOURCE_MINIMUM &&
    generatedSourceFiles.length / sourceFileCount >= GENERATED_SOURCE_RATIO_THRESHOLD &&
    sourceFileCount - generatedSourceFiles.length <= GENERATED_AUTHORED_MAXIMUM
  ) {
    return {
      archetype: 'generated_only',
      sourceFileCount,
      totalFileCount,
      abstentionKind: 'generated_only',
      insufficientSourceReason:
        `${generatedSourceFiles.length} of ${sourceFileCount} source-shaped file(s) are under generated, vendor, build, distribution, coverage, or bundled-asset paths; only ${sourceFileCount - generatedSourceFiles.length} authored source-shaped file(s) remain. ` +
        `Cejel abstains because generated/vendor output is not a reviewable implementation surface. ${INGEST_POINTER}`,
    };
  }

  const catalogSourceFiles = sourceFiles.filter((file) =>
    INDEPENDENT_CATALOG_PATH_PATTERN.test(file),
  );
  if (
    sourceFileCount >= CATALOG_SOURCE_MINIMUM &&
    catalogSourceFiles.length / sourceFileCount >= CATALOG_SOURCE_RATIO_THRESHOLD &&
    sourceFileCount - catalogSourceFiles.length <= CATALOG_OUTSIDE_MAXIMUM
  ) {
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount,
      totalFileCount,
      abstentionKind: 'independent_catalog',
      insufficientSourceReason:
        `${catalogSourceFiles.length} of ${sourceFileCount} source-shaped file(s) are under independent solution, exercise, challenge, or algorithm catalog paths; only ${sourceFileCount - catalogSourceFiles.length} source-shaped file(s) remain outside that catalog. ` +
        `Cejel abstains because the repository does not expose one cohesive product implementation to score. ${INGEST_POINTER}`,
    };
  }

  // Generated trees and independent source catalogs have stronger, already-frozen structural
  // meanings than the v11 docs/artifact refinements. Evaluate them first so incidental media in
  // either archetype cannot relabel the repository and silently change the reason for abstention.
  if (
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
  ) {
    const authoredSourceFiles = sourceFiles.filter(isAuthoredProductionPath);
    const documentationFiles = repoFiles.filter((file) =>
      DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file),
    );
    if (sourceFileCount > 0 && authoredSourceFiles.length === 0 && documentationFiles.length > 0) {
      return {
        archetype: 'docs_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'docs_source_role',
        insufficientSourceReason:
          `${sourceFileCount} source-shaped file(s) are tests/fixtures around a documentation tree; no authored product source remains. ` +
          `Cejel abstains because documentation tests do not support a product-source headline score. ${INGEST_POINTER}`,
      };
    }

    const artifactFiles = repoFiles.filter((file) =>
      ARTIFACT_DOMINANCE_EXTENSION_PATTERN.test(file),
    );
    const materialFiles = authoredSourceFiles.length + artifactFiles.length;
    if (
      artifactFiles.length >= 10 &&
      (authoredSourceFiles.length <= 10 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
        rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
        usesV17DetectorClosure(rubricVersion)) &&
      materialFiles > 0 &&
      authoredSourceFiles.length / materialFiles <= 0.1
    ) {
      return {
        archetype: 'binary_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'artifact_dominance',
        insufficientSourceReason:
          `${authoredSourceFiles.length} authored source-shaped file(s) accompany ${artifactFiles.length} packaged, font, image, or media artifact(s); the source is sparse tooling rather than a representative product implementation. ` +
          `Cejel abstains because incidental tooling cannot support a product-source headline score. ${INGEST_POINTER}`,
      };
    }
  }

  // Files with an extension that is not recognised source, not docs/media, not a bundled
  // binary, and not one of the manifest/lockfile/config extensions common to every ecosystem —
  // i.e. files that LOOK like implementation in some language, just not one cejel reads.
  // Computed unconditionally (goal_cejel_archetype_dominance_not_presence_2026-07-15): this
  // used to be reachable only when sourceFileCount === 0; it is now also the competing signal
  // the dominance ratio below weighs recognised source against.
  const unrecognisedSourceFiles = collectUnrecognisedSourceFiles(repoFiles, rubricVersion);

  if (sourceFileCount === 0) {
    // Only classify as insufficient-source when there is positive evidence of a docs or
    // bundled-binary distribution tree.
    const binaryFiles = repoFiles.filter((file) => BUNDLED_BINARY_EXTENSION_PATTERN.test(file));
    if (binaryFiles.length > 0) {
      const sample = binaryFiles[0];
      return {
        archetype: 'binary_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'binary_distribution',
        insufficientSourceReason:
          `${sourceFileCount} source file(s) found among ${totalFileCount} tracked file(s); repo` +
          ` appears to be a binary/bundled-distribution tree (e.g. ${sample ? basename(sample) : 'a packaged artifact'})` +
          ` — cejel rates source, not binaries. ${INGEST_POINTER}`,
      };
    }

    const docsFiles = repoFiles.filter((file) => DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file));
    const docsDistributionFiles = repoFiles.filter(
      (file) =>
        DOCS_OR_MEDIA_EXTENSION_PATTERN.test(file) || DOC_DISTRIBUTION_COMPANION_PATTERN.test(file),
    );
    if (
      docsFiles.length > 0 &&
      (docsDistributionFiles.length === totalFileCount ||
        ((rubricVersion === WITAN_RUBRIC_VERSION_V9 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V10 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
          rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
          usesV17DetectorClosure(rubricVersion)) &&
          unrecognisedSourceFiles.length === 0))
    ) {
      return {
        archetype: 'docs_only',
        sourceFileCount,
        totalFileCount,
        abstentionKind: 'docs_distribution',
        insufficientSourceReason: `${sourceFileCount} source file(s) found among ${totalFileCount} tracked file(s); repo appears to be a docs/distribution tree (README/markdown/media), not a source tree — cejel rates source, not docs. ${INGEST_POINTER}`,
      };
    }

    // 'unrecognised_ecosystem' (goal_cejel_language_calibration_2026-07-12): positive evidence
    // of a source tree written in a language cejel does not recognise. This is deliberately
    // narrower than "sourceFileCount === 0": a repo whose only files are requirements.txt +
    // poetry.lock, or README.md + LICENSE, has zero candidate files under this check (both
    // extensions are in the known-non-source allow-list, or have no extension at all) and stays
    // the existing ambiguous 'source' default — see the two regression cases in
    // repo-archetype.test.ts this branch must not disturb.
    if (unrecognisedSourceFiles.length > 0) {
      return unrecognisedEcosystemResult(
        sourceFileCount,
        totalFileCount,
        unrecognisedSourceFiles,
        sourceDominanceThreshold(rubricVersion),
      );
    }

    return { archetype: 'source', sourceFileCount, totalFileCount };
  }

  // sourceFileCount > 0: recognised source exists. A repo with no competing unrecognised-
  // language signal at all is completely unaffected by this goal — same 'source'/'monorepo'
  // outcome as before goal_cejel_archetype_dominance_not_presence_2026-07-15.
  if (unrecognisedSourceFiles.length === 0) {
    return {
      archetype: isLikelyMonorepo(repoFiles) ? 'monorepo' : 'source',
      sourceFileCount,
      totalFileCount,
    };
  }

  // A competing unrecognised-language signal exists — is recognised source DOMINANT, or merely
  // incidental (carddemo's nine deploy scripts among 329 mostly-COBOL files)? Golden set:
  // docs/calibration/archetype-ratio-golden-set.md.
  const dominanceRatio = sourceFileCount / (sourceFileCount + unrecognisedSourceFiles.length);
  const dominanceThreshold = sourceDominanceThreshold(rubricVersion);
  if (dominanceRatio >= dominanceThreshold) {
    return {
      archetype: isLikelyMonorepo(repoFiles) ? 'monorepo' : 'source',
      sourceFileCount,
      totalFileCount,
    };
  }

  return unrecognisedEcosystemResult(
    sourceFileCount,
    totalFileCount,
    unrecognisedSourceFiles,
    dominanceThreshold,
  );
}

const READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13 = 0.8;
const READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13 = 32;
const READABLE_SOURCE_REPRESENTATION_FILE_BYTES_V13 = 256 * 1024;
const SEMANTIC_AUXILIARY_SOURCE_MINIMUM_V14 = 20;
const SEMANTIC_AUXILIARY_SOURCE_RATIO_V14 = 0.8;
const SEMANTIC_METADATA_PREFIX_BYTES_V14 = 16 * 1024;
const SEMANTIC_AUXILIARY_PATH_PATTERN_V14 =
  /(^|\/)(?:locales?|i18n|l10n|translations?|styles?|themes?)(\/|$)|\.(?:css|scss|sass|less|styl)$/i;
const HTML_SOURCE_EXTENSION_PATTERN = /\.(?:html?|xhtml)$/i;
const HTML_META_REFRESH_PATTERN =
  /<meta\b(?=[^>]*\bhttp-equiv\s*=\s*["']?\s*refresh\b)(?=[^>]*\bcontent\s*=\s*["'][^"']*\burl\s*=)[^>]*>/i;
const RUBY_PACKAGE_RECIPE_CLASS_PATTERN = /\bclass\s+[A-Za-z0-9_:]+\s*<\s*(?:Formula|Cask)\b/;
const RUBY_PACKAGE_RECIPE_URL_PATTERN = /^\s*url\s+["'][^"']+["']/m;
const RUBY_PACKAGE_RECIPE_PATH_PATTERN = /(^|\/)(?:Formula|Casks?)(\/|$)/;

interface RepresentativeSourceGroup {
  extension: string;
  files: string[];
  allocation: number;
  remainder: number;
}

/**
 * Deterministically apportions a bounded sample across source-extension families using Hamilton
 * (largest-remainder) allocation. Unlike extension round-robin, the returned sample preserves
 * the corpus mix: a dominant family receives a dominant share while material minorities remain
 * visible. The caller supplies a sealed rank key; repository paths never enter the decision.
 */
export function selectProportionalRepresentativeSourceFiles(
  files: readonly string[],
  rankKey: string,
  limit: number,
): string[] {
  const eligibleFiles = [...new Set(files)];
  const slotCount = Math.min(Math.max(Math.floor(limit), 0), eligibleFiles.length);
  if (slotCount === 0) return [];

  const grouped = new Map<string, string[]>();
  for (const file of eligibleFiles) {
    const extension = extname(file).toLowerCase() || '(none)';
    const bucket = grouped.get(extension) ?? [];
    bucket.push(file);
    grouped.set(extension, bucket);
  }

  const groups: RepresentativeSourceGroup[] = [...grouped.entries()]
    .map(([extension, groupFiles]) => {
      const quota = (groupFiles.length / eligibleFiles.length) * slotCount;
      return {
        extension,
        files: [...groupFiles].sort((left, right) =>
          representativeSourceRank(rankKey, left).localeCompare(
            representativeSourceRank(rankKey, right),
          ),
        ),
        allocation: Math.floor(quota),
        remainder: quota - Math.floor(quota),
      };
    })
    .sort(
      (left, right) =>
        right.files.length - left.files.length || left.extension.localeCompare(right.extension),
    );

  let remaining = slotCount - groups.reduce((sum, group) => sum + group.allocation, 0);
  const remainderOrder = [...groups].sort(
    (left, right) =>
      right.remainder - left.remainder ||
      right.files.length - left.files.length ||
      left.extension.localeCompare(right.extension),
  );
  for (const group of remainderOrder) {
    if (remaining === 0) break;
    if (group.allocation >= group.files.length) continue;
    group.allocation += 1;
    remaining -= 1;
  }

  const selected: string[] = [];
  for (let offset = 0; selected.length < slotCount; offset += 1) {
    let added = false;
    for (const group of groups) {
      if (offset >= group.allocation) continue;
      const file = group.files[offset];
      if (!file) continue;
      selected.push(file);
      added = true;
    }
    if (!added) break;
  }
  return selected;
}

export function isRepresentativeSourceText(contents: string): boolean {
  if (contents.trim().length === 0) return false;
  if (contents.includes('\u0000') || contents.includes('\uFFFD')) return false;
  let disallowedControls = 0;
  for (const character of contents) {
    const code = character.charCodeAt(0);
    if (code < 32 && character !== '\n' && character !== '\r' && character !== '\t') {
      disallowedControls += 1;
    }
  }
  return disallowedControls / contents.length <= 0.01;
}

function representativeSourceRank(rankKey: string, file: string): string {
  return createHash('sha256').update(`${rankKey}:${file}`).digest('hex');
}

export interface ReviewableSourceProof {
  sourceShapedFileCount: number;
  eligibleSourceFileCount: number;
  sampledFileCount: number;
  readableSampledFileCount: number;
  firstReadablePath?: string;
  passes: boolean;
}

export function buildV17ReviewableSourceProof(
  repoPath: string,
  repoFiles: readonly string[],
): ReviewableSourceProof {
  return buildReviewableSourceProof(
    repoPath,
    listRepoInventory(repoPath, repoFiles),
    readGitHead(repoPath),
    WITAN_RUBRIC_VERSION_V17,
  );
}

/**
 * Adds repository-specific arithmetic to v17/v18's zero-measurement abstention.
 *
 * This is presentation context only: the scorer has already decided to abstain because no
 * free-core criterion was measurable. Re-deriving the existing v17 reviewable-source proof
 * here explains why a source-shaped repository did not establish a criterion-ratable surface;
 * it does not alter classification, findings, scores, or the calibrated detector closure.
 */
export function explainNoMeasurementSourceCoverage(
  repoPath: string,
  rubricVersion: string,
): string | undefined {
  if (!usesV17DetectorClosure(rubricVersion)) return undefined;

  const repoFiles = listRepoFiles(repoPath);
  const inventoryFiles = listRepoInventory(repoPath, repoFiles);
  const proof = buildReviewableSourceProof(
    repoPath,
    inventoryFiles,
    readGitHead(repoPath),
    rubricVersion,
  );
  if (proof.sourceShapedFileCount === 0) return undefined;

  const ratableShare = proof.eligibleSourceFileCount / proof.sourceShapedFileCount;
  if (ratableShare >= V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD) return undefined;

  const ratablePct = (ratableShare * 100).toFixed(1);
  const thresholdPct = (V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD * 100).toFixed(0);
  return (
    `${WITAN_NO_MEASUREMENT_REASON} Source coverage: ` +
    `${proof.eligibleSourceFileCount} of ${proof.sourceShapedFileCount} source-shaped files ` +
    `(${ratablePct}%) are criterion-ratable, below the ${thresholdPct}% reviewable-source ` +
    `threshold (${inventoryFiles.length} tracked files in total).`
  );
}

function buildReviewableSourceProof(
  repoPath: string,
  repoFiles: readonly string[],
  headSha: string | null,
  rubricVersion: string,
): ReviewableSourceProof {
  const sourceShapedFiles = repoFiles.filter(
    (path) =>
      isRecognizedSourcePath(path, rubricVersion) ||
      isUnrecognisedSourcePath(path, rubricVersion) ||
      /\.ipynb$/i.test(path),
  );
  const eligibleSourceFiles = sourceShapedFiles.filter(
    (path) =>
      !GENERATED_OR_VENDOR_PATH_PATTERN.test(path) &&
      !V17_BUILD_OR_DEPENDENCY_CACHE_PATH_PATTERN.test(path) &&
      (SOURCE_EXTENSION_PATTERN.test(path) || /\.m$/i.test(path)),
  );
  const sample = selectProportionalRepresentativeSourceFiles(
    eligibleSourceFiles,
    `witan-v17-reviewable-source:${headSha ?? 'unversioned'}`,
    READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13,
  );
  const readablePaths = sample.filter((file) => {
    const contents = readRepresentativeSourceText(repoPath, file);
    return contents !== null && isRepresentativeSourceText(contents);
  });
  const ratableShare =
    sourceShapedFiles.length === 0 ? 0 : eligibleSourceFiles.length / sourceShapedFiles.length;
  const readableShare = sample.length === 0 ? 0 : readablePaths.length / sample.length;

  return {
    sourceShapedFileCount: sourceShapedFiles.length,
    eligibleSourceFileCount: eligibleSourceFiles.length,
    sampledFileCount: sample.length,
    readableSampledFileCount: readablePaths.length,
    ...(readablePaths[0] ? { firstReadablePath: readablePaths[0] } : {}),
    passes:
      eligibleSourceFiles.length > 0 &&
      ratableShare >= V17_REVIEWABLE_SOURCE_RATABLE_SHARE_THRESHOLD &&
      readablePaths.length > 0 &&
      (readableShare >= 0.75 || readablePaths.length >= 8),
  };
}

function applyReadableSourceRepresentationGate(
  repoPath: string,
  repoFiles: readonly string[],
  classification: RepoArchetypeClassification,
  headSha: string | null,
  rubricVersion: string,
): RepoArchetypeClassification {
  if (classification.archetype !== 'source' && classification.archetype !== 'monorepo') {
    return classification;
  }

  const authoredSourceFiles = repoFiles.filter(
    (path) =>
      isAuthoredProductionPath(path) &&
      (isRecognizedSourcePath(path, rubricVersion) ||
        isUnrecognisedSourcePath(path, rubricVersion) ||
        /\.ipynb$/i.test(path)),
  );
  if (authoredSourceFiles.length === 0) return classification;

  const sample = selectProportionalRepresentativeSourceFiles(
    authoredSourceFiles,
    `witan-v13-readable-source:${headSha ?? 'unversioned'}`,
    READABLE_SOURCE_REPRESENTATION_SAMPLE_LIMIT_V13,
  );
  const sampledByExtension = new Map<string, { sampled: number; readable: number }>();
  for (const file of sample) {
    const extension = extname(file).toLowerCase() || '(none)';
    const counts = sampledByExtension.get(extension) ?? { sampled: 0, readable: 0 };
    counts.sampled += 1;
    const contents = readRepresentativeSourceText(repoPath, file);
    if (contents !== null && isRepresentativeSourceText(contents)) {
      counts.readable += 1;
    }
    sampledByExtension.set(extension, counts);
  }

  const sourceCountByExtension = new Map<string, number>();
  for (const file of authoredSourceFiles) {
    const extension = extname(file).toLowerCase() || '(none)';
    sourceCountByExtension.set(extension, (sourceCountByExtension.get(extension) ?? 0) + 1);
  }
  const readableSourceFileCount = [...sourceCountByExtension.entries()].reduce(
    (total, [extension, sourceCount]) => {
      const sampled = sampledByExtension.get(extension);
      if (!sampled || sampled.sampled === 0) return total;
      return total + sourceCount * (sampled.readable / sampled.sampled);
    },
    0,
  );
  const readableRatio = readableSourceFileCount / authoredSourceFiles.length;
  if (readableRatio >= READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13) return classification;

  const readableCountLabel = Number.isInteger(readableSourceFileCount)
    ? String(readableSourceFileCount)
    : readableSourceFileCount.toFixed(2);
  const readablePct = (readableRatio * 100).toFixed(1);
  const thresholdPct = (READABLE_SOURCE_REPRESENTATION_THRESHOLD_V13 * 100).toFixed(0);
  return {
    archetype: 'non_cohesive_source',
    sourceFileCount: classification.sourceFileCount,
    totalFileCount: classification.totalFileCount,
    abstentionKind: 'readable_representation',
    insufficientSourceReason:
      `Readable source representation covers ${readableCountLabel} of ${authoredSourceFiles.length} authored source-shaped file(s) (${readablePct}%); this is below the ${thresholdPct}% representation threshold. ` +
      `Cejel abstains because unreadable, compressed, binary-shaped, or opaque source families cannot support a representative headline score. ${INGEST_POINTER}`,
  };
}

function applySemanticSourceRepresentationGate(
  repoPath: string,
  repoFiles: readonly string[],
  classification: RepoArchetypeClassification,
  rubricVersion: string,
): RepoArchetypeClassification {
  if (classification.archetype !== 'source' && classification.archetype !== 'monorepo') {
    return classification;
  }

  const authoredSourceFiles = repoFiles.filter(
    (path) =>
      isAuthoredProductionPath(path) &&
      (isRecognizedSourcePath(path, rubricVersion) ||
        isUnrecognisedSourcePath(path, rubricVersion) ||
        /\.ipynb$/i.test(path)),
  );
  if (authoredSourceFiles.length === 0) return classification;

  const auxiliaryFiles = authoredSourceFiles.filter((path) =>
    SEMANTIC_AUXILIARY_PATH_PATTERN_V14.test(path),
  );
  const packageMetadataFiles = authoredSourceFiles.filter((path) =>
    isRubyPackageRecipeMetadataSource(repoPath, path),
  );
  const redirectMetadataFiles = authoredSourceFiles.filter((path) =>
    isHtmlRedirectMetadataSource(repoPath, path),
  );
  const auxiliarySet = new Set([
    ...auxiliaryFiles,
    ...packageMetadataFiles,
    ...redirectMetadataFiles,
  ]);
  const representativeImplementationCount = authoredSourceFiles.filter(
    (path) => !auxiliarySet.has(path),
  ).length;

  if (representativeImplementationCount === 0) {
    const detail =
      redirectMetadataFiles.length > 0
        ? `${redirectMetadataFiles.length} redirect metadata file(s)`
        : packageMetadataFiles.length > 0
          ? `${packageMetadataFiles.length} package metadata file(s)`
          : `${auxiliaryFiles.length} localization or style metadata file(s)`;
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount: classification.sourceFileCount,
      totalFileCount: classification.totalFileCount,
      abstentionKind: 'semantic_auxiliary',
      insufficientSourceReason:
        `${detail} provide no representative product implementation. ` +
        `Cejel abstains because auxiliary metadata or payload files cannot support a product-source headline score. ${INGEST_POINTER}`,
    };
  }

  const auxiliaryCount = auxiliarySet.size;
  const auxiliaryRatio = auxiliaryCount / authoredSourceFiles.length;
  if (
    authoredSourceFiles.length >= SEMANTIC_AUXILIARY_SOURCE_MINIMUM_V14 &&
    auxiliaryRatio >= SEMANTIC_AUXILIARY_SOURCE_RATIO_V14
  ) {
    return {
      archetype: 'non_cohesive_source',
      sourceFileCount: classification.sourceFileCount,
      totalFileCount: classification.totalFileCount,
      abstentionKind: 'semantic_auxiliary',
      insufficientSourceReason:
        `${auxiliaryCount} of ${authoredSourceFiles.length} authored source-shaped file(s) are localization, style, package, or redirect auxiliary material. ` +
        `Cejel abstains because an auxiliary-dominated tree does not expose representative product implementation for a headline score. ${INGEST_POINTER}`,
    };
  }

  return classification;
}

function isHtmlRedirectMetadataSource(repoPath: string, file: string): boolean {
  if (!HTML_SOURCE_EXTENSION_PATTERN.test(file)) return false;
  const contents = readSemanticMetadataPrefix(repoPath, file);
  if (contents === null) return false;
  const operativeContents = contents.replace(/<!--[\s\S]*?-->/g, '');
  if (!HTML_META_REFRESH_PATTERN.test(operativeContents)) return false;
  return !/<(?:script|form|main|article|section|canvas|template)\b/i.test(operativeContents);
}

function isRubyPackageRecipeMetadataSource(repoPath: string, file: string): boolean {
  if (!/\.rb$/i.test(file) || !RUBY_PACKAGE_RECIPE_PATH_PATTERN.test(file)) return false;
  const contents = readSemanticMetadataPrefix(repoPath, file);
  const operativeContents = contents?.replace(/^\s*#.*$/gm, '');
  return (
    operativeContents !== undefined &&
    RUBY_PACKAGE_RECIPE_CLASS_PATTERN.test(operativeContents) &&
    RUBY_PACKAGE_RECIPE_URL_PATTERN.test(operativeContents)
  );
}

function readSemanticMetadataPrefix(repoPath: string, file: string): string | null {
  const absolutePath = join(repoPath, file);
  if (!isRegularFile(absolutePath)) return null;
  return readRepoTextPrefix(absolutePath, SEMANTIC_METADATA_PREFIX_BYTES_V14);
}

function readRepresentativeSourceText(repoPath: string, file: string): string | null {
  const absolutePath = join(repoPath, file);
  try {
    if (!isRegularFile(absolutePath)) return null;
    const size = statSync(absolutePath).size;
    if (size === 0) return null;
    if (size > READABLE_SOURCE_REPRESENTATION_FILE_BYTES_V13) {
      recordContentSkip(absolutePath, 'too_large', true);
      return null;
    }
    return readRepoText(absolutePath, 'utf8');
  } catch (error: unknown) {
    recordFilesystemSkip(absolutePath, error, false, true);
    return null;
  }
}

function sourceDominanceThreshold(rubricVersion: string): number {
  if (
    rubricVersion === WITAN_RUBRIC_VERSION_V11 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V12 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
    rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
    usesV17DetectorClosure(rubricVersion)
  ) {
    return SOURCE_DOMINANCE_RATIO_THRESHOLD_V11;
  }
  if (rubricVersion === WITAN_RUBRIC_VERSION_V10) return SOURCE_DOMINANCE_RATIO_THRESHOLD_V10;
  if (rubricVersion === WITAN_RUBRIC_VERSION_V9) return SOURCE_DOMINANCE_RATIO_THRESHOLD_V9;
  return SOURCE_DOMINANCE_RATIO_THRESHOLD_V8;
}

function collectUnrecognisedSourceFiles(
  repoFiles: readonly string[],
  rubricVersion: string,
): string[] {
  return repoFiles.filter((path) => isUnrecognisedSourcePath(path, rubricVersion));
}

export function isUnrecognisedSourcePath(
  file: string,
  rubricVersion = WITAN_RUBRIC_VERSION,
): boolean {
  const base = basename(file);
  if (!/\.([a-zA-Z0-9_]+)$/.test(base)) return false;
  if (KNOWN_NON_SOURCE_EXTENSION_PATTERN.test(base)) return false;
  if (
    (rubricVersion === WITAN_RUBRIC_VERSION_V13 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V14 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V15 ||
      rubricVersion === WITAN_RUBRIC_VERSION_V16 ||
      usesV17DetectorClosure(rubricVersion)) &&
    V13_NON_SOURCE_EXTENSION_PATTERN.test(base)
  ) {
    return false;
  }
  if (DOCS_OR_MEDIA_EXTENSION_PATTERN.test(base)) return false;
  if (BUNDLED_BINARY_EXTENSION_PATTERN.test(base)) return false;
  if (isRecognizedSourcePath(base, rubricVersion)) return false;
  return true;
}

// Ranked by how many files carry each extension, most-common first (ties broken
// alphabetically) — the reason should name the DOMINANT unrecognised language(s), not
// whichever extension happens to sort first alphabetically among a long tail of one-off
// mainframe-toolchain formats.
function extensionsByFileCountDescending(files: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const file of files) {
    const match = /\.([a-zA-Z0-9_]+)$/.exec(basename(file));
    const ext = match?.[1];
    if (!ext) continue;
    const key = `.${ext.toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([extA, countA], [extB, countB]) => countB - countA || extA.localeCompare(extB))
    .map(([ext]) => ext);
}

function unrecognisedEcosystemResult(
  sourceFileCount: number,
  totalFileCount: number,
  unrecognisedSourceFiles: readonly string[],
  dominanceThreshold = SOURCE_DOMINANCE_RATIO_THRESHOLD_V9,
): RepoArchetypeClassification {
  const sample = extensionsByFileCountDescending(unrecognisedSourceFiles).slice(0, 6).join(', ');
  // The reason must name the real numbers (Guard 6) — never a bare verdict — whether recognised
  // source is entirely absent (sourceFileCount === 0, the pre-existing case) or merely
  // incidental (sourceFileCount > 0 but non-dominant, carddemo's shape).
  //
  // And it must name the OPERATIVE numbers. The decision at classifyRepoArchetype divides by
  // `sourceFileCount + unrecognisedSourceFiles.length` — source-shaped files only, because
  // manifests, docs, media and bundled binaries carry no language signal on either side. An
  // earlier draft of this string published `sourceFileCount / totalFileCount` instead, so
  // carddemo's row read "9 of 329 (2.7%)" while the threshold had actually been applied to
  // 9-of-248 (3.6%) — a published figure that was true, and was not the one that decided the
  // verdict. Both are far below the threshold here, so the outcome was right by luck; a
  // repository at 25% of tracked files and 15% of source-shaped files would have abstained
  // while its reason cited 25%, visibly contradicting its own verdict. A reported metric must
  // reconcile to the inputs of the decision it explains.
  const candidateCount = sourceFileCount + unrecognisedSourceFiles.length;
  const dominancePct =
    candidateCount > 0 ? ((sourceFileCount / candidateCount) * 100).toFixed(1) : '0.0';
  const thresholdPct = (dominanceThreshold * 100).toFixed(0);
  const measuredClause =
    sourceFileCount > 0
      ? `${sourceFileCount} of ${candidateCount} source-shaped file(s) (${dominancePct}%) are in a language Cejel reads — below the ${thresholdPct}% dominance threshold a score would need to be meaningful (${totalFileCount} tracked files in total; manifests, lockfiles, docs, media and bundled binaries are excluded from both sides of the ratio)`
      : `0 of ${totalFileCount} tracked file(s) matched a recognised source extension`;
  return {
    archetype: 'unrecognised_ecosystem',
    sourceFileCount,
    totalFileCount,
    abstentionKind: 'unrecognised_ecosystem',
    insufficientSourceReason: `Cejel does not yet read this repository's dominant source language(s) (${sample}) — ${measuredClause}. Cejel abstains from a verdict rather than score a repository whose recognised source is incidental rather than dominant; the Criterion Profile and Measured coverage below show exactly which dimensions were and were not measured. ${INGEST_POINTER}`,
  };
}

function isLikelyMonorepo(repoFiles: readonly string[]): boolean {
  const packageRoots = new Set(
    repoFiles
      .filter((file) => /(^|\/)package\.json$/.test(file))
      .map((file) => (file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '')),
  );
  return packageRoots.size >= 2;
}

// M1 (Phase 3): a nonexistent path previously surfaced as a raw Node ENOENT stack trace
// (or, combined with the visitRepoDir hardening above, would have silently scored an
// empty repo). Fail fast with a clear, actionable message instead.
function assertRepoPathExists(repoPath: string): void {
  let stats: ReturnType<typeof statSync>;
  try {
    stats = statSync(repoPath);
  } catch {
    throw new Error(`Cejel: path not found: ${repoPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Cejel: path is not a directory: ${repoPath}`);
  }
}

function explainIgnoredScanTarget(repoPath: string): string | undefined {
  const topResult = execGit(['rev-parse', '--show-toplevel'], { cwd: repoPath });
  if (!topResult.ok) {
    if (isExpectedGitAbsence(topResult)) return undefined;
    throw new Error(describeGitFailure(topResult.reason, 'repository-root discovery'));
  }
  const top = topResult.stdout.trim();
  if (!top) return undefined;

  const topResolved = realpathSync(top);
  const targetResolved = realpathSync(repoPath);
  const target = relative(topResolved, targetResolved).split(sep).join('/');
  if (!target || target.startsWith('../')) return undefined;
  const ignored = execGit(['check-ignore', '--quiet', '--', `${target}/`], {
    cwd: topResolved,
  });
  if (!ignored.ok) {
    if (
      isExpectedGitAbsence(ignored) ||
      (ignored.reason === 'exec_failed' && ignored.exitCode === 1)
    ) {
      return undefined;
    }
    throw new Error(describeGitFailure(ignored.reason, 'ignore-rule check'));
  }
  return `The requested scan path (${target}) is excluded by this repository's Git ignore rules, so Cejel found no tracked source to evaluate. Scan a tracked project or intentionally add the path to version control; Cejel abstains rather than score an ignored or vendored working tree.`;
}

// Exported (along with isRegularFile/fileContains/evidenceForRelative below) as the small
// generic toolkit a WitanDomainSignalCollector implementation builds on.
export function buildNotApplicableSignal(
  criterionId: WitanCriterionSignalPayload['criterionId'],
  reason: string,
): WitanCriterionSignalPayload {
  return {
    criterionId,
    positiveEvidence: [],
    findings: [],
    metrics: [],
    notes: reason,
    notApplicable: true,
  };
}

function collectRepoSignals(
  repoPath: string,
  generatedAt: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors: boolean,
  useV18NativeRls: boolean,
  useV19CommitYear: boolean,
  useV20A3ExplicitGaps: boolean,
  useV21ExecutedEscalations: boolean,
  reviewableSourceProof?: ReviewableSourceProof,
  scanLimitations: Set<string> = new Set(),
): WitanCriterionSignalPayload[] {
  const signals: WitanCriterionSignalPayload[] = [];
  // Monorepo root shared-config (lockfile/CI/dep-update) that governs a sub-package
  // scan; null when scanning a standalone repo or the git root (byte-identical there).
  const mono = resolveMonorepoContext(repoPath, scanLimitations);
  const collectCriterion = <T>(criterionId: WitanCriterionId, collect: () => T): T =>
    withContentReadCriterion(criterionId, collect);
  const a1Signal = collectCriterion('A1', () =>
    collectA1TestIntegrityEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV33Detectors,
      useV36Detectors,
      reviewableSourceProof,
    ),
  );
  const a2Signal = collectCriterion('A2', () =>
    collectA2IsolationEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV33Detectors,
      useV36Detectors,
      useV39Detectors,
      useV47Detectors,
      useV18NativeRls,
      scanLimitations,
    ),
  );
  const a3Signal = collectCriterion('A3', () =>
    collectA3ProdReadinessEvidence(
      repoPath,
      repoFiles,
      useV27Detectors,
      useV20A3ExplicitGaps,
    ),
  );
  const a4Signal = collectCriterion('A4', () =>
    collectA4DependencyEvidence(
      repoPath,
      repoFiles,
      mono,
      useV27Detectors,
      useV47Detectors,
    ),
  );
  const a5Signal = collectCriterion('A5', () =>
    collectA5ClaimRealityEvidence(repoPath, repoFiles, useV27Detectors),
  );
  const b1Signal = buildNotApplicableSignal(
    'B1',
    'Repository scans do not evaluate the dispatch-trace process dimension.',
  );
  const b2Signal = collectCriterion('B2', () => collectB2PrTraceEvidence(repoPath, repoFiles));
  const b3Signal = collectCriterion('B3', () =>
    collectB3CiDisciplineEvidence(repoPath, repoFiles, mono),
  );
  // B4 measures generic audit-trail hygiene (CHANGELOG/SECURITY/AUDIT/STATUS + docs
  // runbooks/incident/security notes) via collectB4AuditEvidence — this is NOT
  // substrate-specific, so it runs on external code too (found 2026-06-30: external
  // repos with a real SECURITY.md/CHANGELOG were being blanket-N/A'd). When a repo has
  // zero audit artifacts the collector returns an explicit not_applicable signal — that is
  // the honest state (no audit surface exists), distinct from a bare `null`, which
  // scoreCriterion now maps to insufficient_data (a measurement gap; also excluded from the
  // composite, but surfaced as unmeasured — see unmeasuredStatus in scoring.ts,
  // goal_cejel_b2_insufficient_data_not_zero_2026-07-10). The same not_applicable gate also
  // fires when the ONLY audit artifact present is a static security-policy document (e.g. a
  // lone SECURITY.md) — that is a disclosure notice, not an audit trail, and has no
  // freshness to rate (goal_cejel_b4_archetype_gate_2026-07-11; see
  // isFreshnessRatableAuditFile below).
  // Substrate repos hit the exact same collector, so their B4 score is unchanged.
  // The Alfred-only "report-up completeness" half is not yet a distinct signal; when it
  // is added, gate ONLY that half to substrate repos — never the generic audit-trail half.
  const b4Signal = collectCriterion('B4', () =>
    collectB4AuditEvidence(
      repoPath,
      repoFiles,
      generatedAt,
      useV19CommitYear,
      scanLimitations,
    ),
  );
  const b5Signal = buildNotApplicableSignal(
    'B5',
    'Repository scans do not evaluate the learning-trace process dimension.',
  );
  // B6 is a generic governance signal (not Alfred-specific) — runs on every repo archetype.
  const b6Signal = collectCriterion('B6', () =>
    collectB6PrivilegedOpsGatingEvidence(
      repoPath,
      repoFiles,
      useV39Detectors,
      useV21ExecutedEscalations,
    ),
  );

  for (const signal of [
    a1Signal,
    a2Signal,
    a3Signal,
    a4Signal,
    a5Signal,
    b1Signal,
    b2Signal,
    b3Signal,
    b4Signal,
    b5Signal,
    b6Signal,
  ]) {
    if (signal) signals.push(signal);
  }

  return signals;
}

function collectA1TestIntegrityEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  reviewableSourceProof?: ReviewableSourceProof,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const allTestFiles = findConcreteTestFiles(
    repoPath,
    repoFiles,
    reviewableSourceProof ? WITAN_RUBRIC_VERSION_V17 : undefined,
  );
  const testFiles = allTestFiles.slice(0, 8);
  const sourceFiles = repoFiles.filter(isSourceFile);
  const runnerFiles = repoFiles
    .filter(
      (file) =>
        (!useV27Detectors || isAuthoredProductionPath(file)) && isTestRunnerConfig(repoPath, file),
    )
    .slice(0, 6);
  const configuredRunnerFiles = useV33Detectors
    ? findConfiguredTestRunnerFiles(repoPath, repoFiles)
    : runnerFiles;
  const allCoverageFiles = findCoverageConfigFiles(repoPath, repoFiles, useV27Detectors);
  const coverageFiles = allCoverageFiles.slice(0, 4);
  const packageJson = findRootPackageJson(repoFiles);
  const packageScripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  const packageJsonFiles = useV27Detectors
    ? repoFiles.filter(
        (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
      )
    : packageJson
      ? [packageJson]
      : [];
  const coveragePercent = readCoveragePercent(repoPath, coverageFiles);
  // Ecosystems without a package.json (Python, Go, Rust, Java...) have no npm "test"/"lint"/
  // "typecheck" script key to credit — their real verification signal is a CI workflow that
  // actually invokes the equivalent tool (pytest, flake8/ruff, mypy, ...). Crediting only
  // npm-script presence under-scores a mature non-TS repo whose CI runs a real, multi-command
  // verification suite in a single workflow job — the normal shape for those ecosystems
  // (goal_cejel_code_trust_external_ecosystem_calibration_2026-07-06). Each category below is
  // satisfied by EITHER an npm script OR the language-agnostic CI command equivalent, so a
  // Python/Go repo can reach the same verification-depth credit as a Node repo with npm scripts.
  const ciWorkflows = repoFiles.filter(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  const ciTestWorkflow = ciWorkflows.find((file) =>
    fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN),
  );
  const ciHasLintCommand = ciWorkflows.some((file) =>
    fileContains(repoPath, file, CI_LINT_COMMAND_PATTERN),
  );
  const ciHasTypecheckCommand = ciWorkflows.some((file) =>
    fileContains(repoPath, file, CI_TYPECHECK_COMMAND_PATTERN),
  );
  const verificationScriptCount = [
    packageScripts.has('test') || Boolean(ciTestWorkflow),
    packageScripts.has('coverage'),
    packageScripts.has('lint') || ciHasLintCommand,
    packageScripts.has('typecheck') || ciHasTypecheckCommand,
  ].filter(Boolean).length;
  // A lean/built-in test toolchain (e.g. Node's `node:test`) with no heavy transitive test
  // dependency is a positive supply-chain signal, not a "no coverage tool" ding — it has no
  // separate coverage-config file by design (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  const usesLeanBuiltInTestRunner =
    (packageJson != null &&
      [...packageScripts.values()].some((script) =>
        LEAN_TEST_RUNNER_SCRIPT_PATTERN.test(script),
      )) ||
    testFiles.some((file) => fileContains(repoPath, file, LEAN_TEST_RUNNER_IMPORT_PATTERN));
  // A root node:test script does not make a monorepo lean when any workspace still carries a
  // heavyweight runner. v26 missed Meteor because it inspected only the root package.json and
  // therefore suppressed a real no-coverage finding despite nested Jest dependencies.
  const hasHeavyTestDependency = packageJsonFiles.some((manifest) =>
    packageJsonHasHeavyTestDependency(repoPath, manifest),
  );
  const isLeanTestToolchain = usesLeanBuiltInTestRunner && !hasHeavyTestDependency;

  for (const file of testFiles) {
    evidence.push(evidenceForRelative(repoPath, file, 'test_run', 'Detected test file'));
  }
  for (const file of runnerFiles) {
    evidence.push(evidenceForRelative(repoPath, file, 'test_run', 'Configured test runner'));
  }
  if (
    packageJson &&
    [...packageScripts.values()].some((script) => TEST_RUNNER_PATTERN.test(script))
  ) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'test_run', 'Configured test runner'));
  }
  for (const file of coverageFiles) {
    evidence.push(evidenceForRelative(repoPath, file, 'coverage', 'Coverage configuration'));
  }
  if (ciTestWorkflow) {
    evidence.push(
      evidenceForRelative(repoPath, ciTestWorkflow, 'test_run', 'CI workflow runs the test suite'),
    );
  }

  // Generalized scheduled-health-workflow sub-signal (see the constants above).
  // Not applicable when no such workflow exists (nothing to rate); a workflow whose
  // publication status cannot be determined contributes nothing (insufficient_data —
  // never a warning); only a workflow that demonstrably exists AND demonstrably hands
  // its result to nothing but an ephemeral CI artifact earns the warning.
  const scheduledHealthWorkflow = ciWorkflows.find(
    (file) =>
      fileContains(repoPath, file, SCHEDULE_TRIGGER_PATTERN) &&
      fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN) &&
      (!useV36Detectors ||
        SCHEDULED_HEALTH_PATH_PATTERN.test(file) ||
        fileContains(repoPath, file, SCHEDULED_HEALTH_INTENT_PATTERN)),
  );
  if (scheduledHealthWorkflow) {
    const isPublished = fileContains(
      repoPath,
      scheduledHealthWorkflow,
      PUBLISHED_RESULT_MARKER_PATTERN,
    );
    const isEphemeralOnly =
      !isPublished &&
      fileContains(repoPath, scheduledHealthWorkflow, EPHEMERAL_ARTIFACT_ONLY_PATTERN);
    if (isPublished) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          scheduledHealthWorkflow,
          'scheduled_health_summary',
          'Scheduled product-health workflow with durably published results',
        ),
      );
    } else if (isEphemeralOnly) {
      findings.push({
        severity: 'warning',
        summary:
          'A scheduled product-health workflow exists, but its results are handed only to an ephemeral, access-gated CI artifact — not a durable, checkable record.',
        evidence: evidenceForRelative(
          repoPath,
          scheduledHealthWorkflow,
          'scheduled_health_summary',
          'Scheduled product-health workflow',
        ),
      });
    }
    // Else: publication status is undeterminable from a static file-tree read —
    // insufficient_data for this sub-signal, contributing neither evidence nor a finding.
  }

  if (evidence.length === 0 && findings.length === 0 && configuredRunnerFiles.length === 0) {
    return reviewableSourceProof?.passes === true && reviewableSourceProof.firstReadablePath
      ? buildA1AuthenticatedAbsenceSignal(repoPath, reviewableSourceProof)
      : null;
  }

  if (testFiles.length === 0) {
    const fallback = configuredRunnerFiles[0]
      ? evidenceForRelative(
          repoPath,
          configuredRunnerFiles[0],
          'test_run',
          'Configured test runner',
        )
      : useV33Detectors
        ? undefined
        : (evidence[0] ?? findings[0]?.evidence);
    if (fallback) {
      findings.push({
        severity: 'warning',
        summary: 'A test runner is configured, but no concrete test files were detected.',
        evidence: fallback,
      });
    }
  } else if (coverageFiles.length === 0 && (!useV33Detectors || configuredRunnerFiles.length > 0)) {
    if (isLeanTestToolchain) {
      const leanEvidenceFile = packageJson ?? testFiles[0];
      if (leanEvidenceFile) {
        evidence.push(
          evidenceForRelative(
            repoPath,
            leanEvidenceFile,
            'test_run',
            'Lean built-in test toolchain (e.g. node:test) — no heavy transitive test dependency',
          ),
        );
      }
    } else {
      const firstEvidence = evidence[0];
      if (!firstEvidence) return null;
      findings.push({
        severity: 'info',
        summary: 'Test suite files are present, but no coverage configuration was detected.',
        evidence: firstEvidence,
      });
    }
  }

  const nonHollowShare = measureNonHollowTestShare(
    repoPath,
    allTestFiles,
    reviewableSourceProof !== undefined,
  );

  return {
    criterionId: 'A1',
    positiveEvidence: evidence,
    findings,
    metrics: [
      metric(
        'test_to_source_ratio',
        'Test-to-source file ratio',
        allTestFiles.length,
        Math.max(sourceFiles.length, 1),
        0.3,
        'ratio',
        'Measures how much concrete test surface exists relative to implementation surface.',
        'saturating_count',
      ),
      metric(
        'coverage_percent',
        'Static coverage percentage',
        coveragePercent ?? 0,
        100,
        0.3,
        'percent',
        'Uses a static coverage report value or configured threshold when present, without running tests.',
      ),
      metric(
        'verification_script_ratio',
        'Verification script ratio',
        verificationScriptCount + runnerFiles.length,
        4,
        0.25,
        'ratio',
        'Measures explicit test/lint/typecheck verification commands (via npm script or CI-invoked tool) plus test runner configuration.',
        'saturating_count',
      ),
      metric(
        'non_hollow_test_share',
        'Non-hollow test share',
        nonHollowShare.nonHollowCount,
        Math.max(nonHollowShare.ratedCount, 1),
        0.15,
        'ratio',
        'Penalizes skipped or placeholder-only test files; test-directory support scaffolding (helpers/fixtures with no test in them) is excluded from the denominator.',
      ),
    ],
    notes:
      'A1 is detected from real test files, test runner configuration, and optional coverage configuration.',
  };
}

function buildA1AuthenticatedAbsenceSignal(
  repoPath: string,
  proof: ReviewableSourceProof,
): WitanCriterionSignalPayload {
  const sourcePath = proof.firstReadablePath;
  if (!sourcePath) {
    throw new Error('Cejel invariant: a passing reviewable-source proof must have a readable path');
  }
  const anchor = evidenceForRelative(
    repoPath,
    sourcePath,
    'artifact',
    `Reviewable source anchor (${proof.readableSampledFileCount}/${proof.sampledFileCount} sampled files readable; ${proof.eligibleSourceFileCount}/${proof.sourceShapedFileCount} source-shaped files criterion-ratable)`,
  );
  return {
    criterionId: 'A1',
    positiveEvidence: [anchor],
    findings: [
      {
        severity: 'critical',
        summary: WITAN_AUTHENTICATED_A1_ABSENCE_SUMMARY,
        evidence: anchor,
      },
    ],
    metrics: [
      metric(
        'test_to_source_ratio',
        'Test-to-source file ratio',
        0,
        proof.eligibleSourceFileCount,
        0.3,
        'ratio',
        'Measures how much concrete test surface exists relative to criterion-ratable implementation source.',
        'saturating_count',
      ),
      metric(
        'coverage_percent',
        'Static coverage percentage',
        0,
        100,
        0.3,
        'percent',
        'Uses a static coverage report value or configured threshold when present, without running tests.',
      ),
      metric(
        'verification_script_ratio',
        'Verification script ratio',
        0,
        4,
        0.25,
        'ratio',
        'Measures explicit test/lint/typecheck verification commands plus test runner configuration.',
        'saturating_count',
      ),
      metric(
        'non_hollow_test_share',
        'Non-hollow test share',
        0,
        1,
        0.15,
        'ratio',
        'No concrete test files were present to establish non-hollow test behavior.',
      ),
    ],
    notes:
      `V17 authenticated absence: ${proof.eligibleSourceFileCount} criterion-ratable of ` +
      `${proof.sourceShapedFileCount} source-shaped files; sampled ${proof.sampledFileCount}; ` +
      `${proof.readableSampledFileCount} representative-text files.`,
  };
}

function collectA2IsolationEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV33Detectors: boolean,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors: boolean,
  useV18NativeRls: boolean,
  scanLimitations: Set<string>,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const gitignore = repoFiles.find((file) => basename(file) === '.gitignore');
  const envExamples = repoFiles.filter((file) => isEnvTemplatePath(file, useV47Detectors));
  const migrationFiles = repoFiles.filter((file) =>
    /(^|\/)(migrations?|drizzle|prisma)\//.test(file),
  );

  // Committed/history secret scan runs unconditionally, BEFORE the archetype N/A gate
  // below — a hardcoded secret (e.g. `stripe_secret_key = "sk-…"` with no .env in sight)
  // must fire critical even in an archetype the gate would otherwise call N/A; the prior
  // ordering made a real committed secret invisible whenever there was no "data layer" or
  // "secrets surface" (goal_cejel_launch_hardening_combined_2026-07-06, Phase 2 FN #2).
  let committedSecret: { path: string; match: RealSecretAssignmentMatch } | undefined;
  for (const path of repoFiles) {
    const authoredProductionPath = useV47Detectors
      ? isV47AuthoredProductionPath(path)
      : useV39Detectors
        ? isV39AuthoredProductionPath(path)
        : isAuthoredProductionPath(path);
    if (isIgnoredScanFile(path, useV47Detectors) || (useV33Detectors && !authoredProductionPath)) {
      continue;
    }
    const match = findCommittedSecretInFile(
      repoPath,
      path,
      useV36Detectors,
      useV39Detectors,
      useV47Detectors,
    );
    if (!match) continue;
    committedSecret = { path, match };
    break;
  }
  const currentSecretFingerprintsByPath = new Map<string, ReadonlySet<string>>();
  if (useV27Detectors) {
    for (const path of repoFiles.filter((candidate) => isCredentialHistoryPath(candidate))) {
      currentSecretFingerprintsByPath.set(
        path,
        new Set(
          findSecretFingerprintsInFile(
            repoPath,
            path,
            useV36Detectors,
            useV39Detectors,
            useV47Detectors,
          ),
        ),
      );
    }
  }
  // Current-tree and ancestor-history evidence are independent propositions. A current secret
  // must not suppress a distinct deleted/rotated credential finding from history. V8 excludes
  // HEAD and any still-current value fingerprints from the history pass, so unchanged credentials
  // are not emitted twice while a distinct historical value remains reviewable.
  const historySecretScan =
    committedSecret && !useV27Detectors
      ? null
      : collectHistorySecretEvidence(
          repoPath,
          useV27Detectors,
          currentSecretFingerprintsByPath,
          scanLimitations,
          useV33Detectors,
          useV36Detectors,
          useV39Detectors,
          useV47Detectors,
        );
  const hasConfirmedSecretFinding = committedSecret != null || historySecretScan?.evidence != null;

  // Crypto hygiene nudge (goal_cejel_rubric_refinement_from_lua_2026-07-06): computed
  // unconditionally, BEFORE the archetype N/A gate below — a signing/HMAC/secret-comparison
  // surface in source (e.g. an audit-chain library with no .env anywhere) IS itself a ratable
  // secrets surface, same reasoning as the committed/history secret scan above. Bounded and
  // only scored when such a surface is actually found; never a penalty for repos without one.
  const cryptoHygiene = collectCryptoHygieneEvidence(
    repoPath,
    repoFiles.filter(isImplementationFile).slice(0, 60),
    useV39Detectors,
  );

  // Archetype-aware N/A gate. A ratable secrets surface requires at least one of:
  //   • a committed or in-history .env* file
  //   • a .env.example/.sample/.template
  //   • a .gitignore with a .env rule
  //   • credential-management code (secrets manager / KMS client)
  // Bare env reads (process.env / os.environ / std::env:: / getenv( / ENV[) are NOT a ratable
  // surface — you cannot evaluate secrets posture from the fact that code reads an env var.
  // Data layer: migration directories or DB client imports in implementation files.
  // ANTI-OVERFIT: N/A requires evidenced absence of BOTH surfaces. A repo with a committed .env
  // containing a secret → LOW/critical, never N/A. A data layer without RLS → LOW, never N/A.
  const implFiles = repoFiles.filter(isImplementationFile);
  const gitignoreHasEnvRule =
    gitignore != null && fileContains(repoPath, gitignore, /^\.env(\*|\b)|\.env\./m);
  // .env* in current tree, excluding templates (.env.example/.sample/.template are in envExamples).
  // Catches .env, .env.production, .env.staging, .env.local, etc.
  const committedEnvFilePath = repoFiles.find(
    (f) =>
      /(?:^|\/)\.env(?:\.|$)/i.test(f) &&
      !isEnvTemplatePath(f, useV47Detectors) &&
      (!useV47Detectors || isV47AuthoredProductionPath(f)) &&
      (!useV39Detectors || !hasTemplateOnlyEnvContent(repoPath, f)),
  );
  // Only scan history when the current tree has no .env* to avoid redundant scanning.
  const hasEnvInHistory =
    committedEnvFilePath === undefined && hasEnvPathInGitHistory(repoPath, scanLimitations);
  // DB client import file (checked before migrationFiles so we can use it as evidence anchor).
  const dbLayerImportFile =
    migrationFiles.length === 0
      ? implFiles.slice(0, 30).find((f) => fileContains(repoPath, f, DB_CLIENT_PATTERN))
      : undefined;
  const hasDataLayer = migrationFiles.length > 0 || dbLayerImportFile !== undefined;
  const hasSecretsSurface =
    envExamples.length > 0 ||
    committedEnvFilePath !== undefined ||
    gitignoreHasEnvRule ||
    hasEnvInHistory;

  if (
    !hasDataLayer &&
    !hasSecretsSurface &&
    !hasConfirmedSecretFinding &&
    !cryptoHygiene.hasSurface
  ) {
    return buildNotApplicableSignal(
      'A2',
      'No data layer (DB/ORM/migrations) or ratable secrets surface detected — A2 not applicable to this repo archetype. A ratable surface requires .env* files, .gitignore .env rule, committed/history .env path, or detected signing/HMAC/secret-comparison code; bare env reads (process.env / os.environ / std::env::) do not qualify.',
    );
  }

  // Push at least one evidence anchor so evidenceCount > 0 after the full evidence-collection
  // pass. This guarantees metric-based scoring fires for any repo that passes the N/A gate,
  // preventing the null → 0.0-unverified fallback. gitignoreEnvFile and envExamples are already
  // pushed in the main evidence loop below, so they do not need an extra push here; cover the
  // remaining ratable-surface cases.
  if (committedEnvFilePath) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        committedEnvFilePath,
        'secret_scan',
        'Committed .env file in repository tree',
      ),
    );
  } else if (hasEnvInHistory) {
    evidence.push({
      kind: 'secret_scan',
      label: '.env path detected in git history',
      path: '.git',
      contentHash: readGitHead(repoPath) ?? 'env-history-scan',
    });
  } else if (migrationFiles[0] != null) {
    evidence.push(
      evidenceForRelative(repoPath, migrationFiles[0], 'artifact', 'Data layer migration'),
    );
  } else if (dbLayerImportFile != null) {
    evidence.push(evidenceForRelative(repoPath, dbLayerImportFile, 'artifact', 'DB client import'));
  }
  // hasSecretsSurface via gitignoreHasEnvRule or envExamples: pushed in main loop below.

  const v47RlsPolicyFiles = useV47Detectors ? findRlsPolicyFiles(repoPath, repoFiles) : [];
  const nativeRlsInventory = useV18NativeRls
    ? deriveRlsPolicyScopeInventory(repoPath, repoFiles)
    : null;
  // V18 positive isolation credit is policy-native, but a schema that advertises a
  // tenant boundary and has zero policies must never be silently reclassified as
  // single-tenant. This legacy, conservative premise is used only to emit the
  // fail-closed gap finding; it cannot manufacture D7 credit or isolation metrics.
  const tenantWithoutRlsPremiseFiles = useV18NativeRls
    ? findTenantStoragePremiseFiles(repoPath, repoFiles)
    : [];
  const v47TenantStorageFiles =
    useV47Detectors && !useV18NativeRls ? findTenantStoragePremiseFiles(repoPath, repoFiles) : [];
  const rlsMigration = useV47Detectors
    ? v47RlsPolicyFiles[0]
    : migrationFiles.find((file) => fileContains(repoPath, file, RLS_PATTERN));
  const tenantScopePattern = useV39Detectors
    ? TENANT_SCOPE_PATTERN_V11
    : useV36Detectors
      ? TENANT_SCOPE_PATTERN_V10
      : TENANT_SCOPE_PATTERN;
  const tenantScopedFile = useV18NativeRls
    ? nativeRlsInventory?.storageFiles[0]
    : useV47Detectors
      ? v47TenantStorageFiles[0]
      : migrationFiles.find((file) => fileContains(repoPath, file, tenantScopePattern));
  const rlsPolicyCount = useV18NativeRls
    ? (nativeRlsInventory?.policyCount ?? 0)
    : useV47Detectors
      ? v47RlsPolicyFiles.length
      : countPatternMatches(
          repoPath,
          migrationFiles,
          /create policy|enable row level security|force row level security/gi,
        );
  const tenantScopedMigrationFileCount = useV18NativeRls
    ? (nativeRlsInventory?.storageFiles.length ?? 0)
    : useV47Detectors
      ? v47TenantStorageFiles.length
      : countFilesContaining(repoPath, migrationFiles, tenantScopePattern);
  // gitignoreEnvFile is non-null only when the gitignore actually contains an .env rule.
  const gitignoreEnvFile =
    gitignore && fileContains(repoPath, gitignore, /^\.env(\*|\b)|\.env\./m) ? gitignore : null;
  // FIX 3 — env_handling_depth: multi-language (match the same set as the surface detector).
  // Counts three distinct bounded practices (0–3) to prevent file-count over-indexing.
  const envHandlingDepth =
    (envExamples.length > 0 ? 1 : 0) +
    (gitignoreEnvFile ? 1 : 0) +
    (countFilesContaining(repoPath, repoFiles.filter(isImplementationFile), ENV_READ_PATTERN) > 0
      ? 1
      : 0);
  // Whether the repo claims multi-tenant architecture (tenant/studio/org-scoped schema signals).
  const isMultiTenant = useV18NativeRls
    ? (nativeRlsInventory?.policyCount ?? 0) > 0 &&
      (nativeRlsInventory?.scopeIdentifiers.length ?? 0) > 0
    : tenantScopedMigrationFileCount > 0;

  if (gitignoreEnvFile) {
    evidence.push(
      evidenceForRelative(repoPath, gitignoreEnvFile, 'secret_scan', '.env files are gitignored'),
    );
  }
  for (const file of envExamples.slice(0, 3)) {
    evidence.push(evidenceForRelative(repoPath, file, 'secret_scan', 'Environment template'));
  }
  if (rlsMigration) {
    evidence.push(
      evidenceForRelative(repoPath, rlsMigration, 'artifact', 'RLS or tenant migration'),
    );
  }
  if (tenantScopedFile) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        tenantScopedFile,
        'artifact',
        useV18NativeRls
          ? `Repository-native RLS scope (${nativeRlsInventory?.scopeIdentifiers.join(', ')})`
          : 'Tenant scoping signal',
      ),
    );
  }

  if (committedSecret) {
    const isTestPath = isTestOrFixturePath(committedSecret.path);
    const isDefaultAdmin = committedSecret.match.kind === 'default_admin';
    findings.push({
      severity: isTestPath ? 'info' : 'critical',
      summary: isDefaultAdmin
        ? isTestPath
          ? `Default administrative credential in a test/fixture file (${committedSecret.path}) — likely fixture data, not a production deployment default; verify.`
          : 'An explicit default administrative credential appears committed in production configuration.'
        : isTestPath
          ? `Secret-shaped value in a test/fixture file (${committedSecret.path}) — likely fixture data, not a production leak; verify.`
          : 'Secret-shaped value appears committed in the scanned repository.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        committedSecret.path,
        'secret_scan',
        secretEvidenceLabel(
          isDefaultAdmin
            ? 'Committed default administrative credential'
            : 'Committed secret-shaped value',
          committedSecret.match,
        ),
        committedSecret.match.line,
      ),
    });
  } else if (committedEnvFilePath) {
    findings.push({
      severity: useV33Detectors ? 'info' : 'warning',
      summary:
        'A non-template .env file is committed in the current repository tree; no secret-shaped value was detected.',
      evidence: evidenceForRelative(
        repoPath,
        committedEnvFilePath,
        'secret_scan',
        'Committed .env file (no confirmed secret value found)',
      ),
    });
  }
  if (historySecretScan?.evidence) {
    const historyPath = historySecretScan.evidence.path ?? '';
    const isTestPath = isTestOrFixturePath(historyPath);
    findings.push({
      severity: isTestPath ? 'info' : 'critical',
      summary: isTestPath
        ? `Secret-shaped value in git history for a test/fixture file (${historyPath}) — likely fixture data, not a production leak; verify.`
        : 'Secret-shaped value appears in recent git history.',
      evidence: historySecretScan.evidence,
    });
  } else if (historySecretScan?.truncated) {
    findings.push({
      severity: useV33Detectors ? 'info' : 'warning',
      summary:
        'History secret scan reached the credential-path safety valve before scanning every matching blob.',
      evidence: {
        kind: 'secret_scan',
        label: 'History secret scan coverage bound',
        path: '.git',
        contentHash: readGitHead(repoPath) ?? 'history-scan-bound',
      },
    });
  } else if (historySecretScan?.envPathEvidence) {
    // A bare .env PATH in history (not a template, value unknown/undetected) is a
    // hygiene warning, never a critical secret leak — see goal_cejel_calibration_findings_precision_2026-07-06.
    findings.push({
      severity: useV33Detectors ? 'info' : 'warning',
      summary:
        'A non-template .env file was tracked in git history; no secret-shaped value was detected.',
      evidence: historySecretScan.envPathEvidence,
    });
  }

  // Flag a real isolation gap: tenant-scoped schema without any RLS enforcement.
  const hasTenantWithoutRlsGap =
    rlsPolicyCount === 0 &&
    (useV18NativeRls ? tenantWithoutRlsPremiseFiles.length > 0 : isMultiTenant);
  if (hasTenantWithoutRlsGap) {
    const gapEvidence = rlsMigration ?? tenantScopedFile ?? tenantWithoutRlsPremiseFiles[0];
    if (gapEvidence) {
      findings.push({
        severity: 'warning',
        summary:
          'Tenant-scoped schema detected but no row-level-security policies found — isolation gap.',
        evidence: evidenceForRelative(
          repoPath,
          gapEvidence,
          'artifact',
          'Tenant schema without RLS policies',
        ),
      });
    }
  }

  // cryptoHygiene was computed above (before the N/A gate); merge its evidence/findings now.
  evidence.push(...cryptoHygiene.evidence);
  findings.push(...cryptoHygiene.findings);

  // Any repo that reaches here has passed the N/A gate and had at least one evidence anchor
  // pushed. The null return below guards only the theoretically unreachable case where
  // neither branch produced evidence (kept as a safety net, not an expected path).
  if (evidence.length === 0 && findings.length === 0) return null;

  // For non-multi-tenant repos, RLS and tenant-scope are irrelevant: omit those
  // metrics entirely so a secret-clean single-tenant repo is never scored as critical
  // for absence of isolation mechanisms it does not need.
  const secretCleanliness = findings.some((finding) => finding.severity === 'critical') ? 0 : 1;
  const baseMetrics: WitanCriterionMetric[] = [
    metric(
      'secret_cleanliness',
      'Secret cleanliness',
      secretCleanliness,
      1,
      isMultiTenant ? 0.25 : 0.7,
      'clean',
      'Credits absence of committed or recent-history secret findings in the static scan.',
    ),
    metric(
      'env_handling_depth',
      'Environment handling depth',
      envHandlingDepth,
      3,
      isMultiTenant ? 0.1 : 0.3,
      'practices',
      'Counts three bounded env-handling practices (0–3): template file, gitignore rule, env reads in any supported language.',
    ),
  ];
  const isolationMetrics: WitanCriterionMetric[] = isMultiTenant
    ? [
        metric(
          'rls_policy_count',
          'RLS policy count',
          rlsPolicyCount,
          useV18NativeRls
            ? Math.max(tenantScopedMigrationFileCount, 1)
            : Math.max(tenantScopedMigrationFileCount * 3, 3),
          0.4,
          'policies',
          useV18NativeRls
            ? 'Counts CREATE POLICY definitions with repository-native USING/WITH CHECK clauses against the repository-native scoped data-layer surface.'
            : 'Counts static row-level-security enables, forced-RLS statements, and policy definitions.',
          'saturating_count',
        ),
        metric(
          'tenant_scope_ratio',
          'Tenant-scoped schema ratio',
          useV18NativeRls
            ? tenantScopedMigrationFileCount
            : countFilesContaining(repoPath, migrationFiles, tenantScopePattern),
          Math.max(migrationFiles.length, 1),
          0.25,
          'ratio',
          useV18NativeRls
            ? `Measures repository-native RLS scope identifiers (${nativeRlsInventory?.scopeIdentifiers.join(', ')}) across data-layer files.`
            : 'Measures tenant/studio/workspace scoping evidence across data-layer files.',
        ),
      ]
    : [];
  // Omitted entirely (not scored 0) when no signing/HMAC/secret-comparison surface was
  // detected in source — this metric never penalizes a repo that has no such surface.
  const cryptoMetrics: WitanCriterionMetric[] = cryptoHygiene.hasSurface
    ? [
        metric(
          'crypto_comparison_hygiene',
          'Crypto comparison hygiene',
          cryptoHygiene.clean ? 1 : 0,
          1,
          0.2,
          'clean',
          'Credits constant-time secret/HMAC comparison and canonical serialization before signing when a signing/HMAC surface is detected in source; only scored when such a surface exists.',
        ),
      ]
    : [];

  return {
    criterionId: 'A2',
    positiveEvidence: evidence,
    findings,
    metrics: [...baseMetrics, ...isolationMetrics, ...cryptoMetrics],
    notes: useV18NativeRls
      ? 'History secret scanning covers all reachable git history for credential-pattern paths unless the explicit credential-blob safety valve is reported. Positive multi-tenancy credit is derived only from this repository’s own CREATE POLICY USING/WITH CHECK clauses; no fixed tenant-token vocabulary can create isolation credit. A conservative schema premise is retained only to fail closed when a tenant-shaped schema has zero RLS policies.'
      : 'History secret scanning covers all reachable git history for credential-pattern paths unless the explicit credential-blob safety valve is reported.',
  };
}

interface CryptoHygieneSignal {
  evidence: WitanEvidencePointer[];
  findings: WitanFinding[];
  /** True when a signing/HMAC/secret-comparison surface was detected at all. */
  hasSurface: boolean;
  /** True only when a surface was detected AND no insecure pattern was found within it. */
  clean: boolean;
}

// Bounded, conservative crypto-hygiene nudge (goal_cejel_rubric_refinement_from_lua_2026-07-06):
// credits constant-time secret/HMAC comparison and canonical-serialization-before-signing where
// cheaply detectable in source; flags a plain ===/!== on a clearly-named secret/HMAC compare, or
// signing over unsorted JSON, as a warning (never critical). Only ever contributes evidence/
// findings when a relevant surface is actually found — a repo with no crypto code is unaffected.
function collectCryptoHygieneEvidence(
  repoPath: string,
  implFiles: readonly string[],
  useV39Detectors = false,
): CryptoHygieneSignal {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanFinding[] = [];
  let hasSurface = false;
  let insecureFound = false;

  // Credit (good-pattern evidence) is drawn only from PRODUCTION files: a test fixture that
  // merely demonstrates `timingSafeEqual`/canonical-serialization text is not itself evidence
  // of production crypto hygiene, the same "one notion of production code" the timing/unsorted-
  // sign findings below apply on the penalty side.
  const productionImplFiles = implFiles.filter((file) =>
    useV39Detectors ? isV39AuthoredProductionPath(file) : isProductionSourcePath(file),
  );

  const timingSafeFile = productionImplFiles.find((file) =>
    fileContains(repoPath, file, TIMING_SAFE_COMPARE_PATTERN),
  );
  if (timingSafeFile) {
    hasSurface = true;
    evidence.push(
      evidenceForRelative(
        repoPath,
        timingSafeFile,
        'artifact',
        'Constant-time secret/HMAC comparison',
      ),
    );
  }

  const canonicalSignFile = productionImplFiles.find(
    (file) =>
      fileContains(repoPath, file, CANONICAL_SERIALIZE_PATTERN) &&
      fileContains(repoPath, file, SIGN_OR_HMAC_CALL_PATTERN),
  );
  if (canonicalSignFile) {
    hasSurface = true;
    evidence.push(
      evidenceForRelative(
        repoPath,
        canonicalSignFile,
        'artifact',
        'Canonical serialization before signing',
      ),
    );
  }

  // First file (in repo listing order) with a real, per-line insecure-compare match — same
  // "first match wins" convention as every other detector in this function, just resolved to a
  // real line instead of a whole-file boolean.
  let insecureCompareFile: string | null = null;
  let insecureCompareLine: number | null = null;
  const compareFiles = useV39Detectors ? productionImplFiles : implFiles;
  for (const file of compareFiles) {
    const line = findInsecureSecretCompareLine(repoPath, file, useV39Detectors);
    if (line != null) {
      insecureCompareFile = file;
      insecureCompareLine = line;
      break;
    }
  }
  if (insecureCompareFile) {
    const insecureCompareSourceLine = lineAt(
      repoPath,
      insecureCompareFile,
      insecureCompareLine ?? 0,
    );
    const comparesDefaultSentinel =
      useV39Detectors &&
      insecureCompareSourceLine !== null &&
      DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN.test(insecureCompareSourceLine);
    // ONE notion of production code, reused from the shared classifier (not a private
    // heuristic): a match inside a test/fixture path is downgraded to info, as the sibling
    // committed-secret detector does, and does not affect the
    // crypto_comparison_hygiene metric — a test fixture demonstrating the bad pattern is not
    // itself a production timing leak.
    const isTestPath = isTestOrFixturePath(insecureCompareFile);
    if (!isTestPath) {
      hasSurface = true;
      insecureFound = true;
    }
    findings.push({
      severity: isTestPath ? 'info' : 'warning',
      summary: isTestPath
        ? `A secret/HMAC/signature comparison via plain equality appears in a test/fixture file (${insecureCompareFile}) — likely a test assertion, not a production timing leak; verify.`
        : comparesDefaultSentinel
          ? 'A supplied secret is compared with a configured default-secret sentinel using ordinary equality; verify whether this comparison belongs on a constant-time authentication path.'
          : 'A secret/HMAC/signature value appears compared with a plain equality operator instead of a constant-time comparison — potential timing side-channel.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        insecureCompareFile,
        'artifact',
        'Non-constant-time secret comparison',
        insecureCompareLine,
      ),
    });
  }

  const unsortedFiles = useV39Detectors ? productionImplFiles : implFiles;
  const unsortedSignFile = unsortedFiles.find(
    (file) =>
      (useV39Detectors
        ? fileHasVariableUnsortedJsonHmac(repoPath, file)
        : fileContains(repoPath, file, UNSORTED_JSON_SIGN_PATTERN)) &&
      !fileContains(repoPath, file, CANONICAL_SERIALIZE_PATTERN),
  );
  if (unsortedSignFile) {
    const isTestPath = isTestOrFixturePath(unsortedSignFile);
    if (!isTestPath) {
      hasSurface = true;
      insecureFound = true;
    }
    const unsortedSignLine = useV39Detectors
      ? findUnsortedJsonHmacLine(repoPath, unsortedSignFile)
      : findFirstMatchingLine(repoPath, unsortedSignFile, UNSORTED_JSON_SIGN_PATTERN);
    findings.push({
      severity: isTestPath ? 'info' : 'warning',
      summary: isTestPath
        ? `Signing over unsorted JSON serialization appears in a test/fixture file (${unsortedSignFile}) — likely a test assertion, not a production signing gap; verify.`
        : 'A signature/HMAC appears computed directly over JSON.stringify output with no canonical key ordering in the same file — signatures may not verify across equivalent payloads.',
      evidence: evidenceForRelativeAtLine(
        repoPath,
        unsortedSignFile,
        'artifact',
        'Signing over unsorted JSON serialization',
        unsortedSignLine,
      ),
    });
  }

  return { evidence, findings, hasSurface, clean: hasSurface && !insecureFound };
}

function collectA3ProdReadinessEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
  useV20ExplicitGaps = false,
): WitanCriterionSignalPayload | null {
  const v20DirectHttpEntrypoint = useV20ExplicitGaps
    ? findV20DirectHttpServerEntrypointFile(repoPath, repoFiles)
    : null;
  const v20RuntimeContainer = useV20ExplicitGaps
    ? findRuntimeContainerEntrypointFile(repoPath, repoFiles, true)
    : null;
  // Archetype-aware N/A gate (mirrors A2 mechanism from #224).
  // A3 only applies to repos operated as deployable services.
  // N/A requires evidenced absence of ALL service/deploy signals:
  //   server entrypoint, explicit deploy target, and CI deploy job.
  // Dockerfile alone is ambiguous — it does not qualify.
  // ANTI-OVERFIT: a service WITH a deploy surface but missing
  //   health-checks / observability / rollback still scores LOW.
  if (
    !isDeployableService(repoPath, repoFiles, useV27Detectors) &&
    !v20DirectHttpEntrypoint &&
    !v20RuntimeContainer
  ) {
    const dockerApplicabilityNote = useV27Detectors
      ? 'A Dockerfile without an explicit runtime start/service command is ambiguous and does not qualify.'
      : 'Dockerfile alone is ambiguous and does not qualify.';
    return buildNotApplicableSignal(
      'A3',
      `No deployable-service surface detected — production-readiness not applicable to this library/CLI archetype. Signals checked: production server entrypoint (HTTP/RPC port binding in main/server/app files, outside examples/tests/demo dirs), deploy config (vercel.json, render.yaml, fly.toml, Procfile, app.yaml, serverless.yml, docker-compose, k8s/helm manifests), CI deploy job (fly deploy, kubectl apply, helm install/upgrade, docker push). ${dockerApplicabilityNote}`,
    );
  }

  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const packageJson = findRootPackageJson(repoFiles);
  const scripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  const workflows = repoFiles.filter(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  const workflow = workflows[0];
  const deployConfigs = repoFiles.filter(
    (file) =>
      (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
      isDeployConfig(file),
  );
  const releaseDeployConfigs = repoFiles.filter(
    (file) =>
      (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
      isExplicitDeployTarget(file),
  );
  const releaseDeployConfig = releaseDeployConfigs[0];
  const containerBuildConfig = deployConfigs.find((file) => /(^|\/)Dockerfile$/.test(file));
  const envTemplate = repoFiles.find(
    (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isEnvTemplatePath(file),
  );
  const healthChecks = repoFiles.filter(
    (file) =>
      (!useV27Detectors || isAuthoredProductionPath(file)) &&
      isHealthCheckSignalFile(repoPath, file),
  );
  const healthCheck = healthChecks[0];
  const hasV20HealthOrReadinessRoute =
    useV20ExplicitGaps &&
    repoFiles.some(
      (file) =>
        isAuthoredProductionPath(file) &&
        isImplementationFile(file) &&
        fileContains(repoPath, file, V20_HEALTH_OR_READINESS_ROUTE_PATTERN),
    );
  const serverEntrypoint =
    findServerEntrypointFile(repoPath, repoFiles, useV27Detectors) ?? v20DirectHttpEntrypoint;
  const runtimeContainer = useV27Detectors
    ? findRuntimeContainerEntrypointFile(repoPath, repoFiles, useV20ExplicitGaps)
    : null;
  const errorBoundaries = repoFiles.filter(
    (file) =>
      (!useV27Detectors || isAuthoredProductionPath(file)) &&
      /error-boundary|error\.(tsx|jsx|ts|js)$/.test(file),
  );
  const errorBoundary = errorBoundaries[0];
  const observabilityCount = countFilesContaining(
    repoPath,
    repoFiles.filter(
      (file) => (!useV27Detectors || isAuthoredProductionPath(file)) && isImplementationFile(file),
    ),
    /sentry|otel|opentelemetry|datadog|prometheus|metrics|logger|logtail/i,
  );
  const rollbackSafetyCount = countFilesContaining(
    repoPath,
    repoFiles.filter(
      (file) =>
        (!useV27Detectors || isAuthoredProductionPath(file)) &&
        /(^|\/)(docs|migrations?|drizzle|prisma|scripts)\//.test(file),
    ),
    /rollback|roll back|migration safety|down migration|reversible|undo migration/i,
  );

  if (packageJson && (scripts.has('build') || scripts.has('typecheck'))) {
    evidence.push(
      evidenceForRelative(repoPath, packageJson, 'prod_check', 'Build or typecheck script'),
    );
  }
  if (workflow) evidence.push(evidenceForRelative(repoPath, workflow, 'ci_run', 'CI workflow'));
  if (releaseDeployConfig)
    evidence.push(
      evidenceForRelative(
        repoPath,
        releaseDeployConfig,
        'prod_check',
        'Release deploy configuration',
      ),
    );
  if (containerBuildConfig)
    evidence.push(
      evidenceForRelative(
        repoPath,
        containerBuildConfig,
        'prod_check',
        'Container build configuration',
      ),
    );
  if (envTemplate)
    evidence.push(evidenceForRelative(repoPath, envTemplate, 'prod_check', 'Environment template'));
  if (healthCheck)
    evidence.push(
      evidenceForRelative(repoPath, healthCheck, 'prod_check', 'Health/readiness signal'),
    );
  if (errorBoundary)
    evidence.push(evidenceForRelative(repoPath, errorBoundary, 'prod_check', 'Error boundary'));

  // Anchor on the server entrypoint file when it is the only reason the N/A
  // gate passed but no other A3 signal produced evidence. Without this anchor
  // the scorer would short-circuit to null despite having identified a service.
  if (evidence.length === 0) {
    if (serverEntrypoint) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          serverEntrypoint,
          'prod_check',
          'Production server entrypoint',
        ),
      );
    } else if (runtimeContainer) {
      evidence.push(
        evidenceForRelative(
          repoPath,
          runtimeContainer,
          'prod_check',
          'Runtime container entrypoint',
        ),
      );
    }
  }

  if (evidence.length === 0) return null;
  if (useV20ExplicitGaps) {
    const hasBuildOrTypecheck = scripts.has('build') || scripts.has('typecheck');
    if (packageJson && !hasBuildOrTypecheck) {
      findings.push({
        severity: 'info',
        summary:
          'A deployable service package manifest declares neither a build nor a typecheck script.',
        evidence: evidenceForRelative(
          repoPath,
          packageJson,
          'prod_check',
          'Deployable service manifest without a build or typecheck script',
        ),
      });
    } else if (runtimeContainer) {
      if (!fileContains(repoPath, runtimeContainer, /^\s*HEALTHCHECK\s+(?!NONE\b)/im)) {
        findings.push({
          severity: 'info',
          summary: 'A runtime Dockerfile declares no active HEALTHCHECK instruction.',
          evidence: evidenceForRelative(
            repoPath,
            runtimeContainer,
            'prod_check',
            'Runtime Dockerfile without an active HEALTHCHECK',
          ),
        });
      }
    } else if (
      serverEntrypoint &&
      fileContains(
        repoPath,
        serverEntrypoint,
        /\b(?:request|req)\.(?:url|path|pathname|method)\b/i,
      ) &&
      healthChecks.length === 0 &&
      !hasV20HealthOrReadinessRoute
    ) {
      findings.push({
        severity: 'info',
        summary:
          'A production HTTP entrypoint handles requests directly but declares no health or readiness route.',
        evidence: evidenceForRelative(
          repoPath,
          serverEntrypoint,
          'prod_check',
          'Production HTTP entrypoint without a health or readiness route',
        ),
      });
    }
  }
  if (!workflow && releaseDeployConfigs.length === 0) {
    const firstEvidence = evidence[0];
    if (!firstEvidence) return null;
    findings.push({
      severity: 'info',
      summary:
        'A deployable service surface exists, but no CI or release-deployment automation was detected.',
      evidence: firstEvidence,
    });
  }
  return {
    criterionId: 'A3',
    positiveEvidence: evidence,
    findings,
    metrics: [
      metric(
        'prod_readiness_primitives',
        'Production-readiness primitive coverage',
        [
          packageJson && (scripts.has('build') || scripts.has('typecheck')),
          workflows.length > 0,
          deployConfigs.length > 0,
          envTemplate,
          healthChecks.length > 0,
          errorBoundaries.length > 0,
        ].filter(Boolean).length,
        6,
        0.55,
        'primitives',
        'Counts distinct static production-readiness primitives instead of treating presence as enough.',
      ),
      metric(
        'prod_workflow_depth',
        'Production workflow depth',
        workflows.length + deployConfigs.length,
        6,
        0.2,
        'signals',
        'Measures CI/deploy configuration depth instead of a single CI-present bit.',
        'saturating_count',
      ),
      metric(
        'observability_depth',
        'Observability depth',
        observabilityCount,
        4,
        0.1,
        'signals',
        'Counts static observability/logging/metrics implementation signals.',
        'saturating_count',
      ),
      metric(
        'rollback_safety_depth',
        'Rollback and migration-safety depth',
        rollbackSafetyCount,
        4,
        0.15,
        'signals',
        'Counts static rollback or migration-safety artifacts.',
        'saturating_count',
      ),
    ],
  };
}

function collectA4DependencyEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  mono: MonorepoContext | null | undefined,
  useV27Detectors: boolean,
  useV47Detectors: boolean,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];
  const manifests = repoFiles.filter(isDependencyManifest);
  const lockfiles = repoFiles.filter(isLockfile);
  // Cite the manifest that actually carries dependencies for evidence/findings,
  // not whichever sorts first (e.g. a near-empty requirements-windows.txt that
  // precedes the real requirements.txt), so the evidence pointer reflects the
  // file the A4 score is derived from. The score itself is unaffected: it
  // aggregates specs across ALL manifests below.
  const manifest = pickPrimaryDependencyManifest(repoPath, manifests);
  const lockfile = lockfiles[0];
  // A lockfile / dependency-update config at the MONOREPO ROOT covers this sub-package.
  const rootLockfile = mono ? mono.sharedFiles.find(isLockfile) : undefined;
  const rootUpdateConfig = mono ? mono.sharedFiles.find(isDependencyUpdateConfig) : undefined;
  const hasLockfile = Boolean(lockfile) || Boolean(rootLockfile);
  const updateConfig = repoFiles.find(isDependencyUpdateConfig);
  const hasUpdateConfig = Boolean(updateConfig) || Boolean(rootUpdateConfig);
  const auditConfig = manifests.some((file) => packageJsonHasAuditScript(repoPath, file));
  const dependencySpecs = readDependencySpecs(repoPath, manifests);
  const pinnedDependencyCount = dependencySpecs.filter((dependency) =>
    isPinnedDependencyVersion(dependency.version),
  ).length;

  if (manifest)
    evidence.push(
      evidenceForRelative(repoPath, manifest, 'dependency_report', 'Dependency manifest'),
    );
  if (lockfile)
    evidence.push(
      evidenceForRelative(repoPath, lockfile, 'dependency_report', 'Dependency lockfile'),
    );
  else if (rootLockfile && mono)
    evidence.push(
      evidenceForRelative(
        mono.root,
        rootLockfile,
        'dependency_report',
        'Dependency lockfile (monorepo root)',
      ),
    );
  if (updateConfig) {
    evidence.push(
      evidenceForRelative(repoPath, updateConfig, 'dependency_report', 'Dependency update config'),
    );
  } else if (rootUpdateConfig && mono) {
    evidence.push(
      evidenceForRelative(
        mono.root,
        rootUpdateConfig,
        'dependency_report',
        'Dependency update config (monorepo root)',
      ),
    );
  }

  if (!manifest && !hasLockfile) return null;

  // Library-vs-app dependency calibration (goal_cejel_rubric_calibration_archetype_2026-07-10).
  // Reuses A3's archetype line (isDeployableService — the same detector behind A3's
  // "not applicable to this library/CLI archetype"): an APP/SERVICE must pin its dependency
  // tree (lockfile + pins = reproducible deploys), but a LIBRARY/CLI correctly declares
  // VERSION RANGES and typically does NOT commit a lockfile — consumers resolve their own
  // trees. Scoring library manifests against app expectations flagged correct library
  // behavior as CRITICAL (Django A4 1.4: "1/13 pinned, no lockfile").
  const packagedApplicationFiles = useV27Detectors
    ? findPackagedApplicationPremiseFiles(repoPath, repoFiles)
    : [];
  const deployableServiceFiles = useV47Detectors
    ? findDeployableServicePremiseFiles(repoPath, repoFiles, true)
    : [];
  const isAppOrService =
    (useV47Detectors
      ? deployableServiceFiles.length > 0
      : isDeployableService(repoPath, repoFiles, useV27Detectors)) ||
    packagedApplicationFiles.length > 0;

  if (isAppOrService && !hasLockfile && manifest) {
    // No lockfile means installs are non-reproducible — a genuine supply-chain risk for a
    // deployed app/service. Deliberately NOT loosened: only the library/CLI archetype is
    // exempt from this finding.
    findings.push({
      severity: 'critical',
      summary:
        'Dependency manifest is present without a detected lockfile — non-reproducible installs.',
      evidence: evidenceForRelative(repoPath, manifest, 'dependency_report', 'Dependency manifest'),
    });
  }
  if (manifest && hasSuspiciousDependencies(repoPath, manifest, useV47Detectors)) {
    // Suspicious/hallucinated package names are a supply-chain risk.
    findings.push({
      severity: 'critical',
      summary: 'Dependency manifest contains obviously suspicious placeholder dependency names.',
      evidence: evidenceForRelative(
        repoPath,
        manifest,
        'dependency_report',
        'Suspicious dependency manifest',
      ),
    });
  }

  const automationMetric = metric(
    'dependency_automation_ratio',
    'Dependency automation ratio',
    (hasUpdateConfig ? 1 : 0) + (auditConfig ? 1 : 0),
    2,
    0.25,
    'ratio',
    'Credits automated dependency updates and package-manager audit hooks.',
  );

  // APP/SERVICE norms: pinned versions + a lockfile are the reproducibility guarantee for a
  // deployed artifact. Unchanged from the pre-archetype scoring so the app case is not loosened.
  const appMetrics: WitanCriterionMetric[] = [
    metric(
      'pinned_dependency_ratio',
      'Pinned dependency ratio',
      pinnedDependencyCount,
      Math.max(dependencySpecs.length, 1),
      0.3,
      'ratio',
      // Reduced weight: semver ranges in manifests are normal when a lockfile fixes exact versions.
      'Measures exact/static dependency versions in manifests; lower weight because a lockfile is the primary reproducibility guarantee.',
    ),
    metric(
      'lockfile_coverage',
      'Lockfile coverage',
      hasLockfile ? 1 : 0,
      1,
      0.45,
      'present',
      // Presence-based (not ratio) so a single root lockfile covering a monorepo workspace scores full credit.
      'Credits presence of at least one lockfile; one root lockfile covering a monorepo is sufficient.',
    ),
    automationMetric,
  ];

  // LIBRARY/CLI norms: ranges are correct, a lockfile is optional. Score on the signals that
  // ARE library-appropriate: every dependency carries an explicit version constraint (range or
  // pin), a committed lockfile is credited when present but never required, update automation,
  // and a sane direct-dependency count. Known-vuln/abandoned-dependency checks need network
  // data this offline scan does not have — they are intentionally absent, not scored 0.
  const constrainedDependencyCount = dependencySpecs.filter(hasDeclaredVersionConstraint).length;
  const libraryMetrics: WitanCriterionMetric[] = [
    metric(
      'declared_version_range_ratio',
      'Declared version range ratio',
      constrainedDependencyCount,
      Math.max(dependencySpecs.length, 1),
      0.5,
      'ratio',
      'Measures dependencies declared with an explicit version constraint (range or exact); a library correctly ships ranges, so ranges earn full credit here.',
    ),
    ...(hasLockfile
      ? [
          metric(
            'lockfile_coverage',
            'Lockfile coverage',
            1,
            1,
            0.3,
            'present',
            'Credited when present (reproducible dev/CI installs); a library without a committed lockfile is not penalized — consumers resolve their own trees.',
          ),
        ]
      : []),
    automationMetric,
    metric(
      'dependency_count_sanity',
      'Dependency count sanity',
      libraryDependencyCountSanity(dependencySpecs.length),
      1,
      0.1,
      'sane',
      `Credits a sane direct-dependency count for a library (full credit up to ${LIBRARY_DEPENDENCY_COUNT_SANE_MAX} declared specs across manifests, declining beyond).`,
    ),
  ];

  return {
    criterionId: 'A4',
    positiveEvidence: evidence,
    findings,
    metrics: isAppOrService ? appMetrics : libraryMetrics,
    notes: isAppOrService
      ? `A4 scored against app/service norms (${packagedApplicationFiles.length > 0 ? 'packaged application' : 'deploy surface'} detected): pinned dependencies and a lockfile are required for reproducible installs.`
      : 'A4 scored against library/CLI norms (no deploy surface detected — same archetype line as A3): declared version ranges are correct library behavior; a committed lockfile is credited but not required.',
  };
}

// Full credit up to this many declared dependency specs (aggregated across all manifests,
// runtime + dev); beyond it the sanity credit declines linearly. Deliberately generous so a
// monorepo aggregating many workspace manifests is not meaningfully penalized (the metric
// carries 0.1 weight — a nudge against pathological dependency sprawl, not a hard gate).
const LIBRARY_DEPENDENCY_COUNT_SANE_MAX = 120;

function libraryDependencyCountSanity(specCount: number): number {
  if (specCount <= LIBRARY_DEPENDENCY_COUNT_SANE_MAX) return 1;
  return Math.max(0, 1 - (specCount - LIBRARY_DEPENDENCY_COUNT_SANE_MAX) / 240);
}

// Library norm for a declared dependency: ANY explicit version constraint counts — an exact
// pin, a semver/PEP-440 range (^, ~, >=, <, !=, ~=), a bare numeric version (Cargo "1.2" means
// ^1.2), or a go.mod exact version (v1.2.3). Only a constraint-free spec (bare name, *, latest)
// misses: it gives consumers no compatibility contract at all.
function hasDeclaredVersionConstraint(dependency: DependencySpec): boolean {
  if (isPinnedDependencyVersion(dependency.version)) return true;
  const trimmed = dependency.version.trim();
  if (trimmed.length === 0) return false;
  if (/^(latest|\*|x)$/i.test(trimmed)) return false;
  // CMake find_package without a version: system-managed, no declared constraint.
  if (trimmed === 'find') return false;
  // Range operator anywhere in the spec (requirements.txt specs keep the full line here).
  if (/[~^<>=!]/.test(trimmed)) return true;
  // go.mod exact versions ("v1.2.3") and bare numeric versions (Cargo "1.2" = ^1.2).
  return /^v?\d/.test(trimmed);
}

function collectA5ClaimRealityEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): WitanCriterionSignalPayload | null {
  const reconciliationArtifacts = useV27Detectors
    ? findClaimRealityReconciliationArtifacts(repoPath, repoFiles)
    : [];
  const claimSourceFiles = useV27Detectors
    ? findClaimSourceFiles(repoFiles)
    : repoFiles.filter(
        (file) => /^(?:README|readme)\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file),
      );
  const claimDoc = useV27Detectors
    ? (claimSourceFiles[0] ?? reconciliationArtifacts[0])
    : (repoFiles.find((file) => /^(?:README|readme)\.md$/.test(file)) ??
      repoFiles.find((file) => /^docs\/[^/]+\.(?:md|mdx)$/.test(file)) ??
      repoFiles.find((file) => /(^|\/)claim[_-]reality[_-]reconciliation\.md$/i.test(file)));
  // A repo with no README/docs has nothing to claim, so nothing to contradict — N/A (like
  // B1/B5), not a scored 0 (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H2).
  // (Historical: the prior `return null` fell through to scoreCriterion's `!signal` branch,
  // which then scored 'unverified' at 0 INSIDE the category average; a null now maps to
  // insufficient_data, excluded — but explicit N/A remains the honest state here, since
  // "nothing is claimed" is inapplicability, not a measurement gap.)
  if (!claimDoc) {
    return buildNotApplicableSignal(
      'A5',
      'No README or docs found — nothing is claimed about this repo, so there is nothing for A5 to reconcile against.',
    );
  }

  const implementationFiles = findClaimImplementationFiles(repoFiles, useV27Detectors);
  if (implementationFiles.length === 0) return null;
  const implementationFile = implementationFiles[0];
  if (!implementationFile) return null;
  const evidence = [
    evidenceForRelative(repoPath, claimDoc, 'claim_reconciliation', 'Repository claim source'),
    evidenceForRelative(
      repoPath,
      implementationFile,
      'artifact',
      'Code presence for claim reconciliation',
    ),
  ];
  for (const artifact of reconciliationArtifacts.slice(0, 3)) {
    if (artifact === claimDoc) continue;
    evidence.push(
      evidenceForRelative(
        repoPath,
        artifact,
        'claim_reconciliation',
        'Dedicated claim-reality reconciliation artifact',
      ),
    );
  }
  const firstEvidence = evidence[0];
  if (!firstEvidence) return null;

  // Bound the proxy denominator to prevent manufactured inflated ratios.
  // We cap both sides so the metric never displays hundreds of "claims".
  // Restrict to headline-level documents only (README + top-level docs/, not nested subdirs).
  const allDocFiles = useV27Detectors
    ? claimSourceFiles
    : repoFiles.filter(
        (file) => /^README\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file),
      );
  const boundedImplCount = Math.min(implementationFiles.length, 12);
  const boundedDocCount = Math.min(allDocFiles.length, 8);

  // Documented negative space — an explicit limitations/threat-model/"not covered" section
  // is honest scoping, not a missing-claim gap (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  // Checked across the claim doc, headline docs, and common SECURITY/threat-model filenames
  // (even nested — a security doc's location shouldn't gate whether honest scoping is credited).
  const negativeSpaceCandidates = new Set([
    claimDoc,
    ...allDocFiles,
    ...repoFiles.filter((file) => /(^|\/)(SECURITY|THREAT[_-]?MODEL)\.md$/i.test(file)),
  ]);
  const negativeSpaceDoc = [...negativeSpaceCandidates].find(
    (file) =>
      fileContains(repoPath, file, NEGATIVE_SPACE_SECTION_PATTERN) ||
      fileContains(repoPath, file, NEGATIVE_SPACE_PHRASE_PATTERN),
  );
  if (negativeSpaceDoc) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        negativeSpaceDoc,
        'claim_reconciliation',
        'Documented limitations / threat model / "not covered" section',
      ),
    );
  }

  return {
    criterionId: 'A5',
    positiveEvidence: evidence,
    findings:
      reconciliationArtifacts.length > 0
        ? []
        : [
            {
              // Proxy-only A5: cap at warning (never critical) — a static proxy is lower-confidence
              // than a curated registry or reconciliation artifact. Downgraded to info when the repo
              // documents honest negative space: that scoping IS a form of claim-reality discipline,
              // not an additional gap on top of the missing dedicated artifact.
              severity: negativeSpaceDoc ? 'info' : 'warning',
              summary: negativeSpaceDoc
                ? 'Claim source and implementation files are present; no dedicated claim-reality report artifact was supplied, but the repo explicitly documents what it does NOT cover/protect against — honest scoping, not overclaiming.'
                : 'Claim source and implementation files are present, but no dedicated claim-reality report artifact was supplied.',
              evidence: firstEvidence,
            },
          ],
    // Recalibrated (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H1):
    // reconciliation_artifact_depth is usually 0 on the generic-proxy path, so its prior 0.3
    // weight was a floor drag on external repos regardless of how well they otherwise document
    // and back claims. Weight remains 0.15 (still a real ding when a content-authenticated,
    // generically named reconciliation artifact is absent) and is redistributed to the two
    // metrics that every well-run external repo can earn; claim_source_depth's
    // denominator lowered from 8 to 4 (README + a couple of top-level docs is already a
    // reasonably documented repo, not a fraction of an inflated 8-file bar).
    metrics: [
      metric(
        'claim_match_rate',
        'Claim match rate',
        boundedImplCount,
        Math.max(boundedImplCount + boundedDocCount, 1),
        0.5,
        'ratio',
        'Uses bounded implementation-to-claim-source depth as a static proxy when no dedicated artifact exists.',
      ),
      metric(
        'claim_source_depth',
        'Claim source depth',
        allDocFiles.length,
        4,
        0.35,
        'docs',
        'Credits multiple claim-bearing documents without judging unverified prose as truth.',
        'saturating_count',
      ),
      metric(
        'reconciliation_artifact_depth',
        'Reconciliation artifact depth',
        reconciliationArtifacts.length,
        3,
        0.15,
        'artifacts',
        'Requires a specific claim-reality artifact to reach full depth.',
      ),
    ],
  };
}

function collectB2PrTraceEvidence(
  repoPath: string,
  repoFiles: readonly string[],
): WitanCriterionSignalPayload | null {
  const workflows = repoFiles.filter(isCiWorkflow);
  const prTemplate = repoFiles.find((file) =>
    /(^|\/)(pull_request_template|PULL_REQUEST_TEMPLATE)\.md$/.test(file),
  );
  const branchProtectionDoc = repoFiles.find((file) =>
    /branch.*protection|review.*gate|CODEOWNERS/i.test(file),
  );
  const evidence = [
    ...workflows
      .slice(0, 3)
      .map((file) => evidenceForRelative(repoPath, file, 'ci_run', 'Pull-request CI workflow')),
    ...(prTemplate
      ? [evidenceForRelative(repoPath, prTemplate, 'pull_request', 'Pull request template')]
      : []),
    ...(branchProtectionDoc
      ? [
          evidenceForRelative(
            repoPath,
            branchProtectionDoc,
            'pull_request',
            'Review gate configuration',
          ),
        ]
      : []),
  ];
  if (evidence.length === 0) return null;
  return {
    criterionId: 'B2',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      // Recalibrated (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3 H1): max
      // lowered from 5 to 2 and weight raised from 0.65 — a single CI workflow already
      // reaches half credit and CI + one other primitive reaches full credit; the prior
      // 5-slot denominator meant most well-run repos (CI only, no PR template/CODEOWNERS)
      // sat well under half credit here even with a healthy PR-trace posture.
      metric(
        'pr_trace_primitives',
        'PR trace primitive coverage',
        workflows.length + (prTemplate ? 1 : 0) + (branchProtectionDoc ? 1 : 0),
        2,
        0.8,
        'signals',
        'Measures CI, PR template, and review-gate evidence for pull-request traceability.',
        'saturating_count',
      ),
      // Weight lowered from 0.35 (Phase 3 H1): squash-merge and local-history repos with
      // no "Merge pull request"/"#123" commit-subject convention legitimately score 0/N
      // here despite otherwise healthy PR discipline — this metric is now a minor modifier
      // rather than able to single-handedly drag a well-run repo to critical.
      metric(
        'pr_merge_ratio',
        'Recent PR merge ratio',
        readRecentCommits(repoPath).filter((commit) => isPrMergeCommit(commit)).length,
        Math.max(readRecentCommits(repoPath).length, 1),
        0.2,
        'ratio',
        'Uses bounded git history as a deterministic proxy for PR outcome traceability.',
      ),
    ],
  };
}

function collectB3CiDisciplineEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  mono?: MonorepoContext | null,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const packageJson = findRootPackageJson(repoFiles);
  const scripts = packageJson ? readPackageScripts(join(repoPath, packageJson)) : new Map();
  const workflows = repoFiles.filter(isCiWorkflow);
  const workflow = workflows[0];
  // CI workflows at the MONOREPO ROOT gate this sub-package's PRs too — count them.
  const rootWorkflows = mono ? mono.sharedFiles.filter(isCiWorkflow) : [];
  const defaultBranchCiCount =
    workflows.filter((file) => workflowTargetsDefaultBranch(repoPath, file)).length +
    (mono
      ? rootWorkflows.filter((file) => workflowTargetsDefaultBranch(mono.root, file)).length
      : 0);

  if (packageJson && scripts.has('test')) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'test_run', 'Test script'));
  }
  if (packageJson && scripts.has('lint')) {
    evidence.push(evidenceForRelative(repoPath, packageJson, 'ci_run', 'Lint script'));
  }
  if (workflow) evidence.push(evidenceForRelative(repoPath, workflow, 'ci_run', 'CI workflow'));
  else if (rootWorkflows[0] && mono)
    evidence.push(
      evidenceForRelative(mono.root, rootWorkflows[0], 'ci_run', 'CI workflow (monorepo root)'),
    );

  if (evidence.length === 0) return null;

  // Language-agnostic CI command depth: credit test/lint/typecheck/build commands embedded in
  // CI workflows, counted by DISTINCT CATEGORY (not by file) — goal_cejel_process_rubric_
  // external_repo_calibration_2026-07-06. Counting by file structurally favored Node repos: a
  // Node project earns up to 4 via separate package.json scripts (test/lint/typecheck/build),
  // while a Python/Go/Rust project that runs pytest+flake8+mypy in a single workflow job (the
  // normal shape for those ecosystems) previously earned only 1 (one file matched, regardless
  // of how many distinct commands it ran) — verified live against a Flask-shaped fixture, which
  // landed B3 "critical" (1.0/4.0) purely from this file-vs-category mismatch, not from any
  // real CI gap. Category counting treats "this CI runs a test command, a lint command, and a
  // type-check command" the same whether that's 1 workflow file or 4.
  const CI_BUILD_COMMAND_PATTERN = /\b(cargo\s+build|cmake|ninja|make\s+(build|all))\b/i;
  const CI_COMMAND_CATEGORIES: readonly RegExp[] = [
    CI_TEST_COMMAND_PATTERN,
    CI_LINT_COMMAND_PATTERN,
    CI_TYPECHECK_COMMAND_PATTERN,
    CI_BUILD_COMMAND_PATTERN,
  ];
  const scriptDepth = ['test', 'lint', 'typecheck', 'build'].filter((s) => scripts.has(s)).length;
  const countCiCommandCategories = (root: string, files: readonly string[]): number =>
    CI_COMMAND_CATEGORIES.filter((pattern) =>
      files.some((file) => fileContains(root, file, pattern)),
    ).length;
  const ciCommandDepth =
    countCiCommandCategories(repoPath, workflows) +
    (mono ? countCiCommandCategories(mono.root, rootWorkflows) : 0);
  const combinedDepth = scriptDepth + ciCommandDepth;

  return {
    criterionId: 'B3',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      metric(
        'ci_script_depth',
        'CI verification depth',
        combinedDepth,
        4,
        0.45,
        'signals',
        'Counts npm verification scripts plus distinct test/lint/typecheck/build command categories detected anywhere in CI workflows; language-agnostic, counted by category not by file.',
        'saturating_count',
      ),
      metric(
        'default_branch_ci_depth',
        'PR-gate CI workflow count',
        defaultBranchCiCount,
        4,
        0.55,
        'workflows',
        'Counts CI workflows that target pull requests or the default branch, up to 4.',
        'saturating_count',
      ),
    ],
  };
}

export function auditFreshnessCommitterYearFromGitResult(
  result: GitExecResult,
  scanLimitations: Set<string>,
): string | null {
  if (!result.ok) {
    if (!isExpectedGitAbsence(result)) {
      scanLimitations.add(
        `${describeGitFailure(result.reason, 'HEAD committer-date discovery')} Cejel omitted the numeric B4 freshness year and retained only static freshness markers.`,
      );
    }
    return null;
  }
  const year = /^([0-9]{4})-/.exec(result.stdout.trim())?.[1];
  if (!year) {
    scanLimitations.add(
      'Cejel: local git HEAD committer-date discovery returned a malformed date. Cejel omitted the numeric B4 freshness year and retained only static freshness markers.',
    );
    return null;
  }
  return year;
}

function readAuditFreshnessCommitterYear(
  repoPath: string,
  scanLimitations: Set<string>,
): string | null {
  return auditFreshnessCommitterYearFromGitResult(
    execGit(['show', '-s', '--format=%cI', 'HEAD'], { cwd: repoPath }),
    scanLimitations,
  );
}

function collectB4AuditEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  generatedAt: string,
  useV19CommitYear = false,
  scanLimitations: Set<string> = new Set(),
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const auditFiles = repoFiles.filter(isAuditFile);
  for (const file of auditFiles.slice(0, 5)) {
    evidence.push(evidenceForRelative(repoPath, file, 'audit_log', 'Audit or changelog artifact'));
  }
  if (evidence.length === 0) {
    // FIX (goal_cejel_calibration_fix_with_strict_gate_2026-07-06): originally a `null`
    // signal scored 0.0-unverified INSIDE the process-trust average, so this returns an
    // explicit not_applicable instead. A null now maps to insufficient_data (also excluded
    // — goal_cejel_b2_insufficient_data_not_zero_2026-07-10), but N/A stays correct here:
    // a repo with zero recognized audit-trail artifacts has no audit surface at all
    // (inapplicable), which is a different honest state than "had a surface, no data".
    return buildNotApplicableSignal(
      'B4',
      'No audit-trail artifact detected (CHANGELOG/CHANGES/HISTORY/NEWS/SECURITY/AUDIT/STATUS/ ' +
        'release-notes/runbook/provenance file) — B4 not applicable to this repo.',
    );
  }
  // FIX (goal_cejel_b4_archetype_gate_2026-07-11): a security-policy file (SECURITY.md and
  // its docs/*security* equivalent) is a static disclosure document, not a changelog/audit
  // trail — it carries no expectation of being kept "fresh" the way a CHANGELOG or AUDIT log
  // does. A repo whose ONLY audit-trail artifact is a security policy (e.g. ossf/scorecard,
  // which publishes release notes via GitHub Releases rather than a committed CHANGELOG) has
  // no surface B4 can actually rate: scoring audit_artifact_depth/audit_freshness_depth
  // against a lone SECURITY.md produced a false CRITICAL on Google's own supply-chain
  // auditing tool. Same archetype-aware N/A pattern as A2 (data-layer/secrets surface) and
  // A3 (deploy surface) above — reused, not reinvented. Where a genuine changelog/audit-log/
  // status/provenance artifact exists alongside (or instead of) the security policy, this
  // gate does not fire and B4 scores exactly as it always has (a stale/absent CHANGELOG is
  // still penalised — this narrows WHEN B4 applies, never HOW HARSHLY it scores).
  const freshnessRatableFiles = auditFiles.filter(isFreshnessRatableAuditFile);
  if (freshnessRatableFiles.length === 0) {
    return buildNotApplicableSignal(
      'B4',
      'Only a static security-policy artifact (e.g. SECURITY.md) was detected — no committed ' +
        'CHANGELOG/CHANGES/HISTORY/NEWS/AUDIT/STATUS/release-notes/runbook/provenance file to ' +
        'rate for an audit trail. The project may publish release history outside the ' +
        'repository (e.g. GitHub Releases). B4 has no ratable surface here; it is excluded ' +
        'rather than scored.',
    );
  }
  // Historical rubrics retain their exact scan-year behavior. Prospective v19 instead binds
  // numeric freshness to immutable HEAD committer metadata. If Git is expectedly absent or its
  // bounded read fails, v19 uses only static markers and never consults wall clock or file mtimes.
  const referenceYear = useV19CommitYear
    ? readAuditFreshnessCommitterYear(repoPath, scanLimitations)
    : String(new Date(generatedAt).getFullYear());
  const freshnessPattern = new RegExp(
    `${referenceYear ? `${referenceYear}|` : ''}recent|latest|current`,
    'i',
  );
  return {
    criterionId: 'B4',
    positiveEvidence: evidence,
    findings: [],
    metrics: [
      // Recalibrated (Phase 3 H1): max lowered from 6 to 3 and weight raised from 0.7 — a
      // well-run non-substrate repo typically carries SECURITY.md + CHANGELOG.md (2 files)
      // at most, not 6; the prior denominator meant that healthy baseline never cleared
      // half credit.
      metric(
        'audit_artifact_depth',
        'Audit artifact depth',
        auditFiles.length,
        3,
        0.8,
        'files',
        'Measures quantity of audit, security, runbook, incident, status, and changelog artifacts.',
        'saturating_count',
      ),
      // Weight lowered from 0.3 (Phase 3 H1): most CHANGELOGs/SECURITY docs carry dates
      // rather than the literal words "recent"/"latest"/"current", so this metric is a
      // minor freshness modifier, not able to drag a repo with real audit artifacts down
      // to critical on its own.
      metric(
        'audit_freshness_depth',
        'Audit freshness depth',
        countFilesContaining(repoPath, auditFiles, freshnessPattern),
        Math.max(auditFiles.length, 1),
        0.2,
        'ratio',
        useV19CommitYear
          ? 'Credits audit artifacts that carry the scanned HEAD committer year or static freshness/current-state markers.'
          : 'Credits audit artifacts that carry freshness/current-state markers.',
      ),
    ],
  };
}

/**
 * B6 — does the codebase let an agent self-execute privileged/credentialed operations
 * (prod DB admin GRANTs, role/privilege escalation, access-control bypass), or does it
 * document and enforce that these stay human-gated? A repo that lets an agent self-execute
 * scores LOWER; a repo with no privileged-operation surface at all is not_applicable.
 */
function collectB6PrivilegedOpsGatingEvidence(
  repoPath: string,
  repoFiles: readonly string[],
  useV39Detectors = false,
  useV21ExecutedEscalations = false,
): WitanCriterionSignalPayload | null {
  const evidence: WitanEvidencePointer[] = [];
  const findings: WitanCriterionSignalPayload['findings'] = [];

  const docFiles = repoFiles.filter((file) => /\.(md|mdx)$/i.test(file));
  const humanGateDoc = docFiles.find((file) =>
    fileContains(repoPath, file, HUMAN_GATE_MARKER_PATTERN),
  );

  const implFiles = repoFiles.filter(isImplementationFile);
  const gatedPrivilegeCheckFile = implFiles.find(
    (file) =>
      fileContains(repoPath, file, GATED_PRIVILEGE_CHECK_PATTERN) &&
      fileContains(repoPath, file, SET_ROLE_PATTERN),
  );
  // Un-overridable kill-switch / fail-safe ordering (goal_cejel_rubric_refinement_from_lua_2026-07-06):
  // a named governance/safety toggle whose falsy state triggers an immediate guard-clause
  // return/throw, so no lower-priority config can proceed past it. Bounded, positive-only —
  // its absence never lowers the score.
  const killSwitchFile = implFiles.find(
    (file) =>
      fileContains(repoPath, file, KILL_SWITCH_NAME_PATTERN) &&
      fileContains(repoPath, file, KILL_SWITCH_FAIL_CLOSED_PATTERN),
  );

  // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: most external repos have no
  // privileged-DB-operation surface at all, but still practice a general form of human
  // gating on sensitive changes — a CODEOWNERS file (or a documented required-review/branch-
  // protection policy) requires a human to sign off before a change to a protected path
  // merges. This is the OSS-observable analogue of "privileged operations stay human-gated";
  // credit it as (weaker) positive evidence instead of defaulting straight to not_applicable.
  const codeownersFile = repoFiles.find((file) => /(^|\/)CODEOWNERS$/.test(file));
  const reviewGateDoc = docFiles.find((file) =>
    fileContains(repoPath, file, REQUIRED_REVIEW_PATTERN),
  );
  const protectedPathReviewGate = codeownersFile ?? reviewGateDoc;

  // Only files that actually execute SQL are candidates for an ungated escalation finding —
  // a runbook or doc comment that merely names the GRANT a human should run is not code
  // executing it, and is excluded below anyway once it carries the human-gate marker.
  const executableFiles = implFiles.filter((file) =>
    fileContains(repoPath, file, SQL_EXEC_PATTERN),
  );
  const historicalUngatedEscalationFiles = executableFiles.filter((file) => {
    if (useV39Detectors && !fileHasExecutedPrivilegeEscalation(repoPath, file)) return false;
    const hasEscalation =
      fileContains(repoPath, file, ROLE_MEMBERSHIP_GRANT_PATTERN) ||
      fileContains(repoPath, file, SUPERUSER_ESCALATION_PATTERN);
    if (!hasEscalation) return false;
    return !fileContains(repoPath, file, HUMAN_GATE_MARKER_PATTERN);
  });
  const v21ExecutedEscalationFiles = useV21ExecutedEscalations
    ? repoFiles.filter(
        (file) =>
          isV39AuthoredProductionPath(file) &&
          (fileHasV21RawSqlEscalation(repoPath, file) ||
            (isImplementationFile(file) && fileHasV21DriverEscalation(repoPath, file))),
      )
    : [];
  const v21ExecutedEscalationFileSet = new Set(v21ExecutedEscalationFiles);
  const ungatedEscalationFiles = [
    ...new Set([...historicalUngatedEscalationFiles, ...v21ExecutedEscalationFiles]),
  ].filter((file) => !fileContains(repoPath, file, HUMAN_GATE_MARKER_PATTERN));
  // A GRANT statement asserted inside a test file exercises the detector itself, not a
  // production self-execution path — exclude it from both the finding set and the
  // production cleanliness metric.
  const productionUngatedEscalationFiles = ungatedEscalationFiles.filter((file) =>
    useV39Detectors ? isV39AuthoredProductionPath(file) : !isTestOrFixturePath(file),
  );

  if (humanGateDoc) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        humanGateDoc,
        'artifact',
        'Documents privileged operations as human-executed/gated',
      ),
    );
  }
  if (gatedPrivilegeCheckFile) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        gatedPrivilegeCheckFile,
        'artifact',
        'Fail-closed privilege-membership check before role elevation',
      ),
    );
  }
  if (killSwitchFile) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        killSwitchFile,
        'artifact',
        'Un-overridable kill-switch / fail-safe governance toggle',
      ),
    );
  }
  if (protectedPathReviewGate) {
    evidence.push(
      evidenceForRelative(
        repoPath,
        protectedPathReviewGate,
        'artifact',
        'CODEOWNERS/required-review gate on protected paths',
      ),
    );
  }
  for (const file of productionUngatedEscalationFiles.slice(0, 5)) {
    const isV21ExecutedShape = v21ExecutedEscalationFileSet.has(file);
    findings.push({
      severity: 'critical',
      summary: isV21ExecutedShape
        ? 'An authored SQL artifact contains, or a direct database-driver call executes, an administrative role grant, SUPERUSER escalation, or schema-wide table privilege grant with no documented human gate.'
        : 'Role-membership GRANT or SUPERUSER escalation executes in code with no documented human gate.',
      evidence: evidenceForRelative(
        repoPath,
        file,
        'artifact',
        isV21ExecutedShape
          ? 'Ungated authored or directly executed administrative SQL statement'
          : 'Ungated privilege-escalation statement',
      ),
    });
  }

  if (evidence.length === 0 && findings.length === 0) {
    return buildNotApplicableSignal(
      'B6',
      'No privileged-operation surface (prod DB admin GRANT/privilege DDL, role escalation, or ' +
        'documented human-gate governance) detected in this repo.',
    );
  }

  // Omitted entirely (not scored 0) when no kill-switch pattern was detected — positive-only,
  // its absence never lowers the score.
  const killSwitchMetrics: WitanCriterionMetric[] = killSwitchFile
    ? [
        metric(
          'kill_switch_fail_safe_present',
          'Un-overridable kill-switch present',
          1,
          1,
          0.15,
          'present',
          'Credits a governance/safety toggle that fails closed before any lower-priority config can override it.',
        ),
      ]
    : [];

  // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: the first two metrics below
  // (human_gate_documented, fail_closed_privilege_check) are only meaningful when the repo
  // actually has SOMETHING privileged-operation-shaped to gate — a SQL-executing file, a
  // human-gate doc, or a fail-closed check. Most external repos have none of that surface at
  // all; scoring those two metrics 0 in that case would penalize a repo for not building a
  // defense against a threat it doesn't have, rather than measuring whether it gates the
  // privileged operations it DOES have. When no such surface exists, shift their weight onto
  // the two metrics that remain meaningful (cleanliness — vacuously true with nothing to be
  // unclean — and the general protected-path review-gate proxy).
  const hasPrivilegedOpsSurface =
    humanGateDoc != null ||
    gatedPrivilegeCheckFile != null ||
    executableFiles.length > 0 ||
    v21ExecutedEscalationFiles.length > 0;

  return {
    criterionId: 'B6',
    positiveEvidence: evidence,
    findings,
    metrics: [
      ...(hasPrivilegedOpsSurface
        ? [
            metric(
              'human_gate_documented',
              'Human gate documented',
              humanGateDoc ? 1 : 0,
              1,
              0.4,
              'present',
              'Credits explicit documentation that privileged/credentialed operations are human-executed, never agent-run.',
            ),
            metric(
              'fail_closed_privilege_check',
              'Fail-closed privilege check present',
              gatedPrivilegeCheckFile ? 1 : 0,
              1,
              0.3,
              'present',
              'Credits code that checks role membership and fails closed before elevating privilege, instead of attempting elevation blind.',
            ),
          ]
        : []),
      metric(
        'privilege_escalation_cleanliness',
        'Privilege-escalation cleanliness',
        productionUngatedEscalationFiles.length === 0 ? 1 : 0,
        1,
        hasPrivilegedOpsSurface ? 0.3 : 0.4,
        'clean',
        useV21ExecutedEscalations
          ? 'Penalizes authored SQL containing, and direct database-driver literals executing, an administrative role grant, SUPERUSER escalation, or schema-wide table privilege grant with no documented human gate; docs, tests, and fixtures are excluded.'
          : 'Penalizes code that executes a role-membership GRANT or SUPERUSER escalation with no documented human gate (test/fixture SQL is excluded from this production-code measurement).',
      ),
      metric(
        'protected_path_review_gate',
        'Protected-path review gate',
        protectedPathReviewGate ? 1 : 0,
        1,
        hasPrivilegedOpsSurface ? 0.2 : 0.6,
        'present',
        'Credits a CODEOWNERS file or documented required-review/branch-protection policy — the ' +
          'general OSS-observable analogue of human-gating changes to sensitive paths.',
      ),
      ...killSwitchMetrics,
    ],
    notes: useV21ExecutedEscalations
      ? 'B6 rewards documented, fail-closed human gating of privileged/credentialed operations and penalizes ungated administrative SQL contained in authored migrations or executed from direct database-driver literals.'
      : 'B6 rewards documented, fail-closed human gating of privileged/credentialed operations and penalizes ungated privilege-escalation code paths.',
  };
}

const CPP_TEST_FRAMEWORK_PATTERN =
  /<gtest\/gtest\.h>|<catch2\/|<doctest\/|<boost\/test\/|"gtest\/gtest\.h"|"catch2\//;
const CPP_TEST_MACRO_PATTERN =
  /\bTEST\s*\(|\bTEST_F\s*\(|\bTEST_CASE\s*\(|\bSECTION\s*\(|\bCATCH_|BOOST_AUTO_TEST_CASE\b|BOOST_FIXTURE_TEST_CASE\b/;
const CPP_CONTENT_SCAN_LIMIT = 150;

// ---- BEGIN canonical production-source classifier (single source of truth) ---------------
// THE ONE derived notion of "is this production code" for every content-scan detector in this
// file that anchors a finding's severity/inclusion to a file path — A2 secret scan, A2 crypto-
// timing/signing scan, B6 privilege-escalation scan, A3 deploy-entrypoint detection, and any
// future detector of the same shape. Test suites, mocks, fixtures, and examples routinely embed
// fake secrets and example dangerous statements to exercise these very detectors — flagging one
// of those paths as a live production finding is a cry-wolf false positive (cejel flagged its
// OWN test fixtures this way twice: goal_cejel_test_path_downgrade_2026-07-06, then again on the
// crypto-timing sub-rule in goal_cejel_a2_one_notion_of_production_code_2026-07-13 — the second
// time was the SAME defect one rule over, because that rule had no fixture awareness at all).
// Downgrade, never silence: the identical pattern in a real non-test path (src/, a migration, a
// workflow) still fires at full severity.
//
// NO RULE MAY DEFINE ITS OWN test-directory/fixture/spec/example PATH REGEX OUTSIDE THIS BLOCK.
// If a rule needs to know whether a path is production code, it calls isProductionSourcePath (or
// its complement isTestOrFixturePath) below — enforced by the static "Guard 3" assert in
// one-notion-of-production-code.test.ts.
const NON_PRODUCTION_DIR_PATTERN =
  /(^|\/)(__tests__|__mocks__|__fixtures__|tests?|fixtures?|testdata|e2e|cypress|examples?|samples?|demos?)(\/|$)/i;
const NON_PRODUCTION_FILE_SUFFIX_PATTERN =
  /\.(test|spec|stories)\.[^/]+$|_test\.go$|(^|\/)test_.*\.py$/i;

export function isTestOrFixturePath(path: string): boolean {
  return NON_PRODUCTION_DIR_PATTERN.test(path) || NON_PRODUCTION_FILE_SUFFIX_PATTERN.test(path);
}

function isProductionSourcePath(path: string): boolean {
  return !isTestOrFixturePath(path);
}

export function isAuthoredProductionPath(path: string): boolean {
  return isProductionSourcePath(path) && !GENERATED_OR_VENDOR_PATH_PATTERN.test(path);
}

const V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN =
  /(^|\/)(?:docs?|documentation|e2e[-_]?tests?)(\/|$)|(^|\/)(?:test|tests)[._-][^/]+$|(^|\/)[^/]*(?:appium|e2e[-_]?tests?)[^/]*$/i;

function isV39AuthoredProductionPath(path: string): boolean {
  return isAuthoredProductionPath(path) && !V39_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN.test(path);
}

// V47's failure-derived credential boundary covers semantic registries and instructional trees
// that are source-shaped but do not execute as the product. A value that resembles a credential
// inside generated bindings, localization/reference payloads, cookbook lessons, or markdown is
// review material, not evidence of a live production credential. This is deliberately versioned:
// v14 and the public default remain byte-stable.
const V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN =
  /(^|\/)(?:auto[-_]?gen(?:erated)?|generated|i18n|locales?|cookbooks?|lessons?)(\/|$)|\.(?:md|mdx|rst|adoc)$/i;

function isV47AuthoredProductionPath(path: string): boolean {
  return (
    isV39AuthoredProductionPath(path) && !V47_NON_PRODUCTION_CREDENTIAL_PATH_PATTERN.test(path)
  );
}

// A1 asks two narrower questions than content-scan detectors do: whether a file belongs in
// the test-to-source ratio, and whether its NAME declares a test rather than support
// scaffolding. Their language-specific conventions live here too, so this remains the only
// block that owns a notion of test/fixture/example paths even though the answers differ.
const TEST_DIRECTORY_SOURCE_PATTERN = new RegExp(
  `(^|/)(?:__tests__|tests?|specs?|[^/]+(?:Tests|Specs))/(?:.*\\.)?(?:${SOURCE_LANGUAGES.flatMap((language) => language.extensions).join('|')})$`,
);
const TEST_DIRECTORY_SOURCE_PATTERN_V17 = new RegExp(
  `(^|/)(?:__tests__|tests?|specs?|[^/]+(?:Tests|Specs))/(?:.*\\.)?(?:${[
    ...SOURCE_LANGUAGES_V10.flatMap((language) => language.extensions),
    'bats',
  ].join('|')})$`,
  'i',
);

function isTestFile(file: string, rubricVersion = WITAN_RUBRIC_VERSION): boolean {
  return (
    (usesV17DetectorClosure(rubricVersion) &&
      (TEST_DIRECTORY_SOURCE_PATTERN_V17.test(file) ||
        /\.tftest\.hcl$/i.test(file) ||
        /\.bats$/i.test(file) ||
        /(^|\/)test[^/]*\.m$/i.test(file) ||
        /_test\.m$/i.test(file))) ||
    TEST_DIRECTORY_SOURCE_PATTERN.test(file) ||
    // AVA's default discovery includes test.js and test-*.js at the scanned package root.
    // Keep this root-anchored: nested files need an existing test-directory/suffix convention.
    /^test(?:-[^/]+)?\.[cm]?[jt]sx?$/.test(file) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(file) ||
    /(^|\/)test_.*\.py$/.test(file) ||
    /_test\.go$/.test(file) ||
    /(^|\/)test_.*\.(cpp|cc|cxx)$/.test(file) ||
    /_(test|tests)\.(cpp|cc|cxx)$/.test(file) ||
    /Tests?\.(java|kt)$/.test(file) ||
    /(_test|_spec)\.(rs|rb|php|swift|kt)$/.test(file)
  );
}

// Files whose NAME declares them to be tests (as opposed to files that merely live under a
// test/tests/spec directory). Big suites keep substantial support scaffolding next to their
// tests — Django's tests/<app>/models.py + urls.py, fixture files in Rust crates' tests/
// dirs — and counting that scaffolding as "hollow test files" misreads a mature suite the
// same way the missing-assertion-idiom bug did (Django: ~1100 of 2036 detected "test files"
// are scaffolding with no test in them).
const NAME_SHAPED_TEST_FILE_PATTERN =
  /^test(?:-[^/]+)?\.[cm]?[jt]sx?$|\.(test|spec)\.[cm]?[jt]sx?$|(^|\/)__tests__\/|(^|\/)test_[^/]*\.py$|(^|\/)tests?\.py$|_test\.go$|(^|\/)test_[^/]*\.(cpp|cc|cxx)$|_(test|tests)\.(cpp|cc|cxx)$|Tests?\.(java|kt)$|(_test|_spec)\.(rs|rb|php|swift|kt)$/;
const NAME_SHAPED_TEST_FILE_PATTERN_V17 = /\.tftest\.hcl$|\.bats$|(^|\/)test[^/]*\.m$|_test\.m$/i;
// ---- END canonical production-source classifier -------------------------------------------

const TEST_RUNNER_PATTERN =
  /\b(vitest|jest|mocha|ava|tap|pytest|go test|cargo test|rspec|phpunit|gradle test|mvn test|node\s+--test|node:test)\b/i;
// Language-agnostic "CI actually runs the test suite" signal — shared by A1 (test integrity)
// and B3 (CI discipline) so a repo whose tests only run inside a CI workflow (the normal
// shape for Python/Go/Rust/Java, which have no package.json to hold an npm "test" script)
// gets credited the same as a repo with an npm test script (goal_cejel_code_trust_external_
// ecosystem_calibration_2026-07-06).
const CI_TEST_COMMAND_PATTERN =
  /\b(pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|dotnet\s+test|ctest|make\s+test|jest|vitest|mocha|rspec|phpunit|pnpm\s+(?:run\s+)?test|npm\s+(?:run\s+)?test|yarn\s+(?:run\s+)?test|node\s+--test|node:test)\b|--target[=\s]+test\b/i;
// Same rationale as CI_TEST_COMMAND_PATTERN above — shared by A1 and B3 so a Python/Go/Rust
// repo whose lint/typecheck discipline only shows up as a CI command (no package.json script
// key to credit) is recognized the same as a Node repo with npm "lint"/"typecheck" scripts.
const CI_LINT_COMMAND_PATTERN = /\b(eslint|pylint|flake8|black|ruff)\b/i;
const CI_TYPECHECK_COMMAND_PATTERN = /\b(tsc|mypy|pyright)\b/i;

// ---- Scheduled product-health workflow (generalized A1 sub-signal) -----------
//
// The concept, detected by SHAPE, never by filename: does this repository run a
// cron-scheduled workflow that exercises its verification suite, and are that
// workflow's results durably published somewhere a reader could actually check —
// or only handed to an ephemeral, access-gated CI artifact? This repository's own
// `.github/workflows/bede-nightly.yml` is one recognized instance of the shape
// (schedule trigger + `pnpm test` + `actions/upload-artifact`, no durable publish
// step) — a differently-named nightly workflow with the same shape is detected
// identically, and a repo whose nightly workflow is named "bede-nightly.yml" but
// lacks the shape (no schedule trigger, no test-run command) is not flagged at all
// (goal_cejel_generalize_homefield_rule_and_rescore_protocol_2026-07-12).
const SCHEDULE_TRIGGER_PATTERN = /(^|\n)\s*schedule:\s*\r?\n\s*-\s*cron:/;
// Durable-publication markers: the workflow visibly does more than hand its result
// to an ephemeral, access-gated CI artifact — it pushes a persisted, checkable
// record (a public pages deploy, a commit back to the repo, a PR/issue comment).
const PUBLISHED_RESULT_MARKER_PATTERN =
  /actions\/deploy-pages|actions\/upload-pages-artifact|peaceiris\/actions-gh-pages|git\s+push\b|create-or-update-comment/i;
const EPHEMERAL_ARTIFACT_ONLY_PATTERN = /actions\/upload-artifact/i;
const SCHEDULED_HEALTH_PATH_PATTERN = /(?:health|smoke|monitor|status|uptime|canary)/i;
const SCHEDULED_HEALTH_INTENT_PATTERN =
  /\b(?:product[- ]?health|health check|smoke test|monitor(?:ing)?|uptime|canary|fault detection)\b/i;

const RLS_PATTERN = /row level security|enable rls|create policy|tenant[_-]?id|studio[_-]?id/i;
// DB client imports across JS/TS, Python, Go, Rust, Ruby, Java, PHP.
const DB_CLIENT_PATTERN =
  /\b(pg|mysql|mysql2|sqlite3|mongodb|mongoose|sequelize|drizzle|prisma|knex|typeorm|redis|ioredis|better-sqlite3|asyncpg|psycopg2?|sqlalchemy|pymongo|aiosqlite|database\/sql|gorm|sqlx|diesel|rusqlite|ActiveRecord|Sequel|PDO|JDBC|Hibernate)\b/i;
// Env-var read patterns across JS/TS, Python, Ruby, Go, Rust, C/C++, PHP.
// FIX 3: Multi-language — matches same set as the surface detector recognizes
// (os.environ, getenv(, std::env::, ENV[) so non-JS repos aren't penalised.
const ENV_READ_PATTERN = /process\.env\b|Deno\.env\b|os\.environ\b|getenv\s*\(|std::env::|ENV\[/;
const TENANT_SCOPE_PATTERN =
  /tenantId|tenant_id|studioId|studio_id|organizationId|org_id|workspaceId/i;
const TENANT_SCOPE_PATTERN_V10 =
  /tenantId|tenant_id|studioId|studio_id|organizationId|organization_id|org_id|accountTenantId|account_tenant_id/i;
const TENANT_SCOPE_PATTERN_V11 = /tenantId|tenant_id|accountTenantId|account_tenant_id/i;
// B6 — privileged-operation human gating (goal_privileged_op_human_gate_learn_2026-07-04).
// Doc-level: privileged ops are documented as human-executed/gated, not agent-run.
const HUMAN_GATE_MARKER_PATTERN =
  /human[- ]executed|human[- ]gated|operator[- ]run|never agent-run|agents? (?:never|does not|do not) (?:hold|execute|run) (?:prod(?:uction)?\s+)?(?:admin|db) (?:credential|privilege)/i;
// Code-level: a role-membership/administrative GRANT (as opposed to an ordinary object
// privilege grant like SELECT/INSERT/USAGE, which is routine and does not escalate a role).
const ROLE_MEMBERSHIP_GRANT_PATTERN =
  /\bGRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b/i;
const SUPERUSER_ESCALATION_PATTERN = /\b(ALTER|CREATE)\s+(ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b/i;
const BROAD_SCHEMA_TABLE_GRANT_PATTERN =
  /\bGRANT\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\b/i;
// Marks a file that actually executes SQL (vs. one that only documents or references it).
const SQL_EXEC_PATTERN = /\.execute\s*\(|sql\.raw\s*\(/;
const EXECUTED_ESCALATION_LITERAL_PATTERN =
  /(?:\.execute|sql\.raw)\s*\(\s*(?:[rubf]+)?["'`][^"'`]{0,500}(?:GRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b|(?:ALTER|CREATE)\s+(?:ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b)/i;
const V21_DRIVER_EXECUTED_ESCALATION_PATTERN =
  /\.(?:query|execute)\s*\(\s*(?:[rubf]+)?["'`]\s*(?:GRANT\s+(?!SELECT\b|INSERT\b|UPDATE\b|DELETE\b|USAGE\b|ALL\b|EXECUTE\b|TRIGGER\b|REFERENCES\b|CREATE\b|CONNECT\b|TEMP(?:ORARY)?\b)[A-Za-z_]\w*\s+TO\b|(?:ALTER|CREATE)\s+(?:ROLE|USER)\s+\w+[^;]*\bSUPERUSER\b|GRANT\s+ALL\s+PRIVILEGES\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\b)/i;
const V21_RAW_SQL_ESCALATION_PATTERN = new RegExp(
  `(?:^|[;\\n])\\s*(?:${ROLE_MEMBERSHIP_GRANT_PATTERN.source}|${SUPERUSER_ESCALATION_PATTERN.source}|${BROAD_SCHEMA_TABLE_GRANT_PATTERN.source})`,
  'i',
);

function fileHasExecutedPrivilegeEscalation(repoPath: string, file: string): boolean {
  return fileContains(repoPath, file, EXECUTED_ESCALATION_LITERAL_PATTERN);
}

function fileHasV21DriverEscalation(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const withoutComments = stripCommentAndDocumentationExamples(
    readRepoText(fullPath, 'utf8'),
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
  return V21_DRIVER_EXECUTED_ESCALATION_PATTERN.test(withoutComments);
}

function fileHasV21RawSqlEscalation(repoPath: string, file: string): boolean {
  if (!/\.sql$/i.test(file)) return false;
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const withoutComments = readRepoText(fullPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\r\n]*/g, '');
  return V21_RAW_SQL_ESCALATION_PATTERN.test(withoutComments);
}
// Fail-closed privilege-membership check ahead of a role elevation (see verifyAsAppRole).
const GATED_PRIVILEGE_CHECK_PATTERN = /pg_has_role\s*\(|has_role\s*\(|is not a member of/i;
const SET_ROLE_PATTERN = /\bset\s+(local\s+)?role\b/i;
// OSS-observable analogue for B6 (goal_cejel_calibration_fix_with_strict_gate_2026-07-06): a
// documented required-review / branch-protection policy, distinct from a bare CODEOWNERS file
// which is detected separately by presence alone.
const REQUIRED_REVIEW_PATTERN = /required review|branch protection|protected branch/i;
const HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT = 5_000;
// Keyword may appear ANYWHERE in the identifier left of `=`/`:` (not just immediately
// before it) so `stripe_secret_key`, `myApiKey`, `access_token_value` are caught, not just
// bare `secret =` / `apiKey =` (goal_cejel_launch_hardening_combined_2026-07-06, Phase 2 FN
// #3). This deliberately over-matches identifiers like `tokenizerConfig` — that's fine,
// because looksLikeSecretValue below still requires the assigned VALUE to look
// secret-shaped before anything fires.
const SECRET_IDENTIFIER_KEYWORD_PATTERN = /secret|token|api[_-]?key|password|access[_-]?key/gi;
const SINGLE_WHITESPACE_PATTERN = /\s/u;
// Unambiguous branded secret formats — the prefix alone is enough evidence (real API keys
// use these exact vendor-specific shapes; nothing benign collides with them).
const SECRET_VALUE_BRANDED_PATTERN =
  /^(?:sk-[A-Za-z0-9_-]{24,}|sk-ant-api\d{2}-[A-Za-z0-9_-]{80,}|ghp_[A-Za-z0-9_]{30,}|xox[baprs]-[A-Za-z0-9-]{24,}|AKIA[0-9A-Z]{16}|vcp_[A-Za-z0-9_:-]{24,})$/;
// Generic (unbranded) token shape — the same charset a base64/hex checksum, JWT segment,
// or bcrypt hash also uses. Shape alone is NOT sufficient; isGenericSecretValue below also
// requires real entropy and excludes known digest lengths before treating this as a secret.
const GENERIC_SECRET_SHAPE_PATTERN = /^[A-Za-z0-9/+_-]{40,}$/;
// Digest lengths for hex-encoded MD5/SHA-1/SHA-256/SHA-512 (32/40/64/128 hex chars).
const KNOWN_HEX_DIGEST_LENGTHS = new Set([32, 40, 64, 128]);
// Byte lengths for MD5/SHA-1/SHA-224/SHA-256/SHA-384/SHA-512 once base64-decoded.
const KNOWN_DIGEST_BYTE_LENGTHS = new Set([16, 20, 28, 32, 48, 64]);

// ---- goal_cejel_rubric_refinement_from_lua_2026-07-06 -------------------------------------
// Rubric refinements surfaced by reading a well-built MIT governance library (Lua
// governance-sdk) that cejel mis-scored: honest scoping, a lean built-in test toolchain, and
// crypto/governance hygiene were treated as gaps rather than credited as positive signals.

// A5 — a doc that explicitly names what it does NOT protect against/cover is MORE
// trustworthy than one that overclaims; do not treat this honest scoping as a missing-claim
// gap. Requires an explicit heading or phrase — a bare mention of the word "limitations" in
// prose is not enough to avoid rewarding vague hedging.
const NEGATIVE_SPACE_SECTION_PATTERN =
  /^#{1,6}\s*(?:security\s+)?(?:limitations?|threat model|non-goals?|out of scope|known limitations|what this (?:library|package|tool|sdk|project) does not)/im;
const NEGATIVE_SPACE_PHRASE_PATTERN =
  /does not (?:protect|defend|guard|cover)s? against|not (?:covered|protected|defended) by this|out of scope for this (?:library|package|tool|sdk|project)/i;

// A1/B3 — a lean/built-in test toolchain (e.g. Node's built-in `node:test` runner) with no
// heavy transitive test dependency is a positive supply-chain signal, not a "missing coverage
// tool" ding — it has no separate coverage-config file by design (coverage is a CLI flag).
const LEAN_TEST_RUNNER_SCRIPT_PATTERN = /\bnode\s+(?:--test\b|--experimental-test-coverage\b)/;
const LEAN_TEST_RUNNER_IMPORT_PATTERN =
  /from\s+['"]node:test['"]|require\(\s*['"]node:test['"]\s*\)/;
const HEAVY_TEST_DEPENDENCY_NAME_PATTERN =
  /^(?:(?:jest|mocha|ava|tape|jasmine|karma|vitest|cypress|playwright)(?:$|-|\/)|@(?:vitest|playwright)\/)/i;

// A2 — bounded, conservative crypto-hygiene nudge. Only ever scored when a signing/HMAC/
// secret-comparison surface is actually detected in source; repos with no such surface are
// unaffected. Never a critical — a "nudge," not a new cry-wolf vector.
const TIMING_SAFE_COMPARE_PATTERN =
  /\btiming[-_]?safe[-_]?(?:equal|compare)\b|crypto\.timingSafeEqual\s*\(/i;
const CANONICAL_SERIALIZE_PATTERN =
  /\bcanonicalize\s*\(|\bcanonicalJson\b|\bstableStringify\s*\(|json-stable-stringify|safe-stable-stringify|\bsortKeys\s*\(/i;
const SIGN_OR_HMAC_CALL_PATTERN = /\bcreateHmac\s*\(|\bcreateSign\s*\(|\.sign\s*\(/;
// A plain ===/!== comparing a value whose identifier clearly names a crypto compare target
// (hmac/signature/mac/digest — deliberately narrower than "secret"/"token" to avoid matching
// routine string comparisons like `type === 'secret'`), against something other than a
// literal/undefined/null (which would be an ordinary presence check, not a security compare).
// Matched per LINE (not per file) so a real hit carries the actual line, never a fabricated
// one — see findInsecureSecretCompareLine below.
const INSECURE_SECRET_COMPARE_LINE_PATTERN =
  /\b\w*(?:hmac|signature|\bmac|digest)\w*\s*(===|!==)\s*(?!['"`]|undefined\b|null\b)([\w.]+(?:\s*[-+]\s*\d+)?)/i;
const DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN =
  /\b(?:secret|token|password|apiKey)\w*\s*(?:===|!==|==|!=)\s*[\w.]*default(?:Secret|Token|Password|ApiKey)\b/i;
// The rule must establish a plausible secret VALUE, never merely a secret-shaped NAME: a
// numeric-shaped right-hand operand — a bare number, a `.length`/`.size`/`.count` read, or an
// index/offset-named identifier — can never itself be a timing-leak-relevant secret value (it
// is a bounds check, e.g. `dotIndex === token.length - 1`, not a credential compare) and must
// never fire, however secret-shaped the left-hand identifier looks
// (goal_cejel_a2_one_notion_of_production_code_2026-07-13).
const NUMERIC_SHAPED_OPERAND_PATTERN =
  /^-?\d+$|\.(?:length|len|size|count)\b|(?:length|index|idx|offset|count|size|len)$/i;

function lineHasInsecureSecretCompare(line: string, useV39Detectors = false): boolean {
  if (useV39Detectors && DEFAULT_SECRET_SENTINEL_COMPARE_LINE_PATTERN.test(line)) return true;
  const match = INSECURE_SECRET_COMPARE_LINE_PATTERN.exec(line);
  const operand = match?.[2];
  if (!operand) return false;
  return !NUMERIC_SHAPED_OPERAND_PATTERN.test(operand.trim());
}

// Returns the real 1-based line of the first insecure comparison in the file, or null when
// none is found — never a fabricated position (D4: a position rendered where none was
// measured).
function findInsecureSecretCompareLine(
  repoPath: string,
  file: string,
  useV39Detectors = false,
): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const lines = readRepoText(fullPath, 'utf8').split('\n');
  const index = lines.findIndex((line) => lineHasInsecureSecretCompare(line, useV39Detectors));
  return index === -1 ? null : index + 1;
}

// Real 1-based line of the first line matching pattern, or null when the file-level match
// (already confirmed via fileContains against the whole content) does not resolve to any single
// line — e.g. a match spanning a line break. Honest null, never a fabricated fallback.
function findFirstMatchingLine(repoPath: string, file: string, pattern: RegExp): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const lines = readRepoText(fullPath, 'utf8').split('\n');
  const index = lines.findIndex((line) => pattern.test(line));
  return index === -1 ? null : index + 1;
}

function lineAt(repoPath: string, file: string, line: number): string | null {
  if (line < 1) return null;
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  return readRepoText(fullPath, 'utf8').split('\n')[line - 1] ?? null;
}
// Signing/HMAC-ing a bare JSON.stringify(...) call with no canonicalization step in the same
// file — the "sign-over-unsorted-JSON" gap named in the goal.
const UNSORTED_JSON_SIGN_PATTERN =
  /\.update\s*\(\s*JSON\.stringify\s*\(|\.sign\s*\([^)]*JSON\.stringify\s*\(/;
const UNSORTED_JSON_DIRECT_SIGN_PATTERN = /\.sign\s*\([^)]*JSON\.stringify\s*\(/;
const UNSORTED_JSON_CONSTRUCTOR_UPDATE_PATTERN =
  /\bcreate(?:Hmac|Sign)\s*\([^;\n]{0,256}\)\s*\.update\s*\(\s*JSON\.stringify\s*\(/;
const JSON_STRINGIFY_ASSIGNMENT_PATTERN =
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*JSON\.stringify\s*\(/g;

function findUnsortedJsonHmacLine(repoPath: string, file: string): number | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const directSign = findFirstMatchingLine(repoPath, file, UNSORTED_JSON_DIRECT_SIGN_PATTERN);
  if (directSign !== null) return directSign;
  const directConstructorUpdate = findFirstMatchingLine(
    repoPath,
    file,
    UNSORTED_JSON_CONSTRUCTOR_UPDATE_PATTERN,
  );
  if (directConstructorUpdate !== null) return directConstructorUpdate;
  JSON_STRINGIFY_ASSIGNMENT_PATTERN.lastIndex = 0;
  let match = JSON_STRINGIFY_ASSIGNMENT_PATTERN.exec(contents);
  while (match !== null) {
    const identifier = match[1];
    if (identifier) {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const constructorUpdate = new RegExp(
        `\\bcreate(?:Hmac|Sign)\\s*\\([^;\\n]{0,256}\\)\\s*\\.update\\s*\\(\\s*${escaped}\\b`,
      );
      // Search only the bounded forward-use window for each assignment. Testing the complete
      // file once per JSON.stringify assignment would become quadratic on generated input.
      const usageWindow = contents.slice(match.index, match.index + 2_048);
      if (constructorUpdate.test(usageWindow)) {
        return contents.slice(0, match.index).split('\n').length;
      }
    }
    match = JSON_STRINGIFY_ASSIGNMENT_PATTERN.exec(contents);
  }
  return null;
}

function fileHasVariableUnsortedJsonHmac(repoPath: string, file: string): boolean {
  return findUnsortedJsonHmacLine(repoPath, file) !== null;
}

// B6 — an un-overridable kill-switch / fail-safe governance toggle: a named safety toggle
// whose absence/false state triggers an immediate guard-clause return/throw, so no
// lower-priority config can proceed past it.
// Positive-only: absence of this pattern never lowers a score, it simply omits the credit.
const KILL_SWITCH_NAME_FRAGMENT =
  'kill[_-]?switch|emergency[_-]?stop|circuit[_-]?breaker|safety[_-]?(?:toggle|gate|switch)|governance[_-]?(?:toggle|gate)';
const KILL_SWITCH_NAME_PATTERN = new RegExp(`\\b(?:${KILL_SWITCH_NAME_FRAGMENT})\\b`, 'i');
const KILL_SWITCH_FAIL_CLOSED_PATTERN = new RegExp(
  `if\\s*\\(\\s*!\\s*[\\w.]*?(?:${KILL_SWITCH_NAME_FRAGMENT})[\\w.]*?\\s*\\)\\s*\\{?\\s*(?:return|throw)`,
  'i',
);

function shannonEntropyPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

function hasMixedCharacterClasses(value: string): boolean {
  const classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_-]/].filter((pattern) =>
    pattern.test(value),
  ).length;
  return classCount >= 3;
}

// A checksum/hash/JWT-segment is low-entropy relative to its length once you account for
// its restricted alphabet (pure hex, or a fixed-size digest) — real secrets (API keys,
// tokens) are high-entropy across the full base64/hex charset with no fixed target length.
function isLikelyDigestOrHash(value: string): boolean {
  if (/^[0-9a-fA-F]+$/.test(value) && KNOWN_HEX_DIGEST_LENGTHS.has(value.length)) return true;
  if (/^[A-Za-z0-9+/]+={0,2}$/.test(value) && value.length % 4 === 0) {
    try {
      const decoded = Buffer.from(value, 'base64');
      const roundTrips = decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '');
      if (roundTrips && KNOWN_DIGEST_BYTE_LENGTHS.has(decoded.length)) return true;
    } catch {
      // Not valid base64 — fall through to the entropy check below.
    }
  }
  return false;
}

function isGenericSecretValue(value: string): boolean {
  if (!GENERIC_SECRET_SHAPE_PATTERN.test(value)) return false;
  if (isLikelyDigestOrHash(value)) return false;
  if (!hasMixedCharacterClasses(value)) return false;
  return shannonEntropyPerChar(value) >= 3.5;
}

export function looksLikeSecretValue(value: string): boolean {
  return SECRET_VALUE_BRANDED_PATTERN.test(value) || isGenericSecretValue(value);
}
const PLACEHOLDER_SECRET_PATTERN =
  /(?:^|[-_])(?:your|example|sample|placeholder|dummy|changeme|replace(?:-?me)?|redacted)(?:$|[-_])|^x{3,}$|^\.\.\.|^\$\{[^}]+}$|^<[^>]+>$/i;
// A committed .env.example/.sample/.template/.dist is a TEMPLATE — the canonical safe pattern
// for documenting expected env vars, never a secret leak. Any placeholder value it carries is
// by definition not a real credential, so template paths must never be scanned as a secret
// source (current tree OR git history) — see goal_cejel_calibration_findings_precision_2026-07-06.
const ENV_TEMPLATE_PATTERN = /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist)$/i;
const ENV_TEMPLATE_PATTERN_V47 =
  /(^|\/)\.env(?:\.[^/]+)*\.(?:example|sample|template|dist|exemplo|ejemplo|exemple|esempio|beispiel|voorbeeld)$/i;

function isEnvTemplatePath(path: string, useV47Detectors = false): boolean {
  return (useV47Detectors ? ENV_TEMPLATE_PATTERN_V47 : ENV_TEMPLATE_PATTERN).test(path);
}
const HARD_EXCLUDED_PATH_PATTERN =
  /(^|\/)(?:\.git|\.venv|venv|site-packages|node_modules|dist|build|\.next|__pycache__|vendor|\.terraform|coverage)(?:\/|$)/;
const COVERAGE_PERCENT_PATTERN =
  /(?:statements|branches|lines|functions|fail_under)\s*[:=]\s*["']?(\d+(?:\.\d+)?)/gi;

interface RepoFileInventory {
  readonly repoFiles: string[];
  readonly inventoryFiles: string[];
  readonly scanLimitations: string[];
}

function gitFailureDetail(reason: Exclude<GitExecResult, { readonly ok: true }>['reason']): string {
  if (reason === 'buffer_exceeded') return 'output exceeded the explicit 8 MiB limit';
  if (reason === 'timeout') return 'execution exceeded the explicit 30 second timeout';
  return 'the local Git command failed';
}

function readGitTrackedFileOutput(repoPath: string): GitExecResult {
  const workTree = execGit(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath });
  if (!workTree.ok) return workTree;
  if (workTree.stdout.trim() !== 'true') return { ok: false, reason: 'not_a_repo' };
  return execGit(['ls-files', '--cached'], { cwd: repoPath });
}

function parseGitTrackedFiles(
  repoPath: string,
  output: string,
  includeHardExcluded: boolean,
): string[] {
  const files: string[] = [];
  for (const file of output.trim().split('\n')) {
    if (file.length === 0) continue;
    const fullPath = join(repoPath, file);
    if (!includeHardExcluded && isHardExcludedPath(file)) {
      recordContentSkip(fullPath, 'denied_path', true);
      continue;
    }
    try {
      if (!lstatSync(fullPath).isFile()) {
        recordContentSkip(fullPath, 'non_regular_file', true);
        continue;
      }
    } catch (error: unknown) {
      recordFilesystemSkip(fullPath, error, false, true);
      continue;
    }
    if (!isPotentialContentPath(file)) {
      recordContentSkip(fullPath, 'excluded_by_extension', true);
    }
    files.push(file);
  }
  return files.sort();
}

function directoryInventory(repoPath: string): string[] {
  const files: string[] = [];
  const rootDevice = statSync(repoPath).dev;
  visitRepoDir(repoPath, repoPath, files, rootDevice);
  return files.filter((file) => !isHardExcludedPath(file)).sort();
}

function collectRepoFileInventory(repoPath: string): RepoFileInventory {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) {
    return {
      repoFiles: parseGitTrackedFiles(repoPath, tracked.stdout, false),
      inventoryFiles: parseGitTrackedFiles(repoPath, tracked.stdout, true),
      scanLimitations: [],
    };
  }

  const fallbackFiles = directoryInventory(repoPath);
  if (isExpectedGitAbsence(tracked)) {
    return {
      repoFiles: fallbackFiles,
      inventoryFiles: fallbackFiles,
      scanLimitations: [],
    };
  }

  return {
    repoFiles: fallbackFiles,
    inventoryFiles: fallbackFiles,
    scanLimitations: [
      `Tracked-file inventory was unavailable because ${gitFailureDetail(tracked.reason)}. Cejel used a bounded directory walk with different exclusion semantics; re-scan after the local Git failure is resolved to compare the certificate.`,
    ],
  };
}

function listRepoFiles(repoPath: string): string[] {
  return [...collectRepoFileInventory(repoPath).repoFiles];
}

function listRepoInventory(repoPath: string, fallbackFiles: readonly string[]): string[] {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) return parseGitTrackedFiles(repoPath, tracked.stdout, true);
  if (isExpectedGitAbsence(tracked)) return [...fallbackFiles];
  throw new Error(describeGitFailure(tracked.reason, 'tracked-file inventory'));
}

// Monorepo-root shared config that legitimately governs a sub-package but lives at
// the repo root (a lockfile, CI workflows, dependency-update config). When Witan is
// pointed at a sub-package, `git ls-files` only lists that sub-tree, so these root
// files are invisible and A4/B3 emit FALSE CRITICALS ("no lockfile", "0 CI workflows")
// even though the monorepo has them (found 2026-06-30 scoring packages/api). This
// surfaces ONLY those shared-config categories from the root — never the whole tree,
// so sub-package-scoped metrics (tests, secrets, prod-readiness) are unchanged. When
// the scan target IS the git root, this returns null and behavior is byte-identical.
interface MonorepoContext {
  readonly root: string;
  readonly sharedFiles: readonly string[];
}

function resolveMonorepoContext(
  repoPath: string,
  scanLimitations: Set<string>,
): MonorepoContext | null {
  const topResult = execGit(['rev-parse', '--show-toplevel'], { cwd: repoPath });
  if (!topResult.ok) {
    if (isExpectedGitAbsence(topResult)) return null;
    scanLimitations.add(
      `${describeGitFailure(topResult.reason, 'repository-root discovery')} Cejel continued without monorepo root-level shared configuration.`,
    );
    return null;
  }
  const top = topResult.stdout.trim();
  if (!top) return null;
  // git resolves symlinks in --show-toplevel (e.g. macOS /var -> /private/var);
  // realpath the scan path too so the prefix check below compares like with like.
  const rootResolved = resolve(top);
  const repoResolved = (() => {
    try {
      return realpathSync(repoPath);
    } catch {
      return resolve(repoPath);
    }
  })();
  // Scanning the git root itself → no augmentation → byte-identical to prior behavior.
  if (rootResolved === repoResolved) return null;
  // The scan target must be nested inside the git root.
  if (!repoResolved.startsWith(rootResolved + sep)) return null;

  const rootFiles = listGitTrackedFiles(rootResolved, scanLimitations);
  if (!rootFiles || rootFiles.length === 0) return null;

  // Sub-package path relative to the root, so we exclude files already inside the
  // sub-package (those are in repoFiles and handled by the normal collectors).
  const subRel = repoResolved
    .slice(rootResolved.length + 1)
    .split(sep)
    .join('/');
  const subPrefix = subRel ? `${subRel}/` : '';
  const sharedFiles = rootFiles.filter(
    (file) =>
      (isLockfile(file) || isCiWorkflow(file) || isDependencyUpdateConfig(file)) &&
      (subPrefix === '' || !file.startsWith(subPrefix)),
  );
  if (sharedFiles.length === 0) return null;
  return { root: rootResolved, sharedFiles };
}

function listGitTrackedFiles(
  repoPath: string,
  scanLimitations: Set<string>,
  includeHardExcluded = false,
): string[] | null {
  const tracked = readGitTrackedFileOutput(repoPath);
  if (tracked.ok) return parseGitTrackedFiles(repoPath, tracked.stdout, includeHardExcluded);
  if (isExpectedGitAbsence(tracked)) return null;
  scanLimitations.add(
    `${describeGitFailure(tracked.reason, 'monorepo shared-file inventory')} Cejel continued without monorepo root-level shared configuration.`,
  );
  return null;
}

function visitRepoDir(
  repoPath: string,
  dirPath: string,
  files: string[],
  rootDevice: number | bigint,
): void {
  // M1 (goal_cejel_launch_hardening_combined_2026-07-06, Phase 3): a non-git repo can have
  // an unreadable subdirectory (e.g. chmod 000) or a broken symlink entry; readdirSync/
  // statSync throw EACCES/ENOENT in those cases, which previously crashed the whole scan.
  // Skip the unreadable entry instead of failing the entire repo — a permissions quirk on
  // one directory should never make Cejel unusable on the rest of the tree.
  let entries: Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch (error: unknown) {
    recordFilesystemSkip(dirPath, error, true);
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (shouldSkipDir(entry.name)) {
      recordContentSkip(fullPath, 'denied_path');
      continue;
    }
    if (entry.isDirectory()) {
      try {
        if (lstatSync(fullPath, { bigint: true }).dev !== BigInt(rootDevice)) {
          recordContentSkip(fullPath, 'denied_path');
          continue;
        }
      } catch (error: unknown) {
        recordFilesystemSkip(fullPath, error);
        continue;
      }
      visitRepoDir(repoPath, fullPath, files, rootDevice);
      continue;
    }
    if (!entry.isFile()) {
      recordContentSkip(fullPath, 'non_regular_file');
      continue;
    }
    let size: number;
    try {
      size = statSync(fullPath).size;
    } catch (error: unknown) {
      recordFilesystemSkip(fullPath, error);
      continue;
    }
    const repoRelativePath = relative(repoPath, fullPath);
    if (size > 512_000) {
      recordContentSkip(fullPath, 'too_large');
      continue;
    }
    if (!isPotentialContentPath(repoRelativePath)) {
      recordContentSkip(fullPath, 'excluded_by_extension');
    }
    files.push(repoRelativePath);
  }
}

const CONTENT_FILE_EXTENSIONS = new Set([
  '.c', '.cc', '.cfg', '.cjs', '.cmake', '.conf', '.cpp', '.cs', '.css', '.cts', '.cxx',
  '.env', '.go', '.gradle', '.graphql', '.h', '.hpp', '.html', '.ini', '.java', '.js', '.json',
  '.json5', '.jsx', '.kt', '.kts', '.lua', '.md', '.mdx', '.mjs', '.mts', '.php', '.properties',
  '.proto', '.py', '.rb', '.rs', '.rst', '.scss', '.sh', '.sql', '.swift', '.toml', '.ts', '.tsx',
  '.txt', '.xml', '.yaml', '.yml',
]);

function isPotentialContentPath(path: string): boolean {
  const name = basename(path);
  if (CONTENT_FILE_EXTENSIONS.has(extname(name).toLowerCase())) return true;
  return (
    /^(?:Dockerfile|Makefile|Rakefile|Gemfile|Pipfile|Procfile|CMakeLists\.txt)$/i.test(name) ||
    /^\.(?:env|gitignore|npmrc|nvmrc|prettierrc|eslintrc)(?:\.|$)/i.test(name)
  );
}

function shouldSkipDir(name: string): boolean {
  return [
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    'coverage',
    '.venv',
    'venv',
    'site-packages',
    '__pycache__',
    '.terraform',
    'vendor',
    'target',
  ].includes(name);
}

function isHardExcludedPath(path: string): boolean {
  return HARD_EXCLUDED_PATH_PATTERN.test(path);
}

// Detect C++ test files by content for files not caught by naming conventions.
// Limited to CPP_CONTENT_SCAN_LIMIT candidates to bound I/O on large repos.
function collectContentBasedCppTestFiles(repoPath: string, repoFiles: readonly string[]): string[] {
  const candidates = repoFiles
    .filter((file) => /\.(cpp|cc|cxx)$/.test(file) && !isTestFile(file))
    .slice(0, CPP_CONTENT_SCAN_LIMIT);
  return candidates.filter((file) => {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) return false;
    const contents = readRepoText(fullPath, 'utf8');
    return CPP_TEST_FRAMEWORK_PATTERN.test(contents) || CPP_TEST_MACRO_PATTERN.test(contents);
  });
}

function isSourceFile(file: string): boolean {
  // Exclude C/C++ headers (.h/.hpp/.hxx) from the denominator: headers are declarations,
  // not implementation units. Counting them alongside .cpp files would double the denominator
  // for C++ repos and unfairly depress the test-to-source ratio.
  return isImplementationFile(file) && !isTestFile(file) && !isCppHeader(file);
}

function isCppHeader(file: string): boolean {
  return /\.(h|hpp|hxx|h\+\+)$/.test(file);
}

// JS/TS assertion idioms (jest/vitest/mocha/chai/node:assert).
const JS_TEST_ASSERTION_PATTERN = /(expect\(|assert\.|should\.|toEqual\(|toBe\(|assert\s)/;
// C++ assertion and test-macro patterns (gtest, catch2, doctest, boost.test).
const CPP_TEST_ASSERTION_PATTERN =
  /\bEXPECT_|ASSERT_EQ\b|ASSERT_TRUE\b|ASSERT_FALSE\b|\bREQUIRE\s*\(|\bCHECK\s*\(|\bTEST\s*\(|\bTEST_F\s*\(|\bTEST_CASE\s*\(|\bSECTION\s*\(/;
// Assertion idioms for the remaining major ecosystems. The pre-2026-07-10 heuristic knew only
// the JS/TS and C++ shapes above, so a mature Python unittest suite — self.assertEqual(...) et
// al, no bare `assert ` and no expect( — counted as HOLLOW file by file (Django scored 38/2034
// non-hollow; goal_cejel_rubric_calibration_archetype_2026-07-10). Covers: Python unittest
// (.assertEqual/.assertRaises/self.fail) and pytest.raises; Go testing (t.Error/t.Fatal…) and
// testify (require.X); Rust assert!/assert_eq!/assert_ne!; JUnit/kotlin.test static-import
// assertEquals(...) via the leading \bassert[A-Z] shape; Ruby minitest assert_equal…/RSpec
// .to matchers (expect( is already matched above); PHPUnit $this->assertX.
const MULTI_ECOSYSTEM_TEST_ASSERTION_PATTERN =
  /\.assert[A-Z_]\w*\s*\(|\bassert[A-Z]\w*\s*\(|\bpytest\.raises\b|\bself\.fail\s*\(|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\b|\brequire\.[A-Z]\w*\s*\(|\b(?:debug_)?assert(?:_eq|_ne)?!\s*\(|\bassert_\w+\b|\$this->assert\w+\s*\(/;
// A SUITE-LEVEL skip (describe.skip/suite.skip/context.skip) disables the whole file even when
// assertion bodies exist. Individual it.skip/test.skip markers deliberately do NOT make a file
// hollow: the pre-2026-07-10 rule disqualified an entire file with hundreds of live assertions
// for a single skipped case, which misreads mature suites.
const SUITE_LEVEL_SKIP_PATTERN = /\b(?:describe|suite|context)\.skip\s*\(/;

interface NonHollowTestShare {
  /** Files containing live assertions (and not suite-level-skipped). */
  nonHollowCount: number;
  /**
   * The honest denominator: asserting files plus name-shaped test files that fail the
   * assertion check (true placeholders / skipped suites). A non-name-shaped file under a
   * test directory with no assertions is support scaffolding — excluded from the share.
   */
  ratedCount: number;
}

function measureNonHollowTestShare(
  repoPath: string,
  files: readonly string[],
  useV17Detectors = false,
): NonHollowTestShare {
  let nonHollowCount = 0;
  let ratedCount = 0;
  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    const nonHollow =
      (JS_TEST_ASSERTION_PATTERN.test(contents) ||
        CPP_TEST_ASSERTION_PATTERN.test(contents) ||
        MULTI_ECOSYSTEM_TEST_ASSERTION_PATTERN.test(contents)) &&
      !SUITE_LEVEL_SKIP_PATTERN.test(contents);
    if (nonHollow) {
      nonHollowCount += 1;
      ratedCount += 1;
    } else if (
      NAME_SHAPED_TEST_FILE_PATTERN.test(file) ||
      (useV17Detectors && NAME_SHAPED_TEST_FILE_PATTERN_V17.test(file))
    ) {
      ratedCount += 1;
    }
  }
  return { nonHollowCount, ratedCount };
}

function countFilesContaining(repoPath: string, files: readonly string[], pattern: RegExp): number {
  return files.filter((file) => fileContains(repoPath, file, pattern)).length;
}

function countPatternMatches(repoPath: string, files: readonly string[], pattern: RegExp): number {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let count = 0;

  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    count += [...readRepoText(fullPath, 'utf8').matchAll(matcher)].length;
  }

  return count;
}

function readCoveragePercent(repoPath: string, files: readonly string[]): number | null {
  for (const file of files) {
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) continue;
    const contents = readRepoText(fullPath, 'utf8');
    const summaryPercent = parseCoverageSummaryPercent(contents);
    if (summaryPercent !== null) return summaryPercent;
    const thresholdPercent = parseCoverageThresholdPercent(contents);
    if (thresholdPercent !== null) return thresholdPercent;
  }

  return null;
}

function parseCoverageSummaryPercent(contents: string): number | null {
  const parsed = parseJsonObject(contents);
  const total = parsed ? parsed.total : null;
  if (!isRecord(total)) return null;

  const percentages = ['statements', 'lines', 'branches', 'functions']
    .map((key) => {
      const bucket = total[key];
      if (!isRecord(bucket)) return null;
      return typeof bucket.pct === 'number' ? bucket.pct : null;
    })
    .filter((value): value is number => value !== null && value >= 0 && value <= 100);

  return averageNumbers(percentages);
}

function parseCoverageThresholdPercent(contents: string): number | null {
  const statementMatch = /statements\s*[:=]\s*["']?(\d+(?:\.\d+)?)/i.exec(contents);
  if (statementMatch?.[1]) return Number(statementMatch[1]);

  const percentages = [...contents.matchAll(COVERAGE_PERCENT_PATTERN)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);

  return averageNumbers(percentages);
}

function averageNumbers(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

interface DependencySpec {
  name: string;
  version: string;
}

// Choose the manifest that parses the most dependency specs, so evidence
// pointers and the suspicious-name check target the file that actually carries
// dependencies. Falls back to the first manifest when none parse any specs
// (preserving prior behavior), and returns undefined when there are none.
function pickPrimaryDependencyManifest(
  repoPath: string,
  manifests: readonly string[],
): string | undefined {
  let best: string | undefined;
  let bestCount = -1;
  for (const candidate of manifests) {
    const count = readDependencySpecs(repoPath, [candidate]).length;
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }
  return best;
}

function readDependencySpecs(repoPath: string, manifests: readonly string[]): DependencySpec[] {
  const specs: DependencySpec[] = [];

  for (const manifest of manifests) {
    const fullPath = join(repoPath, manifest);
    if (!isRegularFile(fullPath)) continue;
    if (manifest.endsWith('package.json')) {
      specs.push(...readPackageJsonDependencySpecs(fullPath));
      continue;
    }
    if (/requirements(?:[^/]*)\.txt$/.test(manifest)) {
      specs.push(...readRequirementsDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('go.mod')) {
      specs.push(...readGoModDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('Cargo.toml')) {
      specs.push(...readCargoTomlDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('pyproject.toml')) {
      specs.push(...readPyprojectDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('Pipfile')) {
      specs.push(...readPipfileDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('vcpkg.json')) {
      specs.push(...readVcpkgJsonDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('conanfile.txt')) {
      specs.push(...readConanfileTxtDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('conanfile.py')) {
      specs.push(...readConanfilePyDependencySpecs(fullPath));
      continue;
    }
    if (manifest.endsWith('CMakeLists.txt')) {
      specs.push(...readCMakeDependencySpecs(fullPath));
    }
  }

  return specs;
}

function readGoModDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // Match both block and single-line require statements
  const blockPattern = /require\s*\(([^)]+)\)/gs;
  const singlePattern = /^require\s+(\S+)\s+(\S+)/gm;

  for (const blockMatch of contents.matchAll(blockPattern)) {
    const block = blockMatch[1] ?? '';
    for (const line of block.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        specs.push({ name: parts[0] ?? trimmed, version: parts[1] ?? '' });
      }
    }
  }

  for (const singleMatch of contents.matchAll(singlePattern)) {
    specs.push({ name: singleMatch[1] ?? '', version: singleMatch[2] ?? '' });
  }

  return specs;
}

function readCargoTomlDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // Find [dependencies] section
  const depSectionPattern =
    /^\[(?:dependencies|dev-dependencies|build-dependencies)\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;

  for (const sectionMatch of contents.matchAll(depSectionPattern)) {
    const section = sectionMatch[1] ?? '';
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      // name = "version" or name = { version = "version", ... }
      const simpleMatch = /^(\w[\w-]*)\s*=\s*"([^"]+)"/.exec(trimmed);
      if (simpleMatch) {
        specs.push({ name: simpleMatch[1] ?? trimmed, version: simpleMatch[2] ?? '' });
        continue;
      }
      const tableMatch = /^(\w[\w-]*)\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/.exec(trimmed);
      if (tableMatch) {
        specs.push({ name: tableMatch[1] ?? trimmed, version: tableMatch[2] ?? '' });
      }
    }
  }

  return specs;
}

function readPyprojectDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // (?![\s\S]) is a JS-compatible end-of-string anchor (no char follows).
  // \z is not valid in JS regex (treated as literal 'z'), so we use this instead.

  // Poetry style: [tool.poetry.dependencies] / name = "^version"
  const poetrySectionPattern = /^\[tool\.poetry\.dependencies\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(poetrySectionPattern)) {
    const section = sectionMatch[1] ?? '';
    for (const line of section.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('python')) continue;
      const match = /^([\w-]+)\s*=\s*"([^"]+)"/.exec(trimmed);
      if (match) {
        specs.push({ name: match[1] ?? trimmed, version: match[2] ?? '' });
      }
    }
  }
  // PEP 621 style: [project] / dependencies = ["name>=version"]
  const pep621Pattern = /^\[project\]([\s\S]*?)(?=^\[|(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(pep621Pattern)) {
    const section = sectionMatch[1] ?? '';
    const depsArrayMatch = /dependencies\s*=\s*\[([\s\S]*?)\]/m.exec(section);
    if (depsArrayMatch) {
      for (const rawDep of (depsArrayMatch[1] ?? '').split(',')) {
        const dep = rawDep.replace(/["'\s]/g, '');
        if (!dep) continue;
        const nameMatch = /^([A-Za-z0-9][\w.-]*)/.exec(dep);
        const versionMatch = /([><=~!^]+[\d.]+)/.exec(dep);
        const depName = nameMatch?.[1];
        if (depName) {
          specs.push({ name: depName, version: versionMatch?.[1] ?? dep });
        }
      }
    }
  }

  return specs;
}

function readPipfileDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  const sectionPattern = /^\[(?:packages|dev-packages)\]([\s\S]*?)(?=^\[|$(?![\s\S]))/gm;
  for (const sectionMatch of contents.matchAll(sectionPattern)) {
    for (const line of (sectionMatch[1] ?? '').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = /^([\w][\w.-]*)\s*=\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/.exec(trimmed);
      if (match) specs.push({ name: match[1] ?? trimmed, version: match[2]?.trim() ?? '' });
    }
  }
  return specs;
}

function readVcpkgJsonDependencySpecs(path: string): DependencySpec[] {
  const parsed = parseJsonObject(readRepoText(path, 'utf8'));
  if (!parsed) return [];
  const rawDeps = Array.isArray(parsed.dependencies) ? parsed.dependencies : [];
  const specs: DependencySpec[] = [];
  for (const dep of rawDeps) {
    if (typeof dep === 'string') {
      // No version constraint: vcpkg pins via the builtin-baseline field in vcpkg.json.
      specs.push({ name: dep, version: 'baseline' });
    } else if (isRecord(dep) && typeof dep.name === 'string') {
      // { "name": "foo", "version>=": "1.2.11" } or { "name": "foo" }
      const version =
        dep['version>='] ?? dep['version=='] ?? dep.version ?? dep['version>'] ?? 'baseline';
      specs.push({ name: dep.name, version: String(version) });
    }
  }
  return specs;
}

function readConanfileTxtDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  const requiresMatch = /^\[requires\]([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(contents);
  if (!requiresMatch) return specs;
  for (const line of (requiresMatch[1] ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Format: name/version or name/version@user/channel
    const match = /^([\w.\-]+)\/([\w.\-]+)/.exec(trimmed);
    if (match) specs.push({ name: match[1] ?? trimmed, version: match[2] ?? '' });
  }
  return specs;
}

function readConanfilePyDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // self.requires("name/version") or self.requires("name/version@user/channel")
  for (const match of contents.matchAll(/self\.requires\s*\(\s*["']([\w.\-]+)\/([\w.\-]+)["']/g)) {
    specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
  }
  // requirements = ["name/version", ...]
  const listMatch = /requirements\s*=\s*\[([\s\S]*?)\]/m.exec(contents);
  if (listMatch) {
    for (const match of (listMatch[1] ?? '').matchAll(/["']([\w.\-]+)\/([\w.\-]+)["']/g)) {
      specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
    }
  }
  return specs;
}

function readCMakeDependencySpecs(path: string): DependencySpec[] {
  const specs: DependencySpec[] = [];
  const contents = readRepoText(path, 'utf8');
  // find_package(Name [version] [REQUIRED ...])
  for (const match of contents.matchAll(/find_package\s*\(\s*([\w]+)(?:\s+([\d.]+))?/gi)) {
    const name = match[1];
    if (!name) continue;
    // Skip cmake-internal packages that are not real dependencies
    if (/^(Threads|PkgConfig|CMakePackageConfigHelpers|GNUInstallDirs)$/i.test(name)) continue;
    specs.push({ name, version: match[2] ?? 'find' });
  }
  // FetchContent_Declare(name ... GIT_TAG tag)
  for (const match of contents.matchAll(
    /FetchContent_Declare\s*\(\s*([\w]+)[\s\S]*?GIT_TAG\s+([\w.\-]+)/gi,
  )) {
    specs.push({ name: match[1] ?? '', version: match[2] ?? '' });
  }
  return specs;
}

function readPackageJsonDependencySpecs(packageJsonPath: string): DependencySpec[] {
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  if (!parsed) return [];

  // Peer deps marked optional via peerDependenciesMeta are a declared compatibility range,
  // not installed runtime attack surface — a clean zero-runtime-dep library commonly declares
  // many of these (e.g. an optional test-framework integration). Do not count them toward the
  // pinned-dependency-ratio denominator (goal_cejel_rubric_refinement_from_lua_2026-07-06).
  const optionalPeerNames = new Set<string>();
  const peerDependenciesMeta = parsed.peerDependenciesMeta;
  if (isRecord(peerDependenciesMeta)) {
    for (const [name, meta] of Object.entries(peerDependenciesMeta)) {
      if (isRecord(meta) && meta.optional === true) optionalPeerNames.add(name);
    }
  }

  const specs: DependencySpec[] = [];
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const dependencies = parsed[field];
    if (!isRecord(dependencies)) continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version !== 'string') continue;
      if (field === 'peerDependencies' && optionalPeerNames.has(name)) continue;
      specs.push({ name, version });
    }
  }
  return specs;
}

function readRequirementsDependencySpecs(path: string): DependencySpec[] {
  return readRepoText(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [name = line, version = ''] = line.split(/[<>=~!]=?/, 2);
      return { name: name.trim(), version: line.includes('==') ? version.trim() : line };
    });
}

function isPinnedDependencyVersion(version: string): boolean {
  const trimmed = version.trim();
  if (/^(workspace:|file:|link:|portal:)/.test(trimmed)) return true;
  // vcpkg baseline: packages are pinned via the builtin-baseline hash in vcpkg.json
  if (trimmed === 'baseline') return true;
  // Python exact pin: "==1.2.3" in pyproject.toml [project] dependencies array
  if (/^==\d/.test(trimmed)) return true;
  if (/^(latest|\*|x)$/i.test(trimmed)) return false;
  if (/^[~^<>=]/.test(trimmed)) return false;
  // CMake find_package without an explicit version: system-managed, not a version pin
  if (trimmed === 'find') return false;
  return /^\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed);
}

function workflowTargetsDefaultBranch(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const contents = readRepoText(fullPath, 'utf8').toLowerCase();
  return (
    /\bpull_request\b/.test(contents) ||
    /\bbranches:\s*\[[^\]]*\b(main|master)\b[^\]]*\]/.test(contents) ||
    /\bbranches:\s*\n\s*-\s*(main|master)\b/.test(contents)
  );
}

function isPrMergeCommit(commit: GitCommitSummary): boolean {
  return /merge pull request|pull request|#\d+/i.test(commit.subject);
}

function parseJsonObject(contents: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripBom(contents)) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTestRunnerConfig(repoPath: string, file: string): boolean {
  return (
    /(^|\/)(vitest|jest|pytest|playwright|cypress|mocha)\.config\.[cm]?[jt]s$/.test(file) ||
    /(^|\/)(pytest\.ini|tox\.ini)$/.test(file) ||
    /(^|\/)phpunit\.xml(\.dist)?$/.test(file) ||
    (/(^|\/)pyproject\.toml$/.test(file) &&
      fileContains(repoPath, file, /^\[tool\.pytest(?:\.|\])/m)) ||
    (/(^|\/)CMakeLists\.txt$/.test(file) &&
      fileContains(repoPath, file, /\b(?:enable_testing|add_test|ctest_add_tests)\s*\(/i)) ||
    (/(^|\/)Makefile$/.test(file) && fileContains(repoPath, file, /^\s*(?:test|tests|check)\s*:/m))
  );
}

export function findCoverageConfigFiles(
  repoPath: string,
  repoFiles: readonly string[],
  authoredOnly = false,
): string[] {
  return repoFiles.filter(
    (file) => (!authoredOnly || isAuthoredProductionPath(file)) && isCoverageConfig(repoPath, file),
  );
}

export function findConcreteTestFiles(
  repoPath: string,
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): string[] {
  const contentCppTests = collectContentBasedCppTestFiles(repoPath, repoFiles);
  return [
    ...repoFiles.filter((file) => isTestFile(file, rubricVersion)),
    ...contentCppTests.filter((file) => !isTestFile(file, rubricVersion)),
  ];
}

export function findConfiguredTestRunnerFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  const configured = repoFiles.filter(
    (file) => isAuthoredProductionPath(file) && isTestRunnerConfig(repoPath, file),
  );
  for (const packageJson of repoFiles.filter(
    (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
  )) {
    if (
      [...readPackageScripts(join(repoPath, packageJson)).values()].some((script) =>
        TEST_RUNNER_PATTERN.test(script),
      )
    ) {
      configured.push(packageJson);
    }
  }
  configured.push(
    ...repoFiles
      .filter((file) => isAuthoredProductionPath(file) && isCiWorkflow(file))
      .filter((file) => fileContains(repoPath, file, CI_TEST_COMMAND_PATTERN)),
  );
  return [...new Set(configured)].sort();
}

export function findNonLeanTestToolchainPremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
  rubricVersion = WITAN_RUBRIC_VERSION,
): string[] {
  const testFiles = findConcreteTestFiles(repoPath, repoFiles, rubricVersion);
  if (testFiles.length === 0) return [];
  const packageJsonFiles = repoFiles.filter(
    (file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file),
  );
  const configured = findConfiguredTestRunnerFiles(repoPath, repoFiles);
  const usesLeanBuiltInTestRunner =
    packageJsonFiles.some((manifest) =>
      [...readPackageScripts(join(repoPath, manifest)).values()].some((script) =>
        LEAN_TEST_RUNNER_SCRIPT_PATTERN.test(script),
      ),
    ) || testFiles.some((file) => fileContains(repoPath, file, LEAN_TEST_RUNNER_IMPORT_PATTERN));
  const heavyManifests = packageJsonFiles.filter((manifest) =>
    packageJsonHasHeavyTestDependency(repoPath, manifest),
  );
  if (usesLeanBuiltInTestRunner && heavyManifests.length === 0) return [];
  return [...new Set([...heavyManifests, ...configured])].sort();
}

export function findTenantStoragePremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter((file) => /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file))
    .filter((file) => fileContains(repoPath, file, TENANT_SCOPE_PATTERN_V11));
}

export function findRlsPolicyFiles(repoPath: string, repoFiles: readonly string[]): string[] {
  return repoFiles
    .filter((file) => /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file))
    .filter((file) =>
      fileContains(
        repoPath,
        file,
        /\b(?:create\s+policy|enable\s+row\s+level\s+security|force\s+row\s+level\s+security)\b/i,
      ),
    );
}

export interface RlsPolicyScopeInventory {
  policyFiles: string[];
  policyCount: number;
  scopeIdentifiers: string[];
  storageFiles: string[];
}

const RLS_CLAUSE_SQL_WORDS = new Set([
  'all',
  'and',
  'any',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'cast',
  'current',
  'desc',
  'distinct',
  'else',
  'end',
  'exists',
  'false',
  'from',
  'in',
  'is',
  'join',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'select',
  'then',
  'text',
  'true',
  'uuid',
  'varchar',
  'when',
  'where',
]);

function extractBalancedSqlClause(statement: string, keyword: 'using' | 'with check'): string[] {
  const clauses: string[] = [];
  const keywordPattern = keyword === 'using' ? /\busing\s*\(/gi : /\bwith\s+check\s*\(/gi;
  for (const match of statement.matchAll(keywordPattern)) {
    const openingParen = (match.index ?? 0) + match[0].lastIndexOf('(');
    let depth = 0;
    let quote: "'" | '"' | null = null;
    for (let index = openingParen; index < statement.length; index += 1) {
      const character = statement[index];
      if (quote) {
        if (character === quote && statement[index - 1] !== '\\') quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          clauses.push(statement.slice(openingParen + 1, index));
          break;
        }
      }
    }
  }
  return clauses;
}

function extractRlsScopeIdentifiers(clause: string): string[] {
  const scrubbed = clause.replace(/'(?:''|[^'])*'/g, ' ').replace(/"(?:""|[^"])*"/g, ' ');
  const identifiers = new Set<string>();
  const identifierPattern = /\b[A-Za-z_][A-Za-z0-9_$]*(?:\.[A-Za-z_][A-Za-z0-9_$]*)*\b/g;
  for (const match of scrubbed.matchAll(identifierPattern)) {
    const token = match[0];
    const segments = token.split('.').map((segment) => segment.toLowerCase());
    const lastSegment = segments.at(-1);
    if (!lastSegment || lastSegment.length < 2 || RLS_CLAUSE_SQL_WORDS.has(lastSegment)) continue;
    if (['app', 'auth', 'jwt', 'request', 'session'].includes(segments[0] ?? '')) continue;
    const remainder = scrubbed.slice((match.index ?? 0) + token.length);
    if (/^\s*\(/.test(remainder)) continue;
    if (['auth', 'current_setting', 'jwt', 'pg_catalog', 'public', 'uid'].includes(lastSegment)) {
      continue;
    }
    identifiers.add(lastSegment);
  }
  return [...identifiers].sort();
}

/**
 * Re-derive multi-tenancy from the repository's own RLS language.
 *
 * There is deliberately no tenant/org/workspace token dictionary here. We first
 * locate RLS policy files, then parse CREATE POLICY statements and their
 * USING/WITH CHECK clauses. Identifiers found in those clauses become that
 * repository's native isolation vocabulary and are traced across its data-layer
 * files. A schema token with no policy cannot manufacture a multi-tenant claim.
 */
export function deriveRlsPolicyScopeInventory(
  repoPath: string,
  repoFiles: readonly string[],
): RlsPolicyScopeInventory {
  const candidatePolicyFiles = findRlsPolicyFiles(repoPath, repoFiles);
  const policyFiles = new Set<string>();
  const scopeIdentifiers = new Set<string>();
  let policyCount = 0;

  for (const file of candidatePolicyFiles) {
    let content: string;
    try {
      content = readRepoText(join(repoPath, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of content.matchAll(/\bcreate\s+policy\b[\s\S]*?(?:;|$)/gi)) {
      const statement = match[0];
      const clauses = [
        ...extractBalancedSqlClause(statement, 'using'),
        ...extractBalancedSqlClause(statement, 'with check'),
      ];
      if (clauses.length === 0) continue;
      policyCount += 1;
      policyFiles.add(file);
      for (const clause of clauses) {
        for (const identifier of extractRlsScopeIdentifiers(clause)) {
          scopeIdentifiers.add(identifier);
        }
      }
    }
  }

  const identifiers = [...scopeIdentifiers].sort();
  const dataLayerFiles = repoFiles.filter((file) =>
    /(^|\/)(?:migrations?|drizzle|prisma)\/|\.(?:sql|prisma)$/i.test(file),
  );
  const storageFiles =
    identifiers.length === 0
      ? []
      : dataLayerFiles.filter((file) =>
          identifiers.some((identifier) =>
            fileContains(
              repoPath,
              file,
              new RegExp(`\\b${identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
            ),
          ),
        );

  return {
    policyFiles: [...policyFiles].sort(),
    policyCount,
    scopeIdentifiers: identifiers,
    storageFiles,
  };
}

export function findCiOrReleaseDeployFiles(
  _repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles.filter(
    (file) =>
      isAuthoredProductionPath(file) && (isCiWorkflow(file) || isExplicitDeployTarget(file)),
  );
}

export function findDependencyLockfiles(repoFiles: readonly string[]): string[] {
  return repoFiles.filter(isLockfile);
}

export function findDependencyManifests(repoFiles: readonly string[]): string[] {
  return repoFiles.filter(isDependencyManifest);
}

export function findDeployableServicePremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
  strictOperationalBoundary = false,
): string[] {
  const explicitTargets = repoFiles.filter(
    (file) =>
      isAuthoredProductionPath(file) &&
      isExplicitDeployTarget(file) &&
      (!strictOperationalBoundary || isV47OperationalApplicationPath(file)),
  );
  const deployWorkflows = repoFiles
    .filter((file) => isAuthoredProductionPath(file) && isCiWorkflow(file))
    .filter((file) => fileContains(repoPath, file, CI_DEPLOY_JOB_PATTERN))
    .filter(
      (file) => !strictOperationalBoundary || !isDocumentationOnlyDeployWorkflow(repoPath, file),
    );
  const serverEntrypoint = findServerEntrypointFile(repoPath, repoFiles, true);
  const runtimeContainer = findRuntimeContainerEntrypointFile(repoPath, repoFiles);
  if (strictOperationalBoundary) {
    const runtimeFiles = [serverEntrypoint, runtimeContainer].filter(
      (file): file is string => file != null && isV47OperationalApplicationPath(file),
    );
    const directApplicationTargets = explicitTargets.filter(
      (file) => !isInfrastructureOnlyDeployTarget(file),
    );
    const infrastructureTargets =
      runtimeFiles.length > 0
        ? [...explicitTargets.filter(isInfrastructureOnlyDeployTarget), ...deployWorkflows]
        : [];
    return [...directApplicationTargets, ...runtimeFiles, ...infrastructureTargets];
  }
  return [
    ...explicitTargets,
    ...deployWorkflows,
    ...(serverEntrypoint &&
    (!strictOperationalBoundary || isV47OperationalApplicationPath(serverEntrypoint))
      ? [serverEntrypoint]
      : []),
    ...(runtimeContainer &&
    (!strictOperationalBoundary || isV47OperationalApplicationPath(runtimeContainer))
      ? [runtimeContainer]
      : []),
  ];
}

function isInfrastructureOnlyDeployTarget(file: string): boolean {
  return (
    /(^|\/)docker-compose\.ya?ml$/i.test(file) ||
    /(^|\/)(?:k8s|kubernetes|manifests?)\/.+\.ya?ml$/i.test(file) ||
    /(^|\/)(?:charts?|helm)\/.+\.ya?ml$/i.test(file)
  );
}

const V47_NON_OPERATIONAL_APPLICATION_PATH_PATTERN =
  /(^|\/)(?:cookbooks?|lessons?|tutorials?|docs?|documentation|examples?|samples?|demos?)(\/|$)/i;

function isV47OperationalApplicationPath(path: string): boolean {
  return !V47_NON_OPERATIONAL_APPLICATION_PATH_PATTERN.test(path);
}

function isDocumentationOnlyDeployWorkflow(repoPath: string, file: string): boolean {
  if (/(?:docs?|pages?)/i.test(basename(file))) return true;
  return fileContains(
    repoPath,
    file,
    /\b(?:deploy[-_ ]?docs?|mkdocs|docusaurus|vitepress|gh-pages|github pages)\b/i,
  );
}

export function findPackagedApplicationPremiseFiles(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter((file) => /(^|\/)package\.json$/.test(file) && isAuthoredProductionPath(file))
    .filter((file) => packageJsonDescribesPackagedApplication(repoPath, file, repoFiles));
}

export function findClaimSourceFiles(repoFiles: readonly string[]): string[] {
  return repoFiles
    .filter(
      (file) => /^(?:README|readme)\.md$/.test(file) || /^docs\/[^/]+\.(?:md|mdx)$/.test(file),
    )
    .sort((left, right) => {
      const leftRootReadme = /^(?:README|readme)\.md$/.test(left);
      const rightRootReadme = /^(?:README|readme)\.md$/.test(right);
      return Number(rightRootReadme) - Number(leftRootReadme) || left.localeCompare(right);
    });
}

export function findClaimImplementationFiles(
  repoFiles: readonly string[],
  authoredOnly = false,
): string[] {
  return repoFiles.filter(
    (file) => isImplementationFile(file) && (!authoredOnly || isAuthoredProductionPath(file)),
  );
}

export function findClaimRealityReconciliationArtifacts(
  repoPath: string,
  repoFiles: readonly string[],
): string[] {
  return repoFiles
    .filter((file) => /(^|\/)claim[-_]reality[-_]reconciliation\.(?:md|mdx|json)$/i.test(file))
    .filter((file) => isAuthenticatedClaimRealityArtifact(repoPath, file));
}

function isAuthenticatedClaimRealityArtifact(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const contents = readRepoText(fullPath, 'utf8');
  if (/\.json$/i.test(file)) {
    return parseJsonObject(contents)?.artifactKind === 'claim_reality_reconciliation';
  }
  let inFence = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#\s+Claim Reality Reconciliation\s*$/i.test(line)) return true;
  }
  return false;
}

function isCoverageConfig(repoPath: string, file: string): boolean {
  if (
    /(^|\/)(nyc|c8|coverage|codecov)\.(json|yml|yaml)$/.test(file) ||
    /(^|\/)\.coveragerc$/.test(file) ||
    /(^|\/)lcov\.info$/.test(file) ||
    /(^|\/)\.coveralls\.yml$/.test(file)
  ) {
    return true;
  }
  if (/(^|\/)vitest\.config\.[cm]?[jt]s$/.test(file)) {
    return fileContains(repoPath, file, /\bcoverage\s*:/i);
  }
  if (/(^|\/)jest\.config\.[cm]?[jt]s$/.test(file)) {
    return fileContains(
      repoPath,
      file,
      /\b(?:collectCoverage|coverageThreshold|coverageProvider|coverageDirectory)\s*:/,
    );
  }
  if (/(^|\/)pyproject\.toml$/.test(file)) {
    return fileContains(repoPath, file, /^\[tool\.coverage(?:\.|\])/m);
  }
  if (/(^|\/)package\.json$/.test(file)) {
    return packageJsonHasCoverageTooling(repoPath, file);
  }
  return false;
}

function packageJsonHasCoverageTooling(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;

  const scripts = parsed.scripts;
  if (typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)) {
    for (const command of Object.values(scripts)) {
      if (typeof command === 'string' && commandInvokesCoverageTool(command)) {
        return true;
      }
    }
  }

  for (const key of ['nyc', 'c8', 'istanbul'] as const) {
    const config = parsed[key];
    if (typeof config === 'object' && config !== null && !Array.isArray(config)) return true;
  }
  return false;
}

function commandInvokesCoverageTool(command: string): boolean {
  return normalizedCommandInvokesCoverageTool(normalizeCoverageCommandPrefixes(command), 0);
}

function normalizedCommandInvokesCoverageTool(
  normalized: { segment: string; splitShellOperators: boolean },
  depth: number,
): boolean {
  const segments = normalized.splitShellOperators
    ? splitShellCommandSegments(normalized.segment)
    : [normalized.segment];
  return segments.some((rawSegment) => {
    const candidate = normalizeCoverageCommandPrefixes(rawSegment);
    if (/^(?:nyc|c8|istanbul)(?:\s|$)/iu.test(candidate.segment)) return true;
    return (
      depth < 4 &&
      candidate.splitShellOperators &&
      candidate.segment !== rawSegment.trim() &&
      normalizedCommandInvokesCoverageTool(candidate, depth + 1)
    );
  });
}

function splitShellCommandSegments(command: string): string[] {
  const segments: string[] = [];
  let start = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '#' && (index === 0 || /[\s;|&()]/u.test(command[index - 1] ?? ''))) {
      segments.push(command.slice(start, index));
      const newline = command.indexOf('\n', index + 1);
      if (newline < 0) return segments;
      index = newline;
      start = newline + 1;
      continue;
    }

    const isBoundary =
      character === ';' || character === '|' || character === '&' || character === '\n';
    if (!isBoundary) continue;
    segments.push(command.slice(start, index));
    if ((character === '|' || character === '&') && command[index + 1] === character) index += 1;
    start = index + 1;
  }
  segments.push(command.slice(start));
  return segments;
}

function normalizeCoverageCommandPrefixes(rawSegment: string): {
  segment: string;
  splitShellOperators: boolean;
} {
  let segment = rawSegment.trim();
  let unwrapQuotedShellCommand = false;
  let splitShellOperators = true;
  for (let index = 0; index < 8; index += 1) {
    const before = segment;
    segment = stripOuterShellGroup(segment);
    segment = segment.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)\s+)*/u, '');
    segment = segment.replace(
      /^(?:npx|npm\s+exec|pnpm\s+(?:exec|dlx)|yarn\s+(?:exec|dlx))(?:\s+--(?:no-install|yes))*(?:\s+--)?\s+/iu,
      '',
    );
    segment = segment.replace(/^(?:command(?:\s+-p)?(?:\s+--)?|time(?:\s+-p)?)\s+/iu, '');
    const explicitShellCommand = extractExplicitShellCommand(segment);
    if (explicitShellCommand !== null) {
      segment = explicitShellCommand;
      unwrapQuotedShellCommand = false;
      splitShellOperators = true;
    }
    const environmentPrefix = stripEnvironmentCommandPrefix(segment);
    segment = environmentPrefix.segment;
    unwrapQuotedShellCommand ||= environmentPrefix.unwrapQuotedShellCommand;
    if (environmentPrefix.splitShellOperators !== null) {
      splitShellOperators = environmentPrefix.splitShellOperators;
    }
    if (segment === before) break;
  }
  return {
    segment: unwrapQuotedShellCommand ? segment.replace(/^(["'])(.*)\1$/u, '$2').trim() : segment,
    splitShellOperators,
  };
}

function extractExplicitShellCommand(segment: string): string | null {
  const shellExecutable = /^(?:(?:\/(?:usr\/)?bin\/)?(?<shell>(?:ba|da|k|z)?sh))(?=\s|$)/iu.exec(
    segment,
  );
  if (!shellExecutable) return null;
  const shell = shellExecutable.groups?.shell?.toLowerCase();
  if (!shell) return null;

  let offset = shellExecutable[0].length;
  let noExecute = false;
  let dumpStrings = false;
  for (let optionCount = 0; optionCount < 32; optionCount += 1) {
    const option = scanShellWord(segment, offset);
    if (!option || (!option.word.startsWith('-') && !option.word.startsWith('+'))) return null;
    offset = option.end;

    if (option.word === '--') return null;

    const zshLongOption =
      shell === 'zsh' ? /^(?<sign>--|\+-)(?<name>[A-Za-z][A-Za-z_-]*)$/u.exec(option.word) : null;
    if (zshLongOption) {
      const optionName = zshLongOption.groups?.name?.replaceAll('-', '');
      if (!optionName) return null;
      const resolvedSetOption = resolveSupportedShellSetOption(shell, optionName);
      if (!resolvedSetOption && !isSupportedZshLongInvocationOption(optionName)) return null;
      if (resolvedSetOption?.name === 'noexec') {
        noExecute = (zshLongOption.groups?.sign === '--') !== resolvedSetOption.inverted;
      }
      continue;
    }

    if (option.word === '--rcfile' || option.word === '--init-file') {
      const operand = scanShellWord(segment, offset);
      if (shell !== 'bash' || !operand) return null;
      offset = operand.end;
      continue;
    }
    if (
      shell === 'bash' &&
      /^--(?:debug|debugger|login|noediting|noprofile|norc|posix|protected|restricted|verbose)$/u.test(
        option.word,
      )
    ) {
      continue;
    }

    const cluster = parseSupportedShellOptionCluster(shell, option.word);
    if (!cluster) return null;
    if (cluster.changesNoExecute) noExecute = cluster.sign === '-';
    if (cluster.enablesDumpStrings) dumpStrings = true;

    if (cluster.operandKind) {
      const operand = scanShellWord(segment, offset);
      const resolvedSetOperand =
        operand && cluster.operandKind === 'set'
          ? resolveSupportedShellSetOption(shell, operand.word)
          : null;
      const operandIsZshInvocationOption =
        shell === 'zsh' &&
        operand !== null &&
        cluster.operandKind === 'set' &&
        isSupportedZshLongInvocationOption(operand.word);
      const operandIsSupported =
        cluster.operandKind === 'set'
          ? resolvedSetOperand !== null || operandIsZshInvocationOption
          : shell === 'bash' && operand && BASH_SHOPT_OPTIONS.has(operand.word);
      if (!operand || !operandIsSupported) return null;
      if (resolvedSetOperand?.name === 'noexec') {
        noExecute = (cluster.sign === '-') !== resolvedSetOperand.inverted;
      }
      offset = operand.end;
    }

    if (cluster.hasCommand) {
      return noExecute || dumpStrings ? null : readShellWord(segment, offset);
    }
  }
  return null;
}

const BASH_SET_OPTIONS = new Set([
  'allexport',
  'braceexpand',
  'emacs',
  'errexit',
  'errtrace',
  'functrace',
  'hashall',
  'histexpand',
  'history',
  'ignoreeof',
  'keyword',
  'monitor',
  'noclobber',
  'noexec',
  'noglob',
  'nolog',
  'notify',
  'nounset',
  'onecmd',
  'physical',
  'pipefail',
  'posix',
  'privileged',
  'verbose',
  'vi',
  'xtrace',
]);

const BASH_SHOPT_OPTIONS = new Set([
  'autocd',
  'cdable_vars',
  'cdspell',
  'checkhash',
  'checkjobs',
  'checkwinsize',
  'cmdhist',
  'complete_fullquote',
  'direxpand',
  'dirspell',
  'dotglob',
  'execfail',
  'expand_aliases',
  'extdebug',
  'extglob',
  'extquote',
  'failglob',
  'force_fignore',
  'globasciiranges',
  'globskipdots',
  'globstar',
  'gnu_errfmt',
  'histappend',
  'histreedit',
  'histverify',
  'hostcomplete',
  'huponexit',
  'inherit_errexit',
  'interactive_comments',
  'lastpipe',
  'lithist',
  'localvar_inherit',
  'localvar_unset',
  'login_shell',
  'mailwarn',
  'nocaseglob',
  'nocasematch',
  'no_empty_cmd_completion',
  'nullglob',
  'progcomp',
  'progcomp_alias',
  'promptvars',
  'restricted_shell',
  'shift_verbose',
  'sourcepath',
  'varredir_close',
  'xpg_echo',
]);

const POSIX_SET_OPTIONS = new Set([
  'allexport',
  'errexit',
  'ignoreeof',
  'noclobber',
  'noexec',
  'noglob',
  'nounset',
  'verbose',
  'vi',
  'xtrace',
]);

const ZSH_LONG_INVOCATION_OPTIONS = new Set([
  'interactive',
  'login',
  'privileged',
  'shinstdin',
  'stdin',
]);

function isSupportedShellSetOption(shell: string, option: string): boolean {
  if (shell === 'bash') return BASH_SET_OPTIONS.has(option);
  if (shell === 'sh' || shell === 'dash') return POSIX_SET_OPTIONS.has(option);
  if (shell === 'ksh' || shell === 'zsh') {
    return POSIX_SET_OPTIONS.has(option) || option === 'pipefail';
  }
  return false;
}

function normalizeShellSetOption(shell: string, option: string): string {
  if (shell === 'zsh') return option.toLowerCase().replaceAll('_', '');
  return option;
}

function isSupportedZshLongInvocationOption(option: string): boolean {
  const normalized = normalizeShellSetOption('zsh', option);
  if (ZSH_LONG_INVOCATION_OPTIONS.has(normalized)) return true;
  return (
    normalized.startsWith('no') &&
    !normalized.startsWith('nono') &&
    ZSH_LONG_INVOCATION_OPTIONS.has(normalized.slice(2))
  );
}

function resolveSupportedShellSetOption(
  shell: string,
  option: string,
): { name: string; inverted: boolean } | null {
  const normalized = normalizeShellSetOption(shell, option);
  if (shell === 'zsh' && normalized === 'exec') {
    return { name: 'noexec', inverted: true };
  }
  if (isSupportedShellSetOption(shell, normalized)) {
    return { name: normalized, inverted: false };
  }
  if (
    shell === 'zsh' &&
    normalized.startsWith('no') &&
    !normalized.startsWith('nono') &&
    isSupportedShellSetOption(shell, normalized.slice(2))
  ) {
    return { name: normalized.slice(2), inverted: true };
  }
  return null;
}

function parseSupportedShellOptionCluster(
  shell: string,
  option: string,
): {
  sign: '-' | '+';
  hasCommand: boolean;
  changesNoExecute: boolean;
  enablesDumpStrings: boolean;
  operandKind: 'set' | 'shopt' | null;
} | null {
  if (!/^[+-][A-Za-z]+$/u.test(option)) return null;
  const sign = option[0] as '-' | '+';
  let letters = option.slice(1);
  let operandKind: 'set' | 'shopt' | null = null;
  const operandLetter = letters.at(-1);
  if (operandLetter === 'o' || operandLetter === 'O') {
    if (operandLetter === 'O' && shell !== 'bash') return null;
    letters = letters.slice(0, -1);
    if (letters.includes('c')) return null;
    operandKind = operandLetter === 'o' ? 'set' : 'shopt';
  }

  const supportedLetters =
    shell === 'bash'
      ? 'abcefhkmnptuvxBCEHPTilrsD'
      : shell === 'sh'
        ? 'abCcefimnsuvx'
        : shell === 'dash'
          ? 'abCcefilmnsuvx'
          : 'acefilmnpsuvx';
  if (![...letters].every((letter) => supportedLetters.includes(letter))) return null;

  return {
    sign,
    hasCommand: letters.includes('c'),
    changesNoExecute: letters.includes('n'),
    enablesDumpStrings: shell === 'bash' && letters.includes('D'),
    operandKind,
  };
}

function scanShellWord(value: string, start: number): { word: string; end: number } | null {
  let result = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  let index = start;

  while (index < value.length && /\s/u.test(value[index] ?? '')) index += 1;
  const wordStart = index;

  for (; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      if (character !== '\n') result += character;
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      const nextCharacter = value[index + 1];
      const escapesNext =
        quote !== '"' ||
        nextCharacter === '$' ||
        nextCharacter === '`' ||
        nextCharacter === '"' ||
        nextCharacter === '\\' ||
        nextCharacter === '\n';
      if (escapesNext) {
        escaped = true;
      } else {
        result += character;
      }
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        result += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/u.test(character ?? '')) break;
    result += character;
  }

  if (escaped || quote || index === wordStart) return null;
  return { word: result, end: index };
}

function readShellWord(value: string, start: number): string | null {
  return scanShellWord(value, start)?.word ?? null;
}

function stripOuterShellGroup(segment: string): string {
  if (!segment.startsWith('(') || segment.startsWith('((')) return segment;

  let depth = 0;
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character !== ')') continue;
    depth -= 1;
    if (depth < 0) return segment;
    if (depth === 0) {
      if (segment.slice(index + 1).trim().length > 0) return segment;
      return segment.slice(1, index).trim();
    }
  }
  return segment;
}

function stripEnvironmentCommandPrefix(segment: string): {
  segment: string;
  unwrapQuotedShellCommand: boolean;
  splitShellOperators: boolean | null;
} {
  const wrapper = /^(cross-env(?:-shell)?|env)(?:\s|$)/iu.exec(segment);
  if (!wrapper) {
    return { segment, unwrapQuotedShellCommand: false, splitShellOperators: null };
  }

  let remainder = segment.slice(wrapper[0].length).trimStart();
  let unwrapQuotedShellCommand = wrapper[1]?.toLowerCase() === 'cross-env-shell';
  let splitShellOperators = true;
  while (remainder.length > 0) {
    const splitString =
      /^(?:-S|--split-string)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))(?:\s+|$)/u.exec(remainder);
    if (splitString) {
      const splitCommand = splitString[1] ?? splitString[2] ?? splitString[3] ?? '';
      remainder = `${splitCommand} ${remainder.slice(splitString[0].length)}`.trim();
      unwrapQuotedShellCommand = false;
      splitShellOperators = false;
      continue;
    }

    const assignment = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/u.exec(
      remainder,
    );
    if (assignment) {
      remainder = remainder.slice(assignment[0].length).trimStart();
      continue;
    }

    const optionWithValue =
      /^(?:-u|--unset|-C|--chdir)(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s]+)(?:\s+|$)/u.exec(remainder);
    if (optionWithValue) {
      remainder = remainder.slice(optionWithValue[0].length).trimStart();
      continue;
    }

    const flag = /^(?:--ignore-environment|-i|--)(?:\s+|$)/u.exec(remainder);
    if (flag) {
      remainder = remainder.slice(flag[0].length).trimStart();
      continue;
    }
    break;
  }
  return { segment: remainder, unwrapQuotedShellCommand, splitShellOperators };
}

function isCiWorkflow(file: string): boolean {
  return (
    /^\.github\/workflows\/.+\.ya?ml$/.test(file) ||
    /^\.gitlab-ci\.ya?ml$/.test(file) ||
    /^\.circleci\/config\.ya?ml$/.test(file) ||
    /^azure-pipelines\.ya?ml$/.test(file) ||
    /^Jenkinsfile$/.test(file)
  );
}

function isDeployConfig(file: string): boolean {
  return (
    /(^|\/)(vercel|netlify|fly|render|railway)\.(json|toml|ya?ml)$/.test(file) ||
    /(^|\/)Dockerfile$/.test(file) ||
    /(^|\/)docker-compose\.ya?ml$/.test(file) ||
    /(^|\/)k8s\//.test(file)
  );
}

// Explicit deploy targets — Dockerfile alone is excluded because it is often
// a build or CI artifact; require it paired with a server entrypoint or
// a platform-specific deploy config to treat a repo as a deployable service.
function isExplicitDeployTarget(file: string): boolean {
  return (
    /(^|\/)(vercel|netlify|fly|render|railway)\.(json|toml|ya?ml)$/.test(file) ||
    /(^|\/)docker-compose\.ya?ml$/.test(file) ||
    /(^|\/)Procfile$/.test(file) ||
    /(^|\/)app\.ya?ml$/.test(file) ||
    /(^|\/)serverless\.ya?ml$/.test(file) ||
    /(^|\/)(k8s|kubernetes|manifests?)\/.+\.ya?ml$/i.test(file) ||
    /(^|\/)(charts?|helm)\/.+\.ya?ml$/i.test(file)
  );
}

// Entry-point-shaped file names (main, server, app, wsgi, asgi, index, etc.).
// Limiting server-entrypoint content scanning to these avoids false positives
// on framework source files that define (but do not call) listen/serve methods.
const MAIN_ENTRYPOINT_FILE_PATTERN =
  /(^|\/)(main|server|app|wsgi|asgi|index|entry|start|run)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs)$/i;
const RACK_ENTRYPOINT_FILE_PATTERN = /(^|\/)(?:config\.ru|(?:main|server|app|start|run)\.rb)$/i;

// app.listen / app.run under a test/example/fixture dir does NOT make the repo a deployable
// service — uses the shared isTestOrFixturePath classifier (see canonical block above), not a
// private regex of its own.

// Active server/port-binding calls across common frameworks and languages.
// Matches invocations (app.listen(port), uvicorn.run(app, ...), etc.) rather
// than method definitions in framework source (Application.prototype.listen = ...).
const SERVER_ENTRYPOINT_PATTERN =
  /\bapp\.listen\s*\(|\bserver\.listen\s*\(\s*(?:PORT|port|\d+)|http\.ListenAndServe\s*\(|http\.ListenAndServeTLS\s*\(|axum::Server(?:::|\.)|actix_web::HttpServer(?:::|\.)|uvicorn\.run\s*\(/;
// V20-only direct Node HTTP shape. Requiring both an entrypoint-shaped authored path and a
// bounded createServer(...).listen(port) expression avoids changing historical deployability
// classification or treating a helper that merely constructs an unbound server as production.
const V20_DIRECT_HTTP_SERVER_PATTERN =
  /\b(?:http|https)\.createServer\s*\([\s\S]{0,1500}?\)\.listen\s*\(\s*(?:PORT|port|\d+)/;
const V20_HEALTH_OR_READINESS_ROUTE_PATTERN =
  /["'`]\/(?:health|ready|readiness|live|liveness)["'`]/i;
const RACK_SERVER_ENTRYPOINT_PATTERN = /Rack::(?:Server|Handler(?:::\w+)?)\.(?:start|run)\s*\(/;
const RACK_CONFIG_RUN_PATTERN = /^\s*run\s+(?:(?:[A-Z]\w*(?:::\w+)*(?:\.new)?|lambda)\b|->)/m;
const RUNTIME_CONTAINER_COMMAND_PATTERN =
  /^\s*(?:CMD|ENTRYPOINT)\s+.*(?:\b(?:start|serve|server|qgis|nginx|apache|gunicorn|uvicorn)\b|manage\.py\s+runserver).*$/im;
const NON_RUNTIME_CONTAINER_COMMAND_PATTERN = /\b(?:test|lint|build|compile|package|check)\b/i;
const V20_NODE_RUNTIME_CONTAINER_COMMAND_PATTERN =
  /\bnode\b.*\b(?:main|server|app|service|index)\.(?:[cm]?js|ts)\b/i;

// CI workflow job/step patterns that indicate a real deployment step.
// Covers named deploy jobs in YAML and common deploy CLI commands.
const CI_DEPLOY_JOB_PATTERN =
  /(?:^\s{2,4}deploy\s*:|\b(?:fly|heroku|vercel|netlify|railway|render)\s+deploy\b|kubectl\s+apply\b|helm\s+(?:install|upgrade|deploy)\b|docker\s+push\b)/im;

function isDeployableService(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): boolean {
  // Explicit platform deploy target (Procfile, vercel.json, docker-compose, k8s, etc.)
  if (
    repoFiles.some(
      (file) =>
        (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)) &&
        isExplicitDeployTarget(file),
    )
  ) {
    return true;
  }
  // CI workflow with a real deploy job/step
  if (detectCiDeployJob(repoPath, repoFiles, useV27Detectors)) return true;
  // Production server entrypoint in a main/server/app file (not in examples/tests)
  if (detectServerEntrypoint(repoPath, repoFiles, useV27Detectors)) return true;
  // A production Dockerfile is a runtime surface only when it declares an actual start
  // command. Build/test-only Dockerfiles remain non-deployable.
  if (useV27Detectors && findRuntimeContainerEntrypointFile(repoPath, repoFiles)) return true;
  return false;
}

function detectCiDeployJob(
  repoPath: string,
  repoFiles: readonly string[],
  authoredOnly = false,
): boolean {
  const workflows = repoFiles.filter(
    (file) => (!authoredOnly || isAuthoredProductionPath(file)) && isCiWorkflow(file),
  );
  return workflows.some((file) => fileContains(repoPath, file, CI_DEPLOY_JOB_PATTERN));
}

function detectServerEntrypoint(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): boolean {
  return findServerEntrypointFile(repoPath, repoFiles, useV27Detectors) !== null;
}

function findServerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
  useV27Detectors: boolean,
): string | null {
  // Restrict to entry-point-shaped files to avoid matching framework source files
  // (e.g. gin's gin.go, express's lib/application.js) that define but never call serve.
  const candidates = repoFiles
    .filter(
      (file) =>
        (MAIN_ENTRYPOINT_FILE_PATTERN.test(file) ||
          (useV27Detectors && RACK_ENTRYPOINT_FILE_PATTERN.test(file))) &&
        (useV27Detectors ? isAuthoredProductionPath(file) : isProductionSourcePath(file)),
    )
    .slice(0, 30);
  return (
    candidates.find(
      (file) =>
        fileContains(repoPath, file, SERVER_ENTRYPOINT_PATTERN) ||
        (useV27Detectors && fileContains(repoPath, file, RACK_SERVER_ENTRYPOINT_PATTERN)) ||
        (useV27Detectors &&
          /\.ru$/i.test(file) &&
          fileContains(repoPath, file, RACK_CONFIG_RUN_PATTERN)),
    ) ?? null
  );
}

function findV20DirectHttpServerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
): string | null {
  return (
    repoFiles
      .filter(
        (file) => MAIN_ENTRYPOINT_FILE_PATTERN.test(file) && isAuthoredProductionPath(file),
      )
      .slice(0, 30)
      .find((file) => fileContains(repoPath, file, V20_DIRECT_HTTP_SERVER_PATTERN)) ?? null
  );
}

function findRuntimeContainerEntrypointFile(
  repoPath: string,
  repoFiles: readonly string[],
  useV20NodeEntrypoints = false,
): string | null {
  return (
    repoFiles
      .filter((file) => /(^|\/)Dockerfile$/i.test(file) && isAuthoredProductionPath(file))
      .find((file) => {
        const fullPath = join(repoPath, file);
        if (!isRegularFile(fullPath)) return false;
        const lines = readRepoText(fullPath, 'utf8').split(/\r?\n/);
        const finalStageStart = lines.reduce(
          (last, line, index) => (/^\s*FROM\b/i.test(line) ? index : last),
          0,
        );
        const finalStageLines = lines.slice(finalStageStart);
        const entrypoint = [...finalStageLines]
          .reverse()
          .find((line) => /^\s*ENTRYPOINT\b/i.test(line));
        const command = [...finalStageLines].reverse().find((line) => /^\s*CMD\b/i.test(line));
        const effectiveCommand = [entrypoint, command].filter(Boolean).join(' ');
        return (
          effectiveCommand.length > 0 &&
          (RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand) ||
            (useV20NodeEntrypoints &&
              V20_NODE_RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand))) &&
          !NON_RUNTIME_CONTAINER_COMMAND_PATTERN.test(effectiveCommand)
        );
      }) ?? null
  );
}

function isHealthCheckSignalFile(repoPath: string, file: string): boolean {
  if (/docs\/|audit|architecture|adr/i.test(file)) return false;
  if (/^Dockerfile$/.test(file) && fileContains(repoPath, file, /\bHEALTHCHECK\b/i)) return true;
  if (/k8s\/|kubernetes\/|helm\//.test(file)) {
    return fileContains(repoPath, file, /livenessProbe|readinessProbe/i);
  }
  if (/(^|\/)(health|healthcheck|readiness|liveness|ready)\.[cm]?[jt]sx?$/.test(file)) {
    return fileContains(repoPath, file, /health|ready|readiness|liveness/i);
  }
  if (/(^|\/)(health|healthcheck|readiness|liveness|ready)\.py$/.test(file)) {
    return fileContains(repoPath, file, /health|ready|readiness|liveness/i);
  }
  return false;
}

function isDependencyManifest(file: string): boolean {
  return /(^|\/)(package\.json|pyproject\.toml|requirements(?:[^/]*)?\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle|vcpkg\.json|Pipfile|CMakeLists\.txt|conanfile\.txt|conanfile\.py)$/.test(
    file,
  );
}

function isLockfile(file: string): boolean {
  return /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock|uv\.lock|poetry\.lock|go\.sum|Cargo\.lock|Pipfile\.lock|composer\.lock|conan\.lock|vcpkg\.lock\.json)$/.test(
    file,
  );
}

function isDependencyUpdateConfig(file: string): boolean {
  return (
    /(^|\/)(renovate\.json|renovate\.json5|\.renovaterc\.json|dependabot\.ya?ml)$/.test(file) ||
    /^\.github\/dependabot\.ya?ml$/.test(file)
  );
}

function packageJsonHasAuditScript(repoPath: string, manifest: string): boolean {
  if (!manifest.endsWith('package.json')) return false;
  const scripts = readPackageScripts(join(repoPath, manifest));
  return [...scripts.values()].some((script) =>
    /\b(audit|npm audit|pnpm audit|yarn audit)\b/i.test(script),
  );
}

function packageJsonHasHeavyTestDependency(repoPath: string, manifest: string): boolean {
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const names = [
    ...Object.keys(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
    ...Object.keys(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
  ];
  return names.some((name) => HEAVY_TEST_DEPENDENCY_NAME_PATTERN.test(name));
}

function packageJsonDescribesPackagedApplication(
  repoPath: string,
  manifest: string,
  repoFiles: readonly string[],
): boolean {
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const scripts = isRecord(parsed.scripts) ? Object.values(parsed.scripts) : [];
  const dependencies = {
    ...(isRecord(parsed.dependencies) ? parsed.dependencies : {}),
    ...(isRecord(parsed.devDependencies) ? parsed.devDependencies : {}),
  };
  const build = isRecord(parsed.build) ? parsed.build : null;
  const hasDesktopRuntime = Object.keys(dependencies).some(
    (name) => name.toLowerCase() === 'electron' || /^@tauri-apps\/(?:api|plugin-)/i.test(name),
  );
  const hasPackagingCommand = scripts.some(
    (script) =>
      typeof script === 'string' &&
      /\b(?:electron-builder|electron-packager|tauri\s+build)\b/i.test(script),
  );
  const hasApplicationMetadata =
    isNonEmptyString(parsed.productName) ||
    isNonEmptyString(parsed.main) ||
    (build != null && isNonEmptyString(build.appId)) ||
    findTauriApplicationMetadata(repoPath, manifest, repoFiles);
  return hasDesktopRuntime && hasPackagingCommand && hasApplicationMetadata;
}

function findTauriApplicationMetadata(
  repoPath: string,
  manifest: string,
  repoFiles: readonly string[],
): boolean {
  const manifestDirectory = dirname(manifest);
  const prefix = manifestDirectory === '.' ? '' : `${manifestDirectory}/`;
  const candidates = [`${prefix}src-tauri/tauri.conf.json`, `${prefix}tauri.conf.json`];
  return candidates.some((file) => {
    if (!repoFiles.includes(file)) return false;
    const fullPath = join(repoPath, file);
    if (!isRegularFile(fullPath)) return false;
    const config = parseJsonObject(readRepoText(fullPath, 'utf8'));
    const packageMetadata = isRecord(config?.package) ? config.package : null;
    return (
      isNonEmptyString(config?.productName) ||
      isNonEmptyString(config?.identifier) ||
      (packageMetadata != null && isNonEmptyString(packageMetadata.productName))
    );
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isImplementationFile(file: string): boolean {
  return (
    /(^|\/)(src|app|lib|packages|cmd|include|source|Sources)\//.test(file) &&
    /\.(ts|tsx|js|jsx|py|go|rs|java|rb|cpp|cc|cxx|c|h|hpp|kt|swift|php)$/.test(file)
  );
}

function isAuditFile(file: string): boolean {
  return (
    // goal_cejel_calibration_fix_with_strict_gate_2026-07-06: mature OSS repos document the
    // same audit-trail practice under different filenames/extensions than Alfred's own
    // conventions (Flask ships CHANGES.rst, not CHANGELOG.md) — recognize the common OSS
    // release-notes/security-policy/provenance equivalents so real audit-trail artifacts are
    // credited instead of silently missing the pattern.
    /(^|\/)(CHANGELOG|CHANGES|HISTORY|NEWS|RELEASE_NOTES|RELEASES|SECURITY|AUDIT|STATUS)\.(md|rst|txt)$/i.test(
      file,
    ) ||
    /(^|\/)docs\/.*(audit|runbook|incident|changelog|security).*\.(md|rst)$/i.test(file) ||
    // Provenance/signed-release tooling config is itself audit-trail evidence (a repo that
    // wires SLSA/cosign attestation or CITATION.cff is documenting release provenance).
    /(^|\/)CITATION\.cff$/i.test(file)
  );
}

// A security-policy document (SECURITY.md and its docs/*security* equivalent) is a static
// vulnerability-disclosure notice, not a changelog/audit trail — real-world copies rarely
// change after being written, so there is no "freshness" for B4 to rate. Every other
// isAuditFile match (CHANGELOG/CHANGES/HISTORY/NEWS/RELEASE_NOTES/RELEASES/AUDIT/STATUS,
// docs runbook/incident/changelog notes, CITATION.cff) is a genuine over-time trail.
// goal_cejel_b4_archetype_gate_2026-07-11: distinguishes "has a security policy" from
// "has an audit trail" so the N/A gate below can tell them apart.
function isSecurityPolicyOnlyAuditFile(file: string): boolean {
  return (
    /(^|\/)SECURITY\.(md|rst|txt)$/i.test(file) || /(^|\/)docs\/.*security.*\.(md|rst)$/i.test(file)
  );
}

function isFreshnessRatableAuditFile(file: string): boolean {
  return isAuditFile(file) && !isSecurityPolicyOnlyAuditFile(file);
}

function isIgnoredScanFile(file: string, useV47Detectors = false): boolean {
  return (
    /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|README\.md|CHANGELOG\.md)$/.test(file) ||
    isEnvTemplatePath(file, useV47Detectors)
  );
}

function findRootPackageJson(repoFiles: readonly string[]): string | null {
  return repoFiles.includes('package.json') ? 'package.json' : null;
}

// Returns true only for regular files — directories and missing paths both return false.
// This prevents EISDIR crashes when git ls-files returns submodule directory entries.
export function isRegularFile(path: string): boolean {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

export function fileContains(repoPath: string, file: string, pattern: RegExp): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  return pattern.test(readRepoText(fullPath, 'utf8'));
}

function findCommittedSecretInFile(
  repoPath: string,
  file: string,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
): RealSecretAssignmentMatch | null {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return null;
  const contents = readRepoText(fullPath, 'utf8');
  const isTestCredentialConfiguration =
    useV39Detectors && isLikelyTestCredentialConfiguration(file, contents);
  const secretScanContents = prepareCredentialScanContents(
    contents,
    file,
    useV36Detectors,
    useV39Detectors,
    useV47Detectors,
  );
  const secret = findRealSecretAssignment(secretScanContents, new Set(), {
    allowCredentialNamedDigest: useV36Detectors,
  });
  if (secret) return secret;
  if (useV39Detectors && isEnvHistoryPath(file, useV36Detectors)) {
    const weakCredential = findWeakExplicitEnvCredential(secretScanContents);
    if (weakCredential) return weakCredential;
  }
  return useV36Detectors && !isTestCredentialConfiguration
    ? findDefaultAdministrativeCredential(secretScanContents)
    : null;
}

function prepareCredentialScanContents(
  contents: string,
  file: string,
  useV36Detectors: boolean,
  useV39Detectors: boolean,
  useV47Detectors = false,
): string {
  const withoutXamlEventNames =
    useV36Detectors && /\.xaml$/i.test(file)
      ? contents.replace(/\bTokenItem(?:Added|Removed)(?=\s*=)/gi, 'EventHandler')
      : contents;
  const withoutDocumentationExamples = useV39Detectors
    ? stripCommentAndDocumentationExamples(withoutXamlEventNames)
    : withoutXamlEventNames;
  return useV47Detectors
    ? stripV47PublicIdentifiersAndNonCredentialValues(withoutDocumentationExamples, file)
    : withoutDocumentationExamples;
}

function stripV47PublicIdentifiersAndNonCredentialValues(contents: string, file: string): string {
  const lines = contents.split(/\r?\n/);
  return lines
    .map((line, index) => {
      let sanitized = line.replace(
        /^(\s*(?:export\s+)?(?:PUBLIC_)?ALGOLIA_(?:PUBLIC_)?API_KEY\s*[:=]\s*)[^\s#]+/i,
        '$1""',
      );
      if (isPublicDocumentationSearchKeyContext(lines, index, file)) {
        sanitized = sanitized.replace(/(\bapiKey\s*[:=]\s*)(['"])[^'"]+\2/gi, '$1$2$2');
      }
      sanitized = sanitized.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*(?:token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(['"]?)0x[0-9a-f]{40}\2/gi,
        '$1""',
      );
      sanitized = sanitized.replace(
        /(\b[A-Za-z_][A-Za-z0-9_]*(?:token|api[_-]?key|access[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*)(['"])([a-z][a-z0-9]*(?:_[a-z0-9]+){2,})\2/gi,
        (assignment, prefix: string, quote: string, value: string) =>
          /\b(?:cost|input|output|context|model|limit|price|usage|audio)\b/i.test(
            value.replaceAll('_', ' '),
          )
            ? `${prefix}${quote}${quote}`
            : assignment,
      );
      return sanitized;
    })
    .join('\n');
}

function isPublicDocumentationSearchKeyContext(
  lines: readonly string[],
  lineIndex: number,
  file: string,
): boolean {
  const windowStart = Math.max(0, lineIndex - 6);
  const preceding = lines.slice(windowStart, lineIndex + 1);
  for (let index = preceding.length - 1; index >= 0; index -= 1) {
    const candidate = preceding[index] ?? '';
    if (/}/.test(candidate) && index < preceding.length - 1) return false;
    if (/\bdocsearch(?:Options)?\b/i.test(candidate)) return true;
    if (
      /\balgolia\b/i.test(candidate) &&
      /(?:^|\/)(?:website|docs?)(?:\/|$)|(?:site[-_]?config|\.dumirc|docusaurus)/i.test(file)
    ) {
      return true;
    }
  }
  return false;
}

function stripCommentAndDocumentationExamples(contents: string): string {
  let blockCommentEnd: '*/' | '-->' | null = null;
  return contents
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trimStart();
      if (blockCommentEnd) {
        if (trimmed.includes(blockCommentEnd)) blockCommentEnd = null;
        return '';
      }
      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) blockCommentEnd = '*/';
        return '';
      }
      if (trimmed.startsWith('<!--')) {
        if (!trimmed.includes('-->')) blockCommentEnd = '-->';
        return '';
      }
      if (/^(?:\/\/|#|\*)/.test(trimmed)) return '';
      if (/\.description\s*\(/i.test(line) && /api[_-]?key|token|password|secret/i.test(line)) {
        return '';
      }
      return line;
    })
    .join('\n');
}

function isLikelyTestCredentialConfiguration(file: string, contents: string): boolean {
  if (!/\.(?:ya?ml|json|toml|ini|conf)$/i.test(file) && !/(?:^|\/)docker-compose/i.test(file)) {
    return false;
  }
  const testMarkers =
    contents.match(/(?:^|[^A-Za-z])(?:tests?|testing|e2e|appium|fixture)(?:[^A-Za-z]|$)/gi)
      ?.length ?? 0;
  return testMarkers >= 2;
}

function hasTemplateOnlyEnvContent(repoPath: string, file: string): boolean {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return false;
  const substantiveLines = readRepoText(fullPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !/^\s*#/.test(line));
  if (substantiveLines.length === 0) return true;
  const assignments = substantiveLines.map(
    (line) => /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*?)\s*$/.exec(line)?.[1] ?? null,
  );
  if (assignments.some((value) => value === null)) return false;
  return assignments.every((raw) => {
    if (raw === null) return false;
    const value = raw.replace(/^['"]|['"]$/g, '').trim();
    return value.length === 0 || isPlaceholderSecretValue(value);
  });
}

function findSecretFingerprintsInFile(
  repoPath: string,
  file: string,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
): string[] {
  const fullPath = join(repoPath, file);
  if (!isRegularFile(fullPath)) return [];
  const contents = readRepoText(fullPath, 'utf8');
  const scanContents = prepareCredentialScanContents(
    contents,
    file,
    useV36Detectors,
    useV39Detectors,
    useV47Detectors,
  );
  const fingerprints = findRealSecretAssignments(
    scanContents,
    new Set(),
    Number.POSITIVE_INFINITY,
    { allowCredentialNamedDigest: useV36Detectors },
  ).map(({ valueFingerprint }) => valueFingerprint);
  if (useV39Detectors && isEnvHistoryPath(file, useV36Detectors)) {
    const weakCredential = findWeakExplicitEnvCredential(scanContents);
    if (weakCredential) fingerprints.push(weakCredential.valueFingerprint);
  }
  return [...new Set(fingerprints)];
}

export function containsRealSecret(contents: string): boolean {
  return findRealSecretAssignment(contents) !== null;
}

interface RealSecretAssignmentMatch {
  identifier: string;
  line: number;
  valueLength: number;
  characterClasses: string;
  valueFingerprint: string;
  kind?: 'secret' | 'default_admin';
}

interface SecretAssignmentOptions {
  allowCredentialNamedDigest?: boolean;
}

function findRealSecretAssignment(
  contents: string,
  excludedValueFingerprints: ReadonlySet<string> = new Set(),
  options: SecretAssignmentOptions = {},
): RealSecretAssignmentMatch | null {
  return findRealSecretAssignments(contents, excludedValueFingerprints, 1, options)[0] ?? null;
}

function findRealSecretAssignments(
  contents: string,
  excludedValueFingerprints: ReadonlySet<string> = new Set(),
  maximumMatches = Number.POSITIVE_INFINITY,
  options: SecretAssignmentOptions = {},
): RealSecretAssignmentMatch[] {
  const matches: RealSecretAssignmentMatch[] = [];
  // The former all-in-one expression started its greedy identifier scan at every character.
  // On large generated or minified files with no assignment, that can revisit the same suffix
  // quadratically. Search for the required keyword first, then parse only its identifier suffix,
  // assignment delimiter, and value. This accepts the same assignment grammar as the former
  // expression while keeping the scan linear in file size.
  SECRET_IDENTIFIER_KEYWORD_PATTERN.lastIndex = 0;
  let match = SECRET_IDENTIFIER_KEYWORD_PATTERN.exec(contents);
  let line = 1;
  let lineCursor = 0;
  while (match !== null) {
    const keyword = match[0];
    const keywordStart = match.index;
    while (lineCursor < keywordStart) {
      if (contents.charCodeAt(lineCursor) === 10) line += 1;
      lineCursor += 1;
    }

    let cursor = keywordStart + keyword.length;
    while (cursor < contents.length && isSecretIdentifierCharacter(contents.charCodeAt(cursor))) {
      cursor += 1;
    }
    const identifierEnd = cursor;
    let identifierStart = keywordStart;
    while (
      identifierStart > 0 &&
      isSecretIdentifierCharacter(contents.charCodeAt(identifierStart - 1))
    ) {
      identifierStart -= 1;
    }
    const identifier = contents.slice(identifierStart, identifierEnd);
    let nextSearchIndex = identifierEnd;
    while (cursor < contents.length && SINGLE_WHITESPACE_PATTERN.test(contents[cursor] ?? '')) {
      cursor += 1;
    }
    const delimiter = contents[cursor];
    if (delimiter === ':' || delimiter === '=') {
      cursor += 1;
      while (cursor < contents.length && SINGLE_WHITESPACE_PATTERN.test(contents[cursor] ?? '')) {
        cursor += 1;
      }
      if (contents[cursor] === "'" || contents[cursor] === '"') cursor += 1;

      const valueStart = cursor;
      while (cursor < contents.length) {
        const character = contents[cursor] ?? '';
        if (character === "'" || character === '"' || SINGLE_WHITESPACE_PATTERN.test(character)) {
          break;
        }
        cursor += 1;
      }
      if (cursor > valueStart) {
        const value = contents.slice(valueStart, cursor).replace(/[,;)]$/, '');
        // The former global assignment expression consumed the complete raw value before looking
        // for another assignment. Preserve that behavior and avoid rescans inside the value.
        nextSearchIndex = cursor;
        if (
          !isPlaceholderSecretValue(value) &&
          (looksLikeSecretValue(value) ||
            (options.allowCredentialNamedDigest === true &&
              isLikelyDigestOrHash(value) &&
              isExplicitCredentialIdentifier(identifier)))
        ) {
          const valueFingerprint = createHash('sha256').update(value).digest('hex');
          const characterClasses = [
            /[a-z]/.test(value) ? 'lower' : '',
            /[A-Z]/.test(value) ? 'upper' : '',
            /\d/.test(value) ? 'digit' : '',
            /[^A-Za-z0-9]/.test(value) ? 'symbol' : '',
          ]
            .filter(Boolean)
            .join('+');
          if (!excludedValueFingerprints.has(valueFingerprint)) {
            matches.push({
              identifier,
              line,
              valueLength: value.length,
              characterClasses: characterClasses || 'other',
              valueFingerprint,
            });
            if (matches.length >= maximumMatches) return matches;
          }
        }
      }
    }
    // Every later keyword before identifierEnd belongs to the same identifier and would inspect
    // the same suffix. Skip it so keyword-dense generated identifiers remain a single pass. When
    // a value matched, nextSearchIndex also skips the raw value consumed by the former expression.
    SECRET_IDENTIFIER_KEYWORD_PATTERN.lastIndex = nextSearchIndex;
    match = SECRET_IDENTIFIER_KEYWORD_PATTERN.exec(contents);
  }
  return matches;
}

function isExplicitCredentialIdentifier(identifier: string): boolean {
  return /^(?:github|gitlab|api|access)[_-]?(?:token|key)$/i.test(identifier);
}

function findWeakExplicitEnvCredential(contents: string): RealSecretAssignmentMatch | null {
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (/^\s*#/.test(line)) continue;
    const match =
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*(?:PASSWORD|PASSWD|PWD|SECRET(?:_KEY)?|API_KEY|TOKEN))\s*=\s*['"]?([^\s#'"]+)['"]?/i.exec(
        line,
      );
    const identifier = match?.[1];
    const value = match?.[2];
    if (!identifier || !value || isPlaceholderSecretValue(value)) continue;
    const minimumLength = /(?:API_KEY|TOKEN)$/i.test(identifier) ? 12 : 6;
    if (value.length < minimumLength) continue;
    const characterClasses = [
      /[a-z]/.test(value) ? 'lower' : '',
      /[A-Z]/.test(value) ? 'upper' : '',
      /\d/.test(value) ? 'digit' : '',
      /[^A-Za-z0-9]/.test(value) ? 'symbol' : '',
    ]
      .filter(Boolean)
      .join('+');
    return {
      identifier,
      line: index + 1,
      valueLength: value.length,
      characterClasses: characterClasses || 'other',
      valueFingerprint: createHash('sha256').update(value).digest('hex'),
    };
  }
  return null;
}

function findDefaultAdministrativeCredential(contents: string): RealSecretAssignmentMatch | null {
  const lines = contents.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match =
      /\b([A-Za-z0-9_]*(?:ADMIN|ROOT)[A-Za-z0-9_]*(?:PASSWORD|PASSWD|PWD))\s*[:=]\s*["']?(admin|root|password)["']?(?:\s|$)/i.exec(
        line,
      );
    const identifier = match?.[1];
    const value = match?.[2];
    if (!identifier || !value) continue;
    return {
      identifier,
      line: index + 1,
      valueLength: value.length,
      characterClasses: 'lower',
      valueFingerprint: createHash('sha256').update(value).digest('hex'),
      kind: 'default_admin',
    };
  }
  return null;
}

function secretEvidenceLabel(prefix: string, match: RealSecretAssignmentMatch): string {
  return `${prefix} (value redacted; length ${match.valueLength}; classes ${match.characterClasses})`;
}

function isSecretIdentifierCharacter(characterCode: number): boolean {
  return (
    (characterCode >= 48 && characterCode <= 57) ||
    (characterCode >= 65 && characterCode <= 90) ||
    characterCode === 95 ||
    (characterCode >= 97 && characterCode <= 122)
  );
}

interface HistorySecretScanResult {
  // A confirmed high-entropy secret value found in a historical blob — critical.
  evidence: WitanEvidencePointer | null;
  // A non-template .env file path was tracked in history, but no confirmed secret
  // value was found in the scanned content — at most a warning, never a critical
  // ("bare path", not a "value"). Templates never reach this: isCredentialHistoryPath
  // excludes them before they are ever blob-scanned.
  envPathEvidence: WitanEvidencePointer | null;
  truncated: boolean;
}

const CONTROL_CHARACTER_HISTORY_PATH_LIMITATION =
  'Git history contained a credential-shaped pathname with control characters. Cejel omitted that path from historical blob inspection and continued with reduced history evidence.';

function declareHistoryFailure(
  scanLimitations: Set<string>,
  reason: Exclude<GitExecResult, { readonly ok: true }>['reason'],
  operation: string,
  maxBufferBytes?: number,
): void {
  scanLimitations.add(
    `${describeGitFailure(reason, operation, maxBufferBytes)} Cejel continued with reduced Git history evidence.`,
  );
}

function collectHistorySecretEvidence(
  repoPath: string,
  excludeHead: boolean,
  currentSecretFingerprintsByPath: ReadonlyMap<string, ReadonlySet<string>>,
  scanLimitations: Set<string>,
  authoredProductionOnly = false,
  useV36Detectors = false,
  useV39Detectors = false,
  useV47Detectors = false,
): HistorySecretScanResult {
  const historyEntries = readCredentialHistoryEntries(
    repoPath,
    scanLimitations,
    useV36Detectors,
  );
  const head = excludeHead ? readGitHead(repoPath) : null;
  let scannedFiles = 0;
  let envPathEvidence: WitanEvidencePointer | null = null;
  for (const entry of historyEntries) {
    if (head && entry.commit === head) continue;
    if (
      authoredProductionOnly &&
      !(useV47Detectors
        ? isV47AuthoredProductionPath(entry.path)
        : useV39Detectors
          ? isV39AuthoredProductionPath(entry.path)
          : isAuthoredProductionPath(entry.path))
    ) {
      continue;
    }
    if (scannedFiles >= HISTORY_SECRET_SCAN_CREDENTIAL_BLOB_LIMIT) {
      return { evidence: null, envPathEvidence, truncated: true };
    }
    scannedFiles += 1;
    const contents = readGitBlob(repoPath, entry.commit, entry.path, scanLimitations);
    if (!contents) continue;
    const scanContents = prepareCredentialScanContents(
      contents,
      entry.path,
      useV36Detectors,
      useV39Detectors,
      useV47Detectors,
    );
    const currentFingerprints = currentSecretFingerprintsByPath.get(entry.path) ?? new Set();
    let secretMatch = findRealSecretAssignment(scanContents, currentFingerprints, {
      allowCredentialNamedDigest: useV36Detectors,
    });
    if (
      !secretMatch &&
      useV39Detectors &&
      isEnvHistoryPath(entry.path, useV36Detectors, useV47Detectors)
    ) {
      const weakCredential = findWeakExplicitEnvCredential(scanContents);
      if (weakCredential && !currentFingerprints.has(weakCredential.valueFingerprint)) {
        secretMatch = weakCredential;
      }
    }
    if (secretMatch) {
      return {
        evidence: {
          kind: 'secret_scan',
          label: secretEvidenceLabel('Committed secret in recent git history', secretMatch),
          path: entry.path,
          line: secretMatch.line,
          contentHash: entry.commit,
        },
        envPathEvidence,
        truncated: false,
      };
    }
    if (!envPathEvidence && isEnvHistoryPath(entry.path, useV36Detectors, useV47Detectors)) {
      envPathEvidence = {
        kind: 'secret_scan',
        label: '.env file (not a template) tracked in git history; no confirmed secret value found',
        path: entry.path,
        contentHash: entry.commit,
      };
    }
  }
  return { evidence: null, envPathEvidence, truncated: false };
}

interface GitHistoryEntry {
  commit: string;
  path: string;
}

function readCredentialHistoryEntries(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
): GitHistoryEntry[] {
  const entries: GitHistoryEntry[] = [];
  const seen = new Set<string>();

  const appendEntry = (entry: GitHistoryEntry): void => {
    const key = `${entry.commit}:${entry.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  // A report is bound to the checked-out revision. Unrelated local branches and
  // remote-tracking refs are ambient clone state, not evidence for that revision.
  const commitsResult = execGit(['rev-list', 'HEAD'], { cwd: repoPath });
  if (!commitsResult.ok && !isExpectedGitAbsence(commitsResult)) {
    declareHistoryFailure(scanLimitations, commitsResult.reason, 'history revision enumeration');
  }
  if (commitsResult.ok) {
    const historyResult = execGit(
      [
        'diff-tree',
        '--stdin',
        '--root',
        '--name-only',
        '-r',
        '--diff-filter=AM',
        '-z',
        '--pretty=format:commit:%H%x00',
      ],
      { cwd: repoPath, input: commitsResult.stdout },
    );
    if (!historyResult.ok) {
      if (!isExpectedGitAbsence(historyResult)) {
        declareHistoryFailure(scanLimitations, historyResult.reason, 'history tree enumeration');
      }
    } else {
      let currentCommit: string | null = null;
      for (const rawToken of historyResult.stdout.split('\0')) {
        const token = rawToken.startsWith('\n') ? rawToken.slice(1) : rawToken;
        if (token.startsWith('commit:')) {
          currentCommit = token.slice('commit:'.length);
          continue;
        }
        const path = token;
        if (!currentCommit || !path) continue;
        if (/[\u0000-\u001f\u007f]/.test(path)) {
          scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
          continue;
        }
        if (!isCredentialHistoryPath(path, useV36Detectors)) continue;
        appendEntry({ commit: currentCommit, path });
      }
    }
  }

  for (const entry of readDeletedCredentialHistoryEntries(
    repoPath,
    scanLimitations,
    useV36Detectors,
  )) {
    appendEntry(entry);
  }

  return entries;
}

function readDeletedCredentialHistoryEntries(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
): GitHistoryEntry[] {
  const deletedPaths = readDeletedCredentialHistoryPaths(
    repoPath,
    scanLimitations,
    useV36Detectors,
  );
  const entries: GitHistoryEntry[] = [];
  const seen = new Set<string>();
  for (const path of deletedPaths) {
    for (const commit of readHistoryCommitsForPath(repoPath, path, scanLimitations)) {
      const key = `${commit}:${path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ commit, path });
    }
  }
  return entries;
}

function readDeletedCredentialHistoryPaths(
  repoPath: string,
  scanLimitations: Set<string>,
  useV36Detectors = false,
): string[] {
  const historyResult = execGit(
    [
      'log',
      '--no-show-signature',
      'HEAD',
      '--diff-filter=D',
      '--name-only',
      '-z',
      '--format=commit:%H%x00',
    ],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    declareHistoryFailure(scanLimitations, historyResult.reason, 'deleted-path history scan');
    return [];
  }
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const rawToken of historyResult.stdout.split('\0')) {
    const path = rawToken.startsWith('\n') ? rawToken.slice(1) : rawToken;
    if (path.startsWith('commit:') || !path) continue;
    if (/[\u0000-\u001f\u007f]/.test(path)) {
      scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
      continue;
    }
    if (!path || seen.has(path)) continue;
    if (!isCredentialHistoryPath(path, useV36Detectors)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

function readHistoryCommitsForPath(
  repoPath: string,
  path: string,
  scanLimitations: Set<string>,
): string[] {
  const historyResult = execGit(
    ['log', '--no-show-signature', 'HEAD', '--diff-filter=AM', '--format=%H', '--', path],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    declareHistoryFailure(scanLimitations, historyResult.reason, 'path history scan');
    return [];
  }
  return historyResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[0-9a-f]{40}$/i.test(line));
}

function isCredentialHistoryPath(path: string, _useV36Detectors = false): boolean {
  if (isHardExcludedPath(path)) return false;
  // Note: template paths (.env.example etc.) are intentionally NOT excluded here —
  // a real secret can still leak through a template path (e.g. committed, then later
  // redacted to placeholders in a follow-up commit); the path alone never proves the
  // content is safe. containsRealSecret (content-based) is what decides critical vs
  // not — see isPlaceholderSecretValue's ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN for how
  // genuine template placeholder VALUES are told apart from real leaked values.
  const lowerPath = path.toLowerCase();
  const basename = lowerPath.split('/').at(-1) ?? lowerPath;
  if (/\.env(?:\.|$)/.test(basename)) {
    return true;
  }
  return (
    lowerPath.includes('secret') ||
    lowerPath.includes('credential') ||
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename === 'id_rsa' ||
    basename.endsWith('.p12') ||
    basename.endsWith('.pfx')
  );
}

// Non-template .env-shaped path — explicitly excludes .env.example/.sample/.template/.dist,
// since a bare template PATH (with no confirmed secret value) is never even a warning: it's
// the canonical safe pattern (goal_cejel_calibration_findings_precision_2026-07-06). Used to
// distinguish "a real, non-template .env file was tracked, value unknown" (warning) from
// "a real high-entropy secret value was found" (critical, handled separately via containsRealSecret).
function isEnvHistoryPath(path: string, useV36Detectors = false, useV47Detectors = false): boolean {
  if (isEnvTemplatePath(path, useV47Detectors)) return false;
  if (useV47Detectors && !isV47AuthoredProductionPath(path)) return false;
  const basename = path.toLowerCase().split('/').at(-1) ?? path.toLowerCase();
  return (useV36Detectors ? /^\.env(?:\.|$)/ : /\.env(?:\.|$)/).test(basename);
}

function readGitBlob(
  repoPath: string,
  commit: string,
  path: string,
  scanLimitations: Set<string>,
): string | null {
  const maxBufferBytes = 512_000;
  const blobResult = execGit(['show', `${commit}:${path}`], {
    cwd: repoPath,
    maxBufferBytes,
  });
  if (!blobResult.ok) {
    if (isExpectedGitAbsence(blobResult)) return null;
    declareHistoryFailure(
      scanLimitations,
      blobResult.reason,
      'historical blob read',
      maxBufferBytes,
    );
    return null;
  }
  return blobResult.stdout;
}

// A human-readable ALL-CAPS snake_case label (YOUR_API_KEY_HERE, CHANGE_THIS_VALUE,
// INSERT_SECRET_HERE, NOT_SET) is a common .env.example placeholder convention that
// doesn't necessarily contain "your"/"example"/etc — but real secret tokens are never
// pure-uppercase English words joined by underscores; they use mixed-case/base64/hex
// charsets with no natural word boundaries. Requires >=1 underscore so contiguous
// all-caps IDs like AKIA... (no separator) are unaffected — found running Cejel on
// site-machine's .env.example (goal_cejel_calibration_findings_precision_2026-07-06).
const ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

export function isPlaceholderSecretValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    PLACEHOLDER_SECRET_PATTERN.test(normalized) ||
    normalized.includes('your-') ||
    normalized.includes('example') ||
    ALL_CAPS_SNAKE_PLACEHOLDER_PATTERN.test(value.trim()) ||
    isSyntheticFixtureSecretValue(normalized) ||
    isFillerRunSecretValue(normalized)
  );
}

// A doc placeholder often looks like a real token — a plausible prefix followed
// by a long run of a single filler character (e.g. `qd_agent_xxxxxxxx…`,
// `sk-xxxxxxxx`, `ghp_0000…`). PLACEHOLDER_SECRET_PATTERN only catches values that
// are ENTIRELY filler (`^x{3,}$`), so a prefixed filler-run slips through and gets
// scored as a committed secret (found 2026-06-30 running Witan on the QuantDinger
// competitor repo). This recognizes an entropy-free body: after optionally stripping
// a prefix that ends in a separator, the remainder is dominated by one repeated
// character with at most two distinct characters. A genuine high-entropy secret has
// many distinct characters and is never matched.
function isFillerRunSecretValue(value: string): boolean {
  const candidates = [value];
  const sepIdx = Math.max(value.lastIndexOf('_'), value.lastIndexOf('-'));
  if (sepIdx > 0 && sepIdx < value.length - 1) {
    candidates.push(value.slice(sepIdx + 1));
  }
  for (const body of candidates) {
    if (body.length < 8) continue;
    const counts = new Map<string, number>();
    for (const ch of body) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const distinct = counts.size;
    const maxRun = Math.max(...counts.values());
    if (distinct <= 2 && maxRun / body.length >= 0.8) return true;
  }
  return false;
}

function isSyntheticFixtureSecretValue(value: string): boolean {
  return (
    value.includes('abcdefghijklmnopqrstuvwxyz') ||
    value.includes('0123456789abcdefghijklmnopqrstuvwxyz') ||
    value.includes('abcdefghijklmnopqrstuvwxyz0123456789') ||
    value.includes('abcdefghijklmnopqrst')
  );
}

function hasSuspiciousDependencies(
  repoPath: string,
  manifest: string,
  useV47Detectors = false,
): boolean {
  if (!manifest.endsWith('package.json')) return false;
  const fullPath = join(repoPath, manifest);
  if (!isRegularFile(fullPath)) return false;
  // A malformed/BOM'd package.json must skip this check, never abort the scan.
  const parsed = parseJsonObject(readRepoText(fullPath, 'utf8'));
  if (!parsed) return false;
  const dependencies = isRecord(parsed.dependencies) ? parsed.dependencies : {};
  const devDependencies = isRecord(parsed.devDependencies) ? parsed.devDependencies : {};
  const names = [...Object.keys(dependencies), ...Object.keys(devDependencies)];
  if (
    names.some((name) =>
      /^(todo|fake|placeholder|example)-|does-not-exist| hallucinated/i.test(name),
    )
  ) {
    return true;
  }
  if (!useV47Detectors || typeof parsed.name !== 'string') return false;
  const placeholderIdentity = /^(?:example|sample|placeholder|todo|fake)(?:-|$)/i.test(parsed.name);
  const placeholderMetadata =
    (typeof parsed.author === 'string' &&
      /^(?:your name|example|placeholder)$/i.test(parsed.author)) ||
    (typeof parsed.description === 'string' &&
      /^(?:package description|example|placeholder|todo)$/i.test(parsed.description));
  return placeholderIdentity && placeholderMetadata;
}

interface GitCommitSummary {
  sha: string;
  subject: string;
}

function readRecentCommits(repoPath: string): GitCommitSummary[] {
  const historyResult = execGit(
    ['log', '--no-show-signature', '--max-count=12', '--format=%H%x00%s'],
    {
      cwd: repoPath,
    },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return [];
    throw new Error(describeGitFailure(historyResult.reason, 'recent history scan'));
  }
  const output = historyResult.stdout.trim();
  if (!output) return [];
  return output
    .split('\n')
    .map((line) => {
      const [sha = '', subject = ''] = line.split('\0');
      return { sha, subject };
    })
    .filter((commit) => commit.sha.length >= 7);
}

function readPackageScripts(packageJsonPath: string): Map<string, string> {
  if (!isRegularFile(packageJsonPath)) return new Map();
  // A malformed/BOM'd package.json must skip this check, never abort the scan.
  const parsed = parseJsonObject(readRepoText(packageJsonPath, 'utf8'));
  const scripts = parsed?.scripts;
  if (!isRecord(scripts)) return new Map();
  return new Map(
    Object.entries(scripts).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function evidenceForRelative(
  repoPath: string,
  path: string,
  kind: WitanEvidencePointer['kind'],
  label: string,
): WitanEvidencePointer {
  const fullPath = join(repoPath, path);
  const contents = isRegularFile(fullPath) ? readRepoText(fullPath, 'utf8') : '';
  return {
    kind,
    label,
    path,
    ...(contents
      ? {
          line: firstMeaningfulLine(contents),
          contentHash: createHash('sha256').update(contents).digest('hex'),
        }
      : {}),
  };
}

// Evidence for a finding anchored to a SPECIFIC in-file match (not mere file presence): line is
// the real 1-based line the caller already measured, or explicit null when no real position was
// found — never firstMeaningfulLine's "first non-blank line of the file" fallback, which is a
// fabricated position for a match-anchored finding (D4 — cejel reported `line: 1` for its own
// test fixture this way; see goal_cejel_a2_one_notion_of_production_code_2026-07-13).
export function evidenceForRelativeAtLine(
  repoPath: string,
  path: string,
  kind: WitanEvidencePointer['kind'],
  label: string,
  line: number | null,
): WitanEvidencePointer {
  const fullPath = join(repoPath, path);
  const contents = isRegularFile(fullPath) ? readRepoText(fullPath, 'utf8') : '';
  return {
    kind,
    label,
    path,
    line,
    ...(contents ? { contentHash: createHash('sha256').update(contents).digest('hex') } : {}),
  };
}

function metric(
  name: string,
  label: string,
  value: number,
  max: number,
  weight: number,
  unit: string,
  description: string,
  kind?: 'ratio' | 'saturating_count',
): WitanCriterionMetric {
  return {
    name,
    label,
    value: Math.max(0, value),
    max,
    ...(kind ? { kind } : {}),
    weight,
    unit,
    description,
  };
}

function firstMeaningfulLine(contents: string): number {
  const lines = contents.split('\n');
  const index = lines.findIndex((line) => line.trim().length > 0);
  return index === -1 ? 1 : index + 1;
}

function readGitHead(repoPath: string): string | null {
  const headResult = execGit(['rev-parse', 'HEAD'], { cwd: repoPath });
  if (!headResult.ok) {
    if (isExpectedGitAbsence(headResult)) return null;
    throw new Error(describeGitFailure(headResult.reason, 'HEAD resolution'));
  }
  return headResult.stdout.trim() || null;
}

// True if any .env* file has ever been added/modified in git history (including deleted files).
// A once-committed .env file is a ratable secrets surface even after deletion.
function hasEnvPathInGitHistory(repoPath: string, scanLimitations: Set<string>): boolean {
  const historyResult = execGit(
    ['log', '--no-show-signature', 'HEAD', '--diff-filter=AM', '--name-only', '-z', '--format='],
    { cwd: repoPath },
  );
  if (!historyResult.ok) {
    if (isExpectedGitAbsence(historyResult)) return false;
    declareHistoryFailure(scanLimitations, historyResult.reason, 'environment-file history scan');
    return false;
  }
  const output = historyResult.stdout;
  if (!output) return false;
  return output.split('\0').some((rawPath) => {
    const path = rawPath.startsWith('\n') ? rawPath.slice(1) : rawPath;
    if (/[\u0000-\u001f\u007f]/.test(path)) {
      scanLimitations.add(CONTROL_CHARACTER_HISTORY_PATH_LIMITATION);
      return false;
    }
    return /(?:^|\/)\.env(?:\.|$)/i.test(path);
  });
}
