// Deprecated subpath (#419). D-series detection was retired on 2026-08-02 (CLAUDE.md): the rules are
// a taxonomy, not a production detector, and a zero-result scan never means a repository is clean.
// `@cejel/cejel/d-series` is deprecated in 0.6.2 and removed in 0.7.0; the source stays in this
// repository. The package ships no type declarations, so Node's DeprecationWarning is the notice.
process.emitWarning(
  '@cejel/cejel/d-series is deprecated and will be removed in 0.7.0. D-series detection was retired: ' +
    'its rules are a taxonomy, not a production detector, and a zero-result scan does not mean a ' +
    'repository is clean. See https://github.com/BargLabs/cejel/issues/419.',
  { type: 'DeprecationWarning', code: 'CEJEL_DEP_D_SERIES' },
);

export { D_SERIES_RULE_TIERS } from './tiers.js';
export {
  detectDeclaredButUnreadConfig,
  scanDeclaredButUnreadConfig,
  type D1DeclarationKind,
  type D1Finding,
} from './declared-but-unread-config.js';
export {
  detectSelfReferentialVerification,
  scanSelfReferentialVerification,
  type D5AssertionKind,
  type D5Finding,
} from './self-referential-verification.js';
export {
  detectSwallowedErrors,
  scanSwallowedErrors,
  type D2Finding,
} from './swallowed-error.js';
export {
  detectUnassertedSetTransforms,
  scanUnassertedSetTransforms,
  type D3Finding,
} from './unasserted-set-transform.js';
export {
  detectEmptyFailureConflation,
  scanEmptyFailureConflation,
  type D4Finding,
} from './empty-failure-conflation.js';
export {
  detectUnobservedControls,
  inspectUnobservedControls,
  scanUnobservedControls,
  type D6Abstention,
  type D6AbstentionKind,
  type D6FileAssessment,
  type D6FileStatus,
  type D6Finding,
  type D6Inspection,
  type D6Mechanism,
} from './unobserved-control.js';
