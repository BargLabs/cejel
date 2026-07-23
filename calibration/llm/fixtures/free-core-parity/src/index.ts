import { normalizeName } from './normalize.js';

export function greeting(name: string): string {
  return `Hello, ${normalizeName(name)}`;
}
