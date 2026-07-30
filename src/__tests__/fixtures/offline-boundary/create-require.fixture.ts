import { createRequire } from 'node:module';

const localRequire = createRequire(import.meta.url);
const builtin = ['node', 'https'].join(':');

export const outboundModule = localRequire(builtin);
