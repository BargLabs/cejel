'use strict';

const {
  SURFACE_DESCRIPTORS,
  isAllowedGitExecFileSyncCall,
} = require('./no-egress-policy.cjs');

const deny = (surface) => {
  throw new Error(`Cejel calibration no-egress policy denied ${surface}`);
};

for (const descriptor of SURFACE_DESCRIPTORS) {
  if (descriptor.id === 'child_process.execFileSync') {
    const original = descriptor.target[descriptor.method];
    descriptor.target[descriptor.method] = function guardedExecFileSync(file, args, options) {
      if (isAllowedGitExecFileSyncCall(file, args, options)) {
        return Reflect.apply(original, this, [file, args, options]);
      }
      return deny(descriptor.id);
    };
  } else {
    descriptor.target[descriptor.method] = () => deny(descriptor.id);
  }
}
