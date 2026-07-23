'use strict';

const fixedIso = process.env.CEJEL_PARITY_FIXED_TIME;
if (!fixedIso || Number.isNaN(Date.parse(fixedIso))) {
  throw new Error('CEJEL_PARITY_FIXED_TIME must be a valid ISO-8601 timestamp');
}

const RealDate = Date;
const fixedEpoch = RealDate.parse(fixedIso);

class FixedDate extends RealDate {
  constructor(...args) {
    super(args.length === 0 ? fixedEpoch : args[0]);
  }

  static now() {
    return fixedEpoch;
  }
}

global.Date = FixedDate;
