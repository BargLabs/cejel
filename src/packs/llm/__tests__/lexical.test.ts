import { describe, expect, it } from 'vitest';

import { maskJavaScriptNonCode } from '../lexical.js';

describe('JavaScript lexical masking', () => {
  it('masks regex literals without swallowing following code', () => {
    const source = [
      'const escaped = value.replace(/"/g, String.raw`\\\\"`);',
      'api.registerTool({});',
      'const characterClass = /[/"\\\\]]+/giu;',
      'mutate();',
    ].join('\n');
    const masked = maskJavaScriptNonCode(source);

    expect(masked).not.toContain('/"/g');
    expect(masked).not.toContain('/[/"\\\\]]+/giu');
    expect(masked).toContain('api.registerTool({});');
    expect(masked).toContain('mutate();');
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
    expect(masked).toHaveLength(source.length);
  });

  it('preserves division expressions as code', () => {
    const source = 'const ratio = total / count / 2;\nexecute(ratio);';
    const masked = maskJavaScriptNonCode(source);

    expect(masked).toContain('total / count / 2');
    expect(masked).toContain('execute(ratio)');
  });

  it('keeps regex-looking text in strings and comments masked', () => {
    const source = [
      'const text = "not /a regex/ here";',
      '// /commented/.test(value)',
      '/* const fake = /also-fake/g; */',
      'const live = /real/.test(value);',
    ].join('\n');
    const masked = maskJavaScriptNonCode(source);

    expect(masked).not.toContain('not /a regex/ here');
    expect(masked).not.toContain('/commented/');
    expect(masked).not.toContain('/also-fake/g');
    expect(masked).not.toContain('/real/');
    expect(masked).toContain('const live =       .test(value);');
  });
});
