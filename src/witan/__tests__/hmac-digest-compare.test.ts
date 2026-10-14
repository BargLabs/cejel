import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWitanInputFromRepo } from '../repo-signals.js';
import { WITAN_RUBRIC_VERSION_V17, WITAN_SELECTABLE_RUBRIC_VERSIONS } from '../rubric-version.js';

// A2 insecure-compare: a value named `digest` is secret when the same file computes it with a
// keyed HMAC, not because of its name (goal_cejel_v26_hmac_digest_compare_2026-10-14). #430
// removed the bare `digest` name from the line pattern; this restores the HMAC case by computation.
// A recognition fix under every selectable rubric. Fixtures are synthetic.

const roots: string[] = [];
function timingFinding(files: Record<string, string>, rubricVersion: string = WITAN_RUBRIC_VERSION_V17) {
  const root = mkdtempSync(join(tmpdir(), 'cejel-hmac-digest-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  const signals = buildWitanInputFromRepo({
    repoPath: root,
    productSlug: 'hmac-digest',
    productDisplayName: 'hmac-digest',
    generatedAt: '2026-09-15T00:00:00.000Z',
    rubricVersion,
  }).signals ?? [];
  return signals
    .find(c => c.criterionId === 'A2')
    ?.findings?.find(f => f.summary.includes('timing side-channel'));
}
/** The flagged line, or null when the A2 timing finding is absent. */
const flaggedLine = (files: Record<string, string>, rubricVersion?: string) =>
  timingFinding(files, rubricVersion)?.evidence?.line ?? null;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const NODE_DIRECT =
  "import { createHmac } from 'node:crypto';\n\nexport function verify(body, sig, key) {\n  const digest = createHmac('sha256', key).update(body).digest('hex');\n  if (digest === sig) return true;\n  return false;\n}\n";

describe('a digest bound to a keyed HMAC computation in the same file is flagged', () => {
  it('Node: createHmac(...).update(...).digest(...) compared with ===', () => {
    expect(flaggedLine({ 'src/webhook.js': NODE_DIRECT })).toBe(5);
  });

  it('Node: a chain split across lines', () => {
    expect(flaggedLine({
      'src/webhook.ts': "import { createHmac } from 'node:crypto';\n\nexport function verify(body: string, sig: string, key: string) {\n  const expectedDigest: string = createHmac('sha256', key)\n    .update(body)\n    .digest('hex');\n  return expectedDigest !== sig;\n}\n",
    })).toBe(7);
  });

  it('Node: through one intermediate HMAC object', () => {
    expect(flaggedLine({
      'src/webhook.js': "const crypto = require('node:crypto');\n\nfunction verify(body, sig, key) {\n  const h = crypto.createHmac('sha256', key);\n  h.update(body);\n  const digest = h.digest('hex');\n  return digest === sig;\n}\n",
    })).toBe(7);
  });

  it("Web Crypto: subtle.sign('HMAC', ...) through one intermediate value", () => {
    expect(flaggedLine({
      'src/verify.ts': "export async function verify(key: CryptoKey, data: Uint8Array, sig: string) {\n  const signed = await crypto.subtle.sign('HMAC', key, data);\n  const digest = Buffer.from(signed).toString('hex');\n  return digest === sig;\n}\n",
    })).toBe(4);
  });

  it("Web Crypto: subtle.sign({ name: 'HMAC' }, ...) directly", () => {
    expect(flaggedLine({
      'src/verify.ts': "export async function verify(key: CryptoKey, data: Uint8Array, sig: string) {\n  const digest = Buffer.from(await crypto.subtle.sign({ name: 'HMAC' }, key, data)).toString('base64');\n  if (digest !== sig) throw new Error('bad signature');\n}\n",
    })).toBe(3);
  });

  it('Python: hmac.new(...).hexdigest() compared with ==', () => {
    expect(flaggedLine({
      'src/webhook.py': 'import hashlib\nimport hmac\n\n\ndef verify(key, body, signature):\n    digest = hmac.new(key, body, hashlib.sha256).hexdigest()\n    if digest == signature:\n        return True\n    return False\n',
    })).toBe(7);
  });

  it('Python: through one intermediate hmac object, and the one-shot hmac.digest', () => {
    expect(flaggedLine({
      'src/webhook.py': "import hmac\n\n\ndef verify(key, body, signature):\n    h = hmac.new(key, digestmod='sha256')\n    h.update(body)\n    digest = h.digest()\n    return digest != signature\n",
    })).toBe(8);
    expect(flaggedLine({
      'src/webhook.py': "import hmac\n\n\ndef verify(key, body, signature):\n    digest = hmac.digest(key, body, 'sha256')\n    return digest == signature\n",
    })).toBe(6);
  });

  it('Go: hmac.New then .Sum( through one intermediate', () => {
    expect(flaggedLine({
      'src/webhook/verify.go': 'package webhook\n\nimport (\n\t"crypto/hmac"\n\t"crypto/sha256"\n\t"encoding/hex"\n)\n\nfunc Verify(key, body []byte, signature string) bool {\n\tmac := hmac.New(sha256.New, key)\n\tmac.Write(body)\n\tdigest := hex.EncodeToString(mac.Sum(nil))\n\treturn digest == signature\n}\n',
    })).toBe(13);
  });

  it('Ruby: OpenSSL::HMAC.hexdigest, and a digest read from an OpenSSL::HMAC instance', () => {
    expect(flaggedLine({
      'lib/webhook.rb': "require 'openssl'\n\ndef verify(key, body, signature)\n  digest = OpenSSL::HMAC.hexdigest('SHA256', key, body)\n  digest == signature\nend\n",
    })).toBe(5);
    expect(flaggedLine({
      'lib/webhook.rb': "require 'openssl'\n\ndef verify(key, body, signature)\n  hmac = OpenSSL::HMAC.new(key, 'SHA256')\n  hmac << body\n  digest = hmac.hexdigest\n  digest == signature\nend\n",
    })).toBe(7);
  });

  it.each([...WITAN_SELECTABLE_RUBRIC_VERSIONS])('%s flags the Node fixture', rubricVersion => {
    expect(flaggedLine({ 'src/webhook.js': NODE_DIRECT }, rubricVersion)).toBe(5);
  });
});

