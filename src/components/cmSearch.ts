// In-editor search/replace engine for CodeMirror, driven by a custom (Android
// Studio-style) React toolbar instead of CodeMirror's built-in panel.
//
// Why a self-contained engine instead of @codemirror/search's SearchQuery:
//  - SearchQuery.getCursor only yields {from,to} and exposes no replacement
//    helper, so regex capture-group replacement ($1, $&) isn't available.
//  - We need find, replace, highlight, and match-counting to share *identical*
//    semantics. Using one JS RegExp for all four guarantees that.
// CodeMirror positions are UTF-16 code-unit offsets, i.e. exactly JS string
// indices into doc.toString() — so regex match indices map 1:1 onto doc
// positions with no byte-offset hazard.

import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import { EditorView, Decoration, ViewPlugin } from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { buildSearchRegex } from "../lib/searchRegex";

export interface CmQuery {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface Match { from: number; to: number; }

/** Build a JS RegExp mirroring the query options, or null if invalid/empty.
 *  Shares one engine with Find-in-Path via lib/searchRegex. */
function buildRegex(q: CmQuery | null, global: boolean): RegExp | null {
  if (!q || !q.search) return null;
  return buildSearchRegex(q.search, { caseSensitive: q.caseSensitive, wholeWord: q.wholeWord, regex: q.regexp }, global);
}

/** All matches over the doc string, in document order. Bounded for safety. */
export function allMatches(doc: string, q: CmQuery | null): Match[] {
  const re = buildRegex(q, true);
  if (!re) return [];
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(doc)) !== null) {
    const len = m[0].length;
    if (len > 0) out.push({ from: m.index, to: m.index + len });
    else re.lastIndex++; // never loop forever on a zero-width match
    if (++guard > 200000) break;
  }
  return out;
}

function replacementFor(matched: string, q: CmQuery, template: string): string {
  if (!q.regexp) return template; // literal replace — insert verbatim
  const re = buildRegex(q, false);
  if (!re) return template;
  // `matched` is exactly one match, so a non-global replace resolves $1/$& etc.
  return matched.replace(re, template);
}

// ---------- query state + match highlighting ----------

export const setCmQuery = StateEffect.define<CmQuery | null>();

const queryField = StateField.define<CmQuery | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setCmQuery)) value = e.value;
    return value;
  },
});

const matchDeco = Decoration.mark({ class: "cm-as-match" });
const currentDeco = Decoration.mark({ class: "cm-as-match cm-as-match-current" });

function computeDecorations(view: EditorView): DecorationSet {
  const q = view.state.field(queryField, false);
  const re = buildRegex(q ?? null, true);
  if (!re) return Decoration.none;
  const doc = view.state.doc.toString();
  const sel = view.state.selection.main;
  const ranges = view.visibleRanges;
  const builder = new RangeSetBuilder<Decoration>();
  let m: RegExpExecArray | null;
  let guard = 0;
  while ((m = re.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    // Only decorate matches intersecting the rendered viewport (perf on big files).
    if (ranges.some((r) => from < r.to && to > r.from)) {
      const isCurrent = from === sel.from && to === sel.to;
      builder.add(from, to, isCurrent ? currentDeco : matchDeco);
    }
    if (++guard > 200000) break;
  }
  return builder.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = computeDecorations(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        u.transactions.some((tr) => tr.effects.some((e) => e.is(setCmQuery)))
      ) {
        this.decorations = computeDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/** Extension bundle: add to the editor to enable query-driven match highlighting. */
export const cmSearchExtension = [queryField, highlighter];

// ---------- imperative commands (called from the React toolbar) ----------

/** Push the current query into the editor so matches highlight. */
export function applyQuery(view: EditorView, q: CmQuery | null) {
  view.dispatch({ effects: setCmQuery.of(q && q.search ? q : null) });
}

function select(view: EditorView, m: Match, focus = true) {
  view.dispatch({ selection: { anchor: m.from, head: m.to }, scrollIntoView: true });
  if (focus) view.focus();
}

/** Total match count and the index of the match under the current selection (-1 if none). */
export function countAndIndex(view: EditorView, q: CmQuery | null): { count: number; index: number } {
  const matches = allMatches(view.state.doc.toString(), q);
  const sel = view.state.selection.main;
  const index = matches.findIndex((m) => m.from === sel.from && m.to === sel.to);
  return { count: matches.length, index };
}

/** Move to the next match at/after the caret (wraps). Returns the new index or -1. */
export function findNext(view: EditorView, q: CmQuery | null): number {
  const matches = allMatches(view.state.doc.toString(), q);
  if (!matches.length) return -1;
  const head = view.state.selection.main.to;
  let i = matches.findIndex((m) => m.from >= head);
  if (i < 0) i = 0; // wrap
  select(view, matches[i]);
  return i;
}

/** Move to the previous match before the caret (wraps). Returns the new index or -1. */
export function findPrev(view: EditorView, q: CmQuery | null): number {
  const matches = allMatches(view.state.doc.toString(), q);
  if (!matches.length) return -1;
  const from = view.state.selection.main.from;
  let i = -1;
  for (let k = matches.length - 1; k >= 0; k--) {
    if (matches[k].from < from) { i = k; break; }
  }
  if (i < 0) i = matches.length - 1; // wrap
  select(view, matches[i]);
  return i;
}

/** Replace the match currently under the selection, then advance to the next. */
export function replaceCurrent(view: EditorView, q: CmQuery | null, replace: string): boolean {
  if (!q || !q.search) return false;
  const sel = view.state.selection.main;
  const matches = allMatches(view.state.doc.toString(), q);
  const cur = matches.find((m) => m.from === sel.from && m.to === sel.to);
  if (cur) {
    const matched = view.state.doc.sliceString(cur.from, cur.to);
    const rep = replacementFor(matched, q, replace);
    view.dispatch({ changes: { from: cur.from, to: cur.to, insert: rep }, selection: { anchor: cur.from + rep.length } });
    findNext(view, q);
    return true;
  }
  // Not currently on a match — select the next one (AS behavior).
  findNext(view, q);
  return false;
}

/** Replace every match in the document. Returns the number replaced. */
export function replaceAll(view: EditorView, q: CmQuery | null, replace: string): number {
  if (!q || !q.search) return 0;
  const doc = view.state.doc.toString();
  const matches = allMatches(doc, q);
  if (!matches.length) return 0;
  const changes = matches.map((m) => ({
    from: m.from,
    to: m.to,
    insert: replacementFor(doc.slice(m.from, m.to), q, replace),
  }));
  view.dispatch({ changes });
  return matches.length;
}
