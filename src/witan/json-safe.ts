// A leading UTF-8 byte-order mark (U+FEFF) — common in Windows-authored JSON, notably
// package.json — makes JSON.parse throw outright instead of just being invisible whitespace.
// Strip it before every JSON.parse of a file cejel did not itself produce.
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