describe('the binding: only the identifier the keyed HMAC is assigned to', () => {
  it('an HMAC computed into mac beside an unrelated contentDigest === etag is not flagged', () => {
    expect(flaggedLine({
      'src/cache.js': "import { createHmac } from 'node:crypto';\n\nexport const sign = (key, body) => {\n  const mac = createHmac('sha256', key).update(body).digest('hex');\n  return mac;\n};\nexport const fresh = (contentDigest, etag) => contentDigest === etag;\n",
    })).toBeNull();
  });

  it('an HMAC computed into digest beside an unrelated fileDigest === etag is not flagged', () => {
    expect(flaggedLine({
      'src/cache.py': "import hmac\n\n\ndef sign(key, body):\n    digest = hmac.new(key, body, 'sha256').hexdigest()\n    return digest\n\n\ndef fresh(file_digest, etag):\n    return file_digest == etag\n",
    })).toBeNull();
  });

  it('a property of the same name is not the bound variable', () => {
    expect(flaggedLine({
      'src/cache.js': "import { createHmac } from 'node:crypto';\n\nexport const find = (rows, key, body) => {\n  const digest = createHmac('sha256', key).update(body).digest('hex');\n  return rows.find(row => row.digest === etagOf(digest));\n};\n",
    })).toBeNull();
  });

  it('the bound is one intermediate: a second hop is not followed', () => {
    expect(flaggedLine({
      'src/webhook.js': "import { createHmac } from 'node:crypto';\n\nexport function verify(body, sig, key) {\n  const h = createHmac('sha256', key);\n  h.update(body);\n  const raw = h.digest();\n  const digest = raw.toString('hex');\n  return digest === sig;\n}\n",
    })).toBeNull();
  });

  it('presence and numeric checks on a bound digest are not flagged', () => {
    expect(flaggedLine({
      'src/webhook.js': "import { createHmac } from 'node:crypto';\n\nexport function verify(body, sig, key) {\n  const digest = createHmac('sha256', key).update(body).digest('hex');\n  return digest !== undefined && digest !== null && digest !== '' && digest === sig.length;\n}\n",
    })).toBeNull();
  });

  it('a Ruby OpenSSL::HMAC instance compared with == is not flagged (HMAC#== is constant-time)', () => {
    expect(flaggedLine({
      'lib/webhook.rb': "require 'openssl'\n\ndef verify(key, body, other)\n  digest = OpenSSL::HMAC.new(key, 'SHA256')\n  digest << body\n  digest == other\nend\n",
    })).toBeNull();
  });
});

