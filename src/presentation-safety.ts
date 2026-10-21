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

/**
 * Removes C0 controls, DEL and C1 controls (U+0080-U+009F) from a repository- or ingest-derived
 * string before it reaches the terminal; a newline or tab inside the field becomes a space. The
 * visible text around a removed control is kept. Cejel's own text needs none of this; a field that
 * mixes it with repository paths ("What was not established", metric values) passes through whole.
 */
export function stripTerminalControls(text: string): string {
  return text.replace(/[\t\n]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}
