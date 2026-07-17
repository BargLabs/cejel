// A Node SEA bundle is CommonJS, so index.ts's import.meta.url entry-point check cannot dispatch
// it. The binary is always an entry point and must call the public CLI unconditionally; otherwise
// a plausible-looking executable exits zero without producing a certificate.
import { runWitanFreeCli } from './index.js';

runWitanFreeCli(process.argv.slice(2))
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Cejel CLI error.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
