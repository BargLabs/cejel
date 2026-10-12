import { delimiter, resolve } from 'node:path';

/**
 * #436: inside a checkout of this package, `npx @cejel/cejel@X` can run a different cejel than
 * the one asked for. npm compares the spec with the checkout's own package.json, finds it
 * satisfied, installs nothing, and runs the bin by name; the checkout's own bin is never linked
 * into node_modules/.bin, so the name falls through to PATH. A stale `cejel` on PATH then writes
 * its certificate. The certificate records the version that ran, so nothing is misattributed,
 * but the user asked for one version and silently got another.
 *
 * npm does not pass a positional spec (`npx <pkg>@<version>`) to the bin. Read against npm's
 * libnpmexec and @npmcli/run-script sources, and observed with npm 11.19.0, the bin sees:
 *
 * - `npm_lifecycle_event=npx` on every npx run.
 * - `npm_config_package`: the exact `-p/--package` spec(s), joined by a blank line. Unset for
 *   the positional form.
 * - `npm_package_name`/`npm_package_version`: the project at the working directory, not the
 *   package that runs. In a 0.6.3 checkout, `npx @cejel/cejel@0.6.2` installs and runs 0.6.2
 *   while these still say 0.6.3, so on their own they are not the requested version.
 * - PATH: npm puts any bin directory it installed or chose first (the npx cache, or the global
 *   bin), then `<cwd>/node_modules/.bin`. The first entry is `<cwd>/node_modules/.bin` only when
 *   npx resolved the request to the local tree and installed nothing.
 *
 * So the requested version is known in two cases, and only these:
 * 1. An exact `-p @cejel/cejel@<version>` spec.
 * 2. The working directory's project is this package and npx installed nothing: npx accepted
 *    the checkout's version as satisfying the request. For a pinned `npx <pkg>@<version>` that
 *    is exactly the version asked for; for a range or a bare name it is the version npx chose.
 * Anywhere else the request is unknown and this stays silent; it never guesses.
 */
export interface NpxVersionContext {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly cwd: string;
  readonly packageName: string;
  readonly runningVersion: string;
  readonly runningPath: string;
}

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** One stderr line when npx was asked for a known version that is not the one running. */
export function npxVersionMismatchWarning(context: NpxVersionContext): string | undefined {
  const { env, packageName, runningVersion, runningPath } = context;
  if (env.npm_lifecycle_event !== 'npx') return undefined;

  const pinned = exactPackageSpecVersion(env.npm_config_package, packageName);
  if (pinned !== undefined) {
    if (pinned === runningVersion) return undefined;
    return (
      `warning: npx was asked for ${packageName}@${pinned}, but cejel ${runningVersion} is running ` +
      `from ${runningPath}. Inside a ${packageName} checkout, npx can run the cejel on PATH; ` +
      `run it from another directory (#436).`
    );
  }

  const requested = env.npm_package_version;
  if (env.npm_package_name !== packageName || !requested) return undefined;
  if (!resolvedToLocalTree(env, context.cwd)) return undefined;
  if (requested === runningVersion) return undefined;
  const checkout = env.npm_config_local_prefix || context.cwd;
  return (
    `warning: npx resolved ${packageName} to the ${requested} checkout at ${checkout} and ran the ` +
    `cejel on PATH instead: cejel ${runningVersion} from ${runningPath}. Run npx from another ` +
    `directory to get the version you asked for (#436).`
  );
}

function exactPackageSpecVersion(
  packageSpecs: string | undefined,
  packageName: string,
): string | undefined {
  if (!packageSpecs) return undefined;
  const prefix = `${packageName}@`;
  for (const spec of packageSpecs.split(/\n+/)) {
    const trimmed = spec.trim();
    if (!trimmed.startsWith(prefix)) continue;
    const version = trimmed.slice(prefix.length);
    if (EXACT_VERSION_PATTERN.test(version)) return version;
  }
  return undefined;
}

function resolvedToLocalTree(
  env: Readonly<Record<string, string | undefined>>,
  cwd: string,
): boolean {
  // Windows spells the variable Path; npm rewrites every case-insensitive match the same way.
  const pathKey = Object.keys(env).find((key) => /^path$/i.test(key) && env[key]);
  const first = pathKey ? env[pathKey]?.split(delimiter)[0] : undefined;
  return first !== undefined && first === resolve(cwd, 'node_modules', '.bin');
}
