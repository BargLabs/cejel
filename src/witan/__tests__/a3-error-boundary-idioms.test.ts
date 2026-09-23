// goal_cejel_a3_error_boundary_idioms_2026-09-22.
//
// An independent evaluator ran 0.4.10 on five pinned revisions of his production system. Under
// the default rubric, A3's `prod_readiness_primitives` metric reported no error boundary on every
// revision, while the system has a real, registered Express global error handler. We do not have
// his code and this card does not guess at it — instead it catalogues the registered-idiom space
// the detector (repo-signals.ts, `errorBoundaries`/`expressErrorMiddlewareFile` around line 3111,
// patterns `EXPRESS_ERROR_MIDDLEWARE_PATTERN`/`EXPRESS_MIDDLEWARE_REACHABLE_PATTERN` around line
// 7641) could plausibly be missing, and widens on fixture evidence.
//
// Idiom/dead-stub table. "Before" is what the detector reported against these exact fixtures
// PRIOR to this card's changes (recorded by running the unwidened detector once, by hand, before
// touching repo-signals.ts — that run is the finding). "After" is the current, widened detector
// this file now asserts.
//
//   Row  Idiom                                                     Before   After   Change
//   1    inline `app.use((err,req,res,next)=>{})` in entrypoint    credit   credit  none (must still pass)
//   2    named handler, `app.use(errorHandler)` from another file  credit   credit  none (must still pass)
//   3    `const h: ErrorRequestHandler = (err,req,res,next)=>{}`   credit   credit  none (already covered)
//   4a   first param renamed `_err`                                miss    credit  widened (SHAPE pattern)
//   4b   fourth param renamed `_next`                               miss    credit  widened (SHAPE pattern)
//   4c   three params, `next` omitted entirely (arity-only)         miss    miss    STATED LIMIT (by design)
//   5    `function` keyword, registered on a `Router`               credit   credit  none (already covered)
//   6    factory-wrapped handler (`createErrorHandler(logger)`)     credit   credit  none (already covered)
//   7a   class method, `module.exports = ErrorService` (JS)         credit   credit  none (already covered)
//   7b   class method, `export class ErrorService` (TS)             miss    credit  widened (REACHABLE pattern)
//   8a   `src/middleware/errors.ts`                                  credit   credit  none (already admitted)
//   8b   `lib/http/error.middleware.js`                              credit   credit  none (already admitted)
//   8c   `server/plugins/errorHandler.mjs`                           miss    credit  widened (file-selection predicate)
//   D1   four-param stub, never registered, not exported             miss    miss    correct (dead stub)
//   D2   same stub inside a test file                                miss    miss    correct (dead stub)
//   D3   same stub inside a docs example                             miss    miss    correct (dead stub)
//   D4   commented-out `// app.use(errorHandler);` line              CREDIT  miss    BUG FIXED (see below)
//   9    URL literal + `.use(` on one line (review follow-up)         MISS    credit  BUG FIXED (see below)
//   D5   code, then trailing `// app.use(errorHandler);` comment       miss    miss    correct (dead stub)
//
// D4 was not a missing widening — it was a pre-existing false positive. `EXPRESS_MIDDLEWARE_
// REACHABLE_PATTERN` tested raw file text, so a commented-out `.use(` call satisfied it exactly
// as well as a real one, crediting the same dead, never-registered stub row D1 exists to exclude.
// Fixed by stripping `//` line comments before testing reachability
// (`fileMatchesOutsideLineComments`).
//
// Row 9 is a second, review-follow-up fix to that same D4 fix: the first version of
// `fileMatchesOutsideLineComments` stripped everything after ANY `//`, not just whole comment
// lines, so `const base = 'https://api.example'; app.use(handler);` lost its `.use(` call to the
// `//` inside the URL literal — a miss, not a false credit, but avoidable. Fixed by stripping
// `//` only when it is not directly preceded by `:` (a URL scheme separator). A first attempt
// stripped only whole `//` lines, which fixed row 9 but credited D5 — a trailing comment after code
// — trading a miss for a false credit; D5 pins that the fix must not do so.
//
// Row 4c is deliberately left uncredited: Express recognizes error middleware by parameter count
// alone, so matching a three-parameter `(err, req, res)` on names would make this an arity-adjacent
// match indistinguishable from ordinary middleware missing its fourth parameter by mistake — the
// exact boilerplate false positive the shape pattern's name requirement exists to prevent.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V23 } from '../rubric-version.js';
import type { WitanCriterionSignalPayload } from '../schemas.js';

