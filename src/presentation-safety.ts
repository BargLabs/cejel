const PRESENTATION_CONTROL_PATTERN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

export interface PresentationLineOptions {
  fallback: string;
  maxLength: number;
}

/** Normalize untrusted presentation text to one control-free, schema-bounded line. */
export function sanitizePresentationLine(
  value: string,
  options: PresentationLineOptions,
): string {
  const withoutControls = value.replace(PRESENTATION_CONTROL_PATTERN, '').trim();
  const safeValue = withoutControls.length > 0 ? withoutControls : options.fallback;
  if (safeValue.length <= options.maxLength) return safeValue;

  const ellipsis = '.'.repeat(Math.min(3, options.maxLength));
  const contentLimit = Math.max(options.maxLength - ellipsis.length, 0);
  let prefix = '';
  for (const character of safeValue) {
    if (prefix.length + character.length > contentLimit) break;
    prefix += character;
  }
  return `${prefix}${ellipsis}`;
}

/** Escape dynamic text used as an inline value in generated Markdown. */
export function escapeMarkdownInline(value: string): string {
  return value.replace(/([\\`*_[\]<>|#])/g, '\\$1');
}
