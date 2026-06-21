import { useMemo, useEffect, useRef, useState, useCallback, memo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { editorLanguageExtensions } from "./completion";
import { cmSearchExtension } from "./cmSearch";

// Editor chrome themed via the design's CSS variables (das.css) so it tracks
// dark/light and accent automatically.
const dasTheme = EditorView.theme(
  {
    "&": { backgroundColor: "var(--bg-editor)", color: "var(--tx-1)", height: "100%" },
    ".cm-scroller": { fontFamily: "var(--mono)", fontSize: "var(--code-fs)", lineHeight: "1.55" },
    ".cm-content": { caretColor: "var(--accent)" },
    ".cm-gutters": { backgroundColor: "var(--bg-editor)", color: "var(--tx-dim)", border: "none" },
    ".cm-activeLine": { backgroundColor: "rgba(127,140,160,.05)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--tx-2)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "var(--bg-active)",
    },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
    ".cm-searchMatch": { backgroundColor: "rgba(245,166,35,.25)", outline: "1px solid rgba(245,166,35,.4)" },
    ".cm-searchMatch-selected": { backgroundColor: "rgba(245,166,35,.5)" },
    ".cm-panels": { backgroundColor: "var(--bg-chrome)", color: "var(--tx-1)", borderColor: "var(--line)" },
    ".cm-panel input, .cm-panel button": {
      backgroundColor: "var(--bg-elev)",
      color: "var(--tx-1)",
      border: "1px solid var(--line-2)",
      borderRadius: "5px",
    },
    // Autocomplete popup — themed to match the app (accent-highlighted selection).
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: "var(--bg-elev)",
      border: "1px solid var(--line-2)",
      borderRadius: "8px",
      boxShadow: "var(--shadow)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--mono)",
      fontSize: "var(--code-fs)",
      maxHeight: "16em",
    },
    ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px", color: "var(--tx-1)" },
    ".cm-tooltip-autocomplete ul li[aria-selected]": { backgroundColor: "var(--accent)", color: "#fff" },
    ".cm-completionIcon": { paddingRight: "14px", opacity: "0.7" },
    ".cm-completionDetail": { color: "var(--tx-3)", fontStyle: "normal", marginLeft: "8px" },
    ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)", fontWeight: "600" },
    ".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionMatchedText": { color: "#fff" },
    ".cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail": { color: "rgba(255,255,255,.85)" },
  },
  { dark: true },
);

const dasHighlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--tok-kw)" },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: "var(--tok-type)" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "var(--tok-string)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "var(--tok-comment)", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.atom], color: "var(--tok-num)" },
  { tag: [t.annotation, t.meta], color: "var(--tok-anno)" },
  { tag: [t.attributeName], color: "var(--tok-attr)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--tok-tag)" },
  { tag: [t.punctuation, t.operator, t.separator, t.bracket], color: "var(--tok-punc)" },
]);

function CodeEditor({
  path,
  value,
  onChange,
  gotoLine,
  onView,
}: {
  path: string;
  value: string;
  onChange: (v: string) => void;
  gotoLine?: number | null;
  onView?: (v: EditorView | null) => void;
}) {
  const viewRef = useRef<EditorView | null>(null);
  const extensions = useMemo(
    () => [dasTheme, syntaxHighlighting(dasHighlight), cmSearchExtension, ...editorLanguageExtensions(path)],
    [path],
  );

  // --- Decouple from the controlled-value round-trip ---
  // Echoing the user's own keystrokes back in as `value` makes
  // @uiw/react-codemirror serialize the WHOLE document (view.state.doc.toString())
  // on every keystroke to diff it against the prop — O(file size) per character.
  // Instead we hand CodeMirror a value that only changes on EXTERNAL edits (a
  // different file opened, or Replace All), detected by comparing against the
  // last text the editor itself emitted. Keystroke echoes keep `cmValue` stable,
  // so CodeMirror's value-sync effect never fires while typing.
  const lastEmitted = useRef(value);
  const [cmValue, setCmValue] = useState(value);
  const handleChange = useCallback(
    (v: string) => {
      lastEmitted.current = v;
      onChange(v);
    },
    [onChange],
  );
  useEffect(() => {
    // Same string reference flows up through state and back down on a keystroke,
    // so this is an O(1) reference check; only genuine external changes update.
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setCmValue(value);
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !gotoLine) return;
    try {
      const ln = view.state.doc.line(Math.min(gotoLine, view.state.doc.lines));
      view.dispatch({
        selection: { anchor: ln.from },
        effects: EditorView.scrollIntoView(ln.from, { y: "center" }),
      });
    } catch (_e) {
      /* line out of range — ignore */
    }
  }, [gotoLine, path]);
  return (
    <CodeMirror
      value={cmValue}
      height="100%"
      theme="none"
      extensions={extensions}
      onCreateEditor={(v) => {
        viewRef.current = v;
        onView?.(v);
      }}
      onChange={handleChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: true,
        // Disabled: the custom Android-Studio find/replace toolbar (driven via
        // cmSearch) owns Cmd+F/Cmd+R, so CodeMirror's built-in panel must not
        // also bind them (that double-binding was the old UX confusion).
        searchKeymap: false,
        autocompletion: true,
      }}
      style={{ height: "100%" }}
    />
  );
}

// Memoized so a parent re-render that doesn't change value/path/onChange/gotoLine
// (e.g. logcat streaming) skips the editor entirely.
export default memo(CodeEditor);