function makeRepo(files: Readonly<Record<string, string>>): string {
  const repo = mkdtempSync(join(tmpdir(), 'cejel-a3-error-boundary-idioms-'));
  execFileSync('git', ['init', '--quiet'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: repo });
  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(repo, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, 'utf8');
    execFileSync('git', ['add', path], { cwd: repo });
  }
  return repo;
}

function scanA3(files: Readonly<Record<string, string>>): WitanCriterionSignalPayload | null {
  const input = buildWitanInputFromRepo({
    productSlug: 'a3-error-boundary-idioms-fixture',
    productDisplayName: 'A3 error boundary idioms fixture',
    repoPath: makeRepo(files),
    generatedAt: '2026-09-22T00:00:00.000Z',
    rubricVersion: WITAN_RUBRIC_VERSION_V23,
  });
  return (input.signals ?? []).find((candidate) => candidate.criterionId === 'A3') ?? null;
}

function primitivesValue(signal: WitanCriterionSignalPayload | null): number {
  return (
    signal?.metrics?.find((candidate) => candidate.name === 'prod_readiness_primitives')?.value ?? 0
  );
}

// A minimal Express service with no error boundary of any kind — the shared "before" fixture
// every idiom below is diffed against. Never itself credited (asserted first, as the control).
const SERVICE: Readonly<Record<string, string>> = {
  'src/server.js':
    "const express = require('express');\nconst app = express();\napp.listen(3000);\n",
  'package.json': JSON.stringify({ name: 'svc', version: '1.0.0', scripts: { build: 'tsc' } }),
};

function credited(files: Readonly<Record<string, string>>): boolean {
  return primitivesValue(scanA3(files)) === primitivesValue(scanA3(SERVICE)) + 1;
}

