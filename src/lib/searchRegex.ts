// Shared, dependency-free regex semantics for every search/replace feature
// (the in-editor cmSearch toolbar AND Find/Replace in Path). Having one source
// of truth means the in-editor bar and the path dialog match the same things
// and replace identically. No DOM/React deps → unit-testable in plain Node.

export interface SearchOpts {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a RegExp mirroring ripgrep / CodeMirror option semantics.
 * Returns null when the pattern is empty or an invalid user regex.
 */
export function buildSearchRegex(pattern: string, opts: SearchOpts, global: boolean): RegExp | null {
  if (!pattern) return null;
  try {
    let pat = opts.regex ? pattern : escapeRegExp(pattern);
    if (opts.wholeWord) pat = `\\b(?:${pat})\\b`;
    let flags = opts.caseSensitive ? "" : "i";
    if (global) flags += "g";
    return new RegExp(pat, flags);
  } catch {
    return null;
  }
}

/**
 * Replace every match in `line`. Literal mode inserts `template` verbatim (no
 * $-group expansion); regex mode honors $1/$& like Android Studio. `re` must be
 * a global RegExp.
 */
export function replaceLine(line: string, re: RegExp | null, template: string, isRegex: boolean): string {
  if (!re) return line;
  re.lastIndex = 0;
  return isRegex ? line.replace(re, template) : line.replace(re, () => template);
}

/** Count matches in `text` for a global RegExp. */
export function countMatches(text: string, re: RegExp | null): number {
  if (!re) return 0;
  re.lastIndex = 0;
  const m = text.match(re);
  return m ? m.length : 0;
}
