// Shared by the first-page tests (goal_cejel_four_question_summary_2026-11-02). Deliberately not
// imported from src/plain-summary.ts: the test keeps its own copy of the card's word list, so a
// change to the module's guard cannot quietly loosen what the test checks.

export const FIRST_PAGE_START = '<!-- cejel:first-page -->';
export const FIRST_PAGE_END = '<!-- /cejel:first-page -->';

/** The words item C of the card keeps off the first page: engine vocabulary and assurance words. */
export const FIRST_PAGE_BANNED_WORDS: readonly RegExp[] = [
  /\brubrics?\b/i,
  /\bpin(?:s|ned|ning)?\b/i,
  /\b(?:A[1-5]|B[1-6])\b/,
  /\battestations?\b/i,
  /\bcomposites?\b/i,
  /\bbands?\b/i,
  /\bdimensions?\b/i,
  /\bsarif\b/i,
  /\bdigests?\b/i,
  /\bsafe(?:ly|ty)?\b/i,
  /\bsecure(?:ly)?\b/i,
  /\bcorrect(?:ly|ness)?\b/i,
  /\bcomplete(?:ly|ness)?\b/i,
  /\bcomplian(?:t|ce)\b/i,
];

/** The first page as it appears in certificate.html, markers included. Throws when absent. */
export function extractFirstPage(html: string): string {
  const start = html.indexOf(FIRST_PAGE_START);
  const end = html.indexOf(FIRST_PAGE_END);
  if (start === -1 || end === -1 || end < start) throw new Error('certificate.html has no first page');
  return html.slice(start, end + FIRST_PAGE_END.length);
}

/**
 * The words a reader sees on the first page: tags removed, entities decoded. Text inside <code> is
 * left out: it is a file path or a name quoted verbatim from the repository, never Cejel's prose.
 */
export function firstPageReadableText(fragment: string): string {
  return fragment
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function bannedWordsOnFirstPage(html: string): string[] {
  const text = firstPageReadableText(extractFirstPage(html));
  return FIRST_PAGE_BANNED_WORDS.flatMap((pattern) => {
    const match = pattern.exec(text);
    return match ? [`${match[0]} (…${text.slice(Math.max(0, match.index - 40), match.index + 40)}…)`] : [];
  });
}

/** certificate.html with the first page and the anchor ids it links to removed. */
export function certificateWithoutFirstPage(html: string): string {
  const start = html.indexOf(FIRST_PAGE_START);
  const end = html.indexOf(FIRST_PAGE_END);
  if (start === -1 || end === -1) return html;
  const after = html.slice(end + FIRST_PAGE_END.length).replace(/^\n {4}/, '');
  return `${html.slice(0, start)}${after}`.replace(/ id="cejel-src-[^"]*"/g, '');
}

/** Every same-page link target on the first page, and whether the document holds that id. */
export function unresolvedFirstPageLinks(html: string): string[] {
  const fragment = extractFirstPage(html);
  const targets = [...fragment.matchAll(/href="#([^"]+)"/g)].map((match) => match[1] ?? '');
  return targets.filter((target) => !html.includes(`id="${target}"`));
}

export const DOES_NOT_COVER_TEXT = 'did not run the code or its tests';