describe('A3 error boundary idiom catalogue — registered handlers that must be credited', () => {
  it('control: the bare service with no error boundary is not credited', () => {
    expect(credited(SERVICE)).toBe(false);
  });

  it('row 1: inline app.use((err, req, res, next) => {...}) in the entrypoint', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/server.js':
        "const express = require('express');\n" +
        'const app = express();\n' +
        'app.use((err, req, res, next) => {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '});\n' +
        'app.listen(3000);\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 2: named handler declared in one file, registered via app.use(errorHandler) in another', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n' +
        'module.exports = errorHandler;\n',
      'src/main.js':
        "const express = require('express');\n" +
        "const errorHandler = require('./errorHandler');\n" +
        'const app = express();\n' +
        'app.use(errorHandler);\n' +
        'app.listen(3000);\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 3 (TypeScript): handler typed with Express\'s ErrorRequestHandler instead of four typed parameters', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.ts':
        "import type { ErrorRequestHandler } from 'express';\n" +
        'export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '};\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 4a: first parameter renamed to _err', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(_err, req, res, next) {\n' +
        "  res.status(500).json({ message: 'internal error' });\n" +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 4b: fourth parameter renamed to _next', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res, _next) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 4c (STATED LIMIT): a three-parameter handler with next omitted entirely is not credited', () => {
    // Express recognizes error middleware by arity (four parameters), not by name alone. A
    // three-parameter (err, req, res) is exactly what ordinary middleware looks like if a
    // developer forgot the fourth parameter — matching it on names would be the arity-only
    // false positive the shape pattern's name requirement exists to prevent. Recorded here as a
    // deliberate non-widening, not a silent gap.
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(false);
  });

  it('row 5: function keyword handler registered on a Router', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        "const router = require('express').Router();\n" +
        'router.use(function (err, req, res, next) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '});\n' +
        'module.exports = router;\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 6: handler wrapped by a factory that returns the four-parameter function in another file', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandlerFactory.js':
        'function createErrorHandler(logger) {\n' +
        '  return function (err, req, res, next) {\n' +
        '    logger.error(err);\n' +
        '    res.status(500).json({ message: err.message });\n' +
        '  };\n' +
        '}\n' +
        'module.exports = createErrorHandler;\n',
      'src/main.js':
        "const express = require('express');\n" +
        "const createErrorHandler = require('./errorHandlerFactory');\n" +
        "const logger = require('./logger');\n" +
        'const app = express();\n' +
        'app.use(createErrorHandler(logger));\n' +
        'app.listen(3000);\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 7a (JavaScript): class-based handler, module.exports = ErrorService, registered via .bind(this)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorService.js':
        'class ErrorService {\n' +
        '  handleError(err, req, res, next) {\n' +
        '    res.status(500).json({ message: err.message });\n' +
        '  }\n' +
        '}\n' +
        'module.exports = ErrorService;\n',
      'src/main.js':
        "const express = require('express');\n" +
        "const ErrorService = require('./errorService');\n" +
        'const app = express();\n' +
        'const svc = new ErrorService();\n' +
        'app.use(svc.handleError.bind(svc));\n' +
        'app.listen(3000);\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 7b (TypeScript): class-based handler, export class ErrorService, registered via .bind(this)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorService.ts':
        'export class ErrorService {\n' +
        '  handleError(err: Error, req: Request, res: Response, next: NextFunction) {\n' +
        '    res.status(500).json({ message: err.message });\n' +
        '  }\n' +
        '}\n',
      'src/main.ts':
        "import { ErrorService } from './errorService';\n" +
        'const svc = new ErrorService();\n' +
        'app.use(svc.handleError.bind(svc));\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 8a: handler under src/middleware/errors.ts (already admitted by the file-selection predicate)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/middleware/errors.ts':
        'export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 8b: handler under lib/http/error.middleware.js (already admitted by the file-selection predicate)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'lib/http/error.middleware.js':
        'function errorHandler(err, req, res, next) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 8c: handler under server/plugins/errorHandler.mjs (widened: server/ + .mjs were both excluded)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'server/plugins/errorHandler.mjs':
        'export function errorHandler(err, req, res, next) {\n' +
        '  res.status(500).json({ message: err.message });\n' +
        '}\n',
    };
    expect(credited(files)).toBe(true);
  });

  it('row 9: a URL string literal earlier on the same line as app.use(...) still credits (mid-line // must not be treated as a comment)', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        "const base = 'https://api.example'; app.use(errorHandler);\n",
    };
    expect(credited(files)).toBe(true);
  });
});

describe('A3 error boundary dead-stub shapes — must remain uncredited', () => {
  it('D1: a four-parameter function declared and never registered, not exported', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/scratch.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n',
    };
    expect(credited(files)).toBe(false);
  });

  it('D2: the same dead stub inside a test file', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/__tests__/errorHandler.test.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(false);
  });

  it('D3: the same dead stub inside a docs example', () => {
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'docs/examples/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        'module.exports = errorHandler;\n',
    };
    expect(credited(files)).toBe(false);
  });

  it('D4 (BUG FIXED): a commented-out app.use(...) line does not make an unregistered stub reachable', () => {
    // Before this card: EXPRESS_MIDDLEWARE_REACHABLE_PATTERN tested raw file text, so the
    // commented-out call below satisfied `.use(` exactly as well as a real, executing one,
    // wrongly crediting the same dead stub row D1 exists to exclude. Fixed by stripping `//`
    // line comments before testing reachability.
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        '// app.use(errorHandler);\n',
    };
    expect(credited(files)).toBe(false);
  });

  it('D5: a trailing // app.use(...) comment after code does not make a dead stub reachable', () => {
    // Pins the review follow-up to D4: stripping only whole `//` lines would keep this trailing
    // comment as code and credit the dead stub.
    const files: Readonly<Record<string, string>> = {
      ...SERVICE,
      'src/errorHandler.js':
        'function errorHandler(err, req, res, next) {\n' +
        "  res.status(500).json({ message: err.message });\n" +
        '}\n' +
        "const unused = true; // app.use(errorHandler); -- disabled until v2\n",
    };
    expect(credited(files)).toBe(false);
  });
});