describe('keyed HMAC versus a plain hash', () => {
  it.each([
    ['Node createHash', 'src/hash.js', "import { createHash } from 'node:crypto';\n\nexport const verify = (body, expected) => {\n  const digest = createHash('sha256').update(body).digest('hex');\n  return digest === expected;\n};\n"],
    ['Python hashlib', 'src/hash.py', 'import hashlib\n\n\ndef verify(body, expected):\n    digest = hashlib.sha256(body).hexdigest()\n    return digest == expected\n'],
    ['Ruby Digest', 'lib/hash.rb', "require 'digest'\n\ndef verify(body, expected)\n  digest = Digest::SHA256.hexdigest(body)\n  digest == expected\nend\n"],
  ])('%s: a plain hash with no key is not flagged', (_name, file, source) => {
    expect(flaggedLine({ [file]: source })).toBeNull();
  });

  it('Go sha256.Sum256: a plain hash with no key is not flagged', () => {
    expect(flaggedLine({
      'src/hash/verify.go': 'package hash\n\nimport (\n\t"crypto/sha256"\n\t"encoding/hex"\n)\n\nfunc Verify(body []byte, expected string) bool {\n\tsum := sha256.Sum256(body)\n\tdigest := hex.EncodeToString(sum[:])\n\treturn digest == expected\n}\n',
    })).toBeNull();
  });
});

describe('comments and strings', () => {
  it.each([
    ['a // comment', "  // if (digest === sig) return true;\n"],
    ['a block comment', "  /* if (digest === sig) return true; */\n"],
    ['a string', "  const doc = 'if (digest === sig) return true';\n"],
    ['a template literal', "  const doc = `if (digest === sig) return true`;\n"],
  ])('Node: the comparison only inside %s is not flagged', (_name, line) => {
    expect(flaggedLine({
      'src/webhook.js': `import { createHmac, timingSafeEqual } from 'node:crypto';\n\nexport function verify(body, sig, key) {\n  const digest = createHmac('sha256', key).update(body).digest('hex');\n${line}  return timingSafeEqual(Buffer.from(digest), Buffer.from(sig));\n}\n`,
    })).toBeNull();
  });

  it('Node: the HMAC computation only inside a comment or a string does not bind', () => {
    expect(flaggedLine({
      'src/webhook.js': "// const digest = createHmac('sha256', key).update(body).digest('hex');\nexport const verify = (digest, sig) => digest === sig;\n",
    })).toBeNull();
    expect(flaggedLine({
      'src/webhook.js': "const digest = \"createHmac('sha256', key).update(body).digest('hex')\";\nexport const verify = (sig) => digest === sig;\n",
    })).toBeNull();
  });

  it('Python: the comparison only inside a # comment or a docstring is not flagged', () => {
    expect(flaggedLine({
      'src/webhook.py': "import hmac\n\n\ndef verify(key, body, signature):\n    '''Never write: digest == signature'''\n    digest = hmac.new(key, body, 'sha256').hexdigest()\n    # if digest == signature: return True\n    return hmac.compare_digest(digest, signature)\n",
    })).toBeNull();
  });

  it('Ruby: the comparison only inside a # comment is not flagged', () => {
    expect(flaggedLine({
      'lib/webhook.rb': "require 'openssl'\n\ndef verify(key, body, signature)\n  digest = OpenSSL::HMAC.hexdigest('SHA256', key, body)\n  # digest == signature\n  OpenSSL.secure_compare(digest, signature)\nend\n",
    })).toBeNull();
  });
});
