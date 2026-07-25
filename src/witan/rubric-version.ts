// The Quant evidence-contract v1 freeze byte-pins the shared generic schema barrel, so the
// v9 named constant cannot be added to that barrel without invalidating an unrelated frozen
// commercial artifact. Keep the historical identifier local to the free-core implementation;
// unlike the mutable WITAN_RUBRIC_VERSION alias, this remains stable when v10 becomes current.
export const WITAN_RUBRIC_VERSION_V9 = 'witan-rubric-v9-2026-07-22';

// V10 remains explicit as a historical/prospective identifier; the mutable public default is
// promoted independently only after an authenticated untouched holdout clears every gate.
export const WITAN_RUBRIC_VERSION_V10 = 'witan-rubric-v10-2026-07-23';

// Prospective free-core v39 rubric. The public default was unchanged until an authenticated
// untouched holdout cleared every preregistered gate.
export const WITAN_RUBRIC_VERSION_V11 = 'witan-rubric-v11-2026-07-23';

// Prospective free-core v41 rubric. V12 inherits v11 detector/scoring behavior and adds only
// failure-derived review-control integrity changes.
export const WITAN_RUBRIC_VERSION_V12 = 'witan-rubric-v12-2026-07-23';

// Prospective free-core v43 rubric. V13 inherits v12 finding and criterion behavior, then adds
// only the failure-derived source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V13 = 'witan-rubric-v13-2026-07-23';

// Prospective free-core v45 rubric. V14 inherits v13 detector/scoring behavior and adds only
// the failure-derived semantic/path-role source-representativeness closure.
export const WITAN_RUBRIC_VERSION_V14 = 'witan-rubric-v14-2026-07-23';

// Prospective free-core v47 rubric. V15 inherits v14 criterion and abstention behavior, then
// adds only the failure-derived finding-precision and control-evidence integrity closure.
export const WITAN_RUBRIC_VERSION_V15 = 'witan-rubric-v15-2026-07-24';

// Prospective free-core v48 rubric. V16 inherits the complete v15 detector and classifier
// closure, then adds only the failure-derived zero-measurement abstention.
export const WITAN_RUBRIC_VERSION_V16 = 'witan-rubric-v16-2026-07-24';

// Free-core v50 rubric. V17 inherits the complete v16 detector/scoring closure, then adds only
// the failure-derived reviewable-source proof, authenticated A1 absence measurement, and
// narrowly bounded post-signal structural rescue. It is the public default after the v50
// untouched holdout cleared every preregistered gate.
export const WITAN_RUBRIC_VERSION_V17 = 'witan-rubric-v17-2026-07-24';
