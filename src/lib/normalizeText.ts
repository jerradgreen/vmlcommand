/**
 * Mirrors the DB normalization:
 * lower → replace non-alphanumeric with space → collapse whitespace → trim
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
