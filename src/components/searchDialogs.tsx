// Android-Studio-style global search dialogs:
//   • FindInPath      — ⇧⌘F (find) / ⇧⌘R (replace): centered modal, ripgrep-backed,
//                       results grouped by file with a live preview pane, and a
//                       real (per-result-excludable) project-wide Replace All.
//   • SearchEverywhere — double-Shift: tabbed (All / Files / Actions / Symbols)
//                       jump-to overlay.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Icons } from "./icons";
import { FileDot } from "./editor";
import * as E from "../lib/engine";
import { findInPath } from "../ipc/search";
import { readFile, writeFile } from "../ipc/file";
import { buildSearchRegex, replaceLine, countMatches } from "../lib/searchRegex";
import type { SearchResult } from "../types";

// Split text into nodes with matches wrapped in <mark>.
function highlight(text: string, re: RegExp | null) {
  if (!re) return text;
  re.lastIndex = 0;
  const out: any[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  let guard = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<mark key={k++} className="sd-hit">{m[0]}</mark>);
    last = m.index + m[0].length;
    if (m[0].length === 0) re.lastIndex++;
    if (++guard > 5000) break;
  }
  out.push(text.slice(last));
  return out;
}

// ---------------- shared option toggle ----------------

function OptToggle({ active, label, title, onClick }: any) {
  return (
    <button className={"sd-toggle" + (active ? " on" : "")} title={title} tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {label}
    </button>
  );
}

// ====================== FIND / REPLACE IN PATH ======================

function FindInPath({ mode, root, onClose, onOpenAt, onFilesChanged }: any) {
  const [query, setQuery] = useState("");
  const [replace, setReplace] = useState("");
  const [cs, setCs] = useState(false);
  const [ww, setWw] = useState(false);
  const [rx, setRx] = useState(false);
  const [mask, setMask] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<{ p: string; h: number } | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<{ path: string; lines: string[]; hitLine: number } | null>(null);
  const [msg, setMsg] = useState("");
  const qRef = useRef<HTMLInputElement | null>(null);

  const opts = useMemo(() => ({ caseSensitive: cs, wholeWord: ww, regex: rx }), [cs, ww, rx]);
  const re = useMemo(() => buildSearchRegex(query, opts, true), [query, cs, ww, rx]);
  const ipcOpts = () => ({ caseSensitive: cs, wholeWord: ww, regex: rx, fileMask: mask });

  useEffect(() => { qRef.current?.focus(); qRef.current?.select(); }, []);

  // Debounced ripgrep search.
  useEffect(() => {
    if (!root || !query.trim()) { setResults([]); setSel(null); setMsg(""); return; }
    let live = true; setBusy(true);
    const t = setTimeout(() => {
      findInPath(root, query, ipcOpts())
        .then((r) => {
          if (!live) return;
          setResults(r); setBusy(false); setExcluded(new Set());
          setSel(r.length ? { p: r[0].path, h: 0 } : null);
        })
        .catch(() => { if (live) { setResults([]); setBusy(false); } });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [query, cs, ww, rx, mask, root]);

  // Load preview file for the selected hit.
  useEffect(() => {
    if (!sel) { setPreview(null); return; }
    const r = results.find((x) => x.path === sel.p);
    const hit = r?.hits[sel.h];
    if (!hit) { setPreview(null); return; }
    let live = true;
    readFile(root + "/" + sel.p)
      .then((txt) => { if (live) setPreview({ path: sel.p, lines: txt.split("\n"), hitLine: hit.line }); })
      .catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [sel, results, root]);

  const totalHits = results.reduce((a, r) => a + r.hits.length, 0);

  const key = (p: string, line: number, i: number) => `${p}#${line}#${i}`;
  const isExcluded = (p: string, line: number, i: number) => excluded.has(key(p, line, i));
  const toggleExcl = (p: string, line: number, i: number) =>
    setExcluded((s) => { const n = new Set(s); const k = key(p, line, i); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleFileExcl = (r: SearchResult) =>
    setExcluded((s) => {
      const n = new Set(s);
      const allEx = r.hits.every((h, i) => n.has(key(r.path, h.line, i)));
      r.hits.forEach((h, i) => { const k = key(r.path, h.line, i); allEx ? n.delete(k) : n.add(k); });
      return n;
    });

  const flat = useMemo(() => {
    const out: { p: string; h: number }[] = [];
    results.forEach((r) => r.hits.forEach((_, i) => out.push({ p: r.path, h: i })));
    return out;
  }, [results]);
  const move = (d: number) => {
    if (!flat.length) return;
    const idx = sel ? flat.findIndex((f) => f.p === sel.p && f.h === sel.h) : -1;
    const ni = Math.max(0, Math.min(flat.length - 1, idx + d));
    setSel(flat[ni]);
  };
  const openSel = () => {
    if (!sel) return;
    const r = results.find((x) => x.path === sel.p);
    const hit = r?.hits[sel.h];
    if (hit) { onOpenAt(sel.p, hit.line); onClose(); }
  };

  const doReplaceAll = useCallback(async () => {
    if (mode !== "replace" || !query.trim()) return;
    setMsg("바꾸는 중…");
    const changedAbs: string[] = [];
    let count = 0;
    for (const r of results) {
      const includedLines = new Set(
        r.hits.filter((h, i) => !isExcluded(r.path, h.line, i)).map((h) => h.line),
      );
      if (!includedLines.size) continue;
      const abs = root + "/" + r.path;
      try {
        const txt = await readFile(abs);
        const lines = txt.split("\n");
        let changed = false;
        for (const ln of includedLines) {
          const idx = ln - 1;
          if (idx < 0 || idx >= lines.length) continue;
          const before = lines[idx];
          const lre = buildSearchRegex(query, opts, true);
          const after = replaceLine(before, lre, replace, rx);
          if (after !== before) {
            count += countMatches(before, buildSearchRegex(query, opts, true));
            lines[idx] = after;
            changed = true;
          }
        }
        if (changed) { await writeFile(abs, lines.join("\n")); changedAbs.push(abs); }
      } catch { /* skip unreadable/unwritable file */ }
    }
    setMsg(`${changedAbs.length}개 파일에서 ${count}건 변경됨`);
    if (changedAbs.length) onFilesChanged?.(changedAbs);
    // refresh results to reflect the edits
    findInPath(root, query, ipcOpts()).then(setResults).catch(() => {});
  }, [mode, query, replace, results, excluded, cs, ww, rx, mask, root]);

  // preview window
  const pv = preview;
  const pvStart = pv ? Math.max(0, pv.hitLine - 4) : 0;
  const pvEnd = pv ? Math.min(pv.lines.length, pv.hitLine + 8) : 0;

  return (
    <div className="sd-overlay" onMouseDown={onClose}>
      <div className="fip" onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
        <div className="fip-head">
          <span className="fip-title">{mode === "replace" ? "경로에서 바꾸기" : "경로에서 찾기"}</span>
          <span className="fip-sub">{query.trim() ? (busy ? "검색 중…" : `${totalHits}건 · ${results.length}개 파일`) : "프로젝트 전체 (ripgrep)"}</span>
          <div className="fip-spacer" />
          <button className="fip-x" title="닫기 (Esc)" onClick={onClose}><Icons.X size={16} /></button>
        </div>

        <div className="fip-fields">
          <div className="fip-field">
            <Icons.Search size={14} style={{ color: "var(--tx-3)" }} />
            <input ref={qRef} className="fip-input" placeholder="찾기" value={query} spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
                else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
                else if (e.key === "Enter") { e.preventDefault(); openSel(); }
              }} />
            <OptToggle active={cs} label="Aa" title="대소문자 구분 (Match Case)" onClick={() => setCs((x) => !x)} />
            <OptToggle active={ww} label="W" title="단어 단위 (Words)" onClick={() => setWw((x) => !x)} />
            <OptToggle active={rx} label=".*" title="정규식 (Regex)" onClick={() => setRx((x) => !x)} />
          </div>
          {mode === "replace" && (
            <div className="fip-field">
              <Icons.Replace size={14} style={{ color: "var(--tx-3)" }} />
              <input className="fip-input" placeholder="바꾸기" value={replace} spellCheck={false}
                onChange={(e) => setReplace(e.target.value)} />
              <button className="fip-replace-btn" disabled={!totalHits} onClick={doReplaceAll}>모두 바꾸기</button>
            </div>
          )}
          <div className="fip-mask">
            <span className="fip-mask-lbl">파일 마스크</span>
            <input className="fip-mask-input" placeholder="예: *.kt, *.xml" value={mask} spellCheck={false}
              onChange={(e) => setMask(e.target.value)} />
            {msg && <span className="fip-msg">{msg}</span>}
          </div>
        </div>

        <div className="fip-body">
          <div className="fip-results scroll">
            {results.map((r) => {
              const fileEx = r.hits.every((h, i) => isExcluded(r.path, h.line, i));
              return (
                <div key={r.path}>
                  <div className="fip-file">
                    <input type="checkbox" className="fip-ck" checked={!fileEx} onChange={() => toggleFileExcl(r)}
                      onClick={(e) => e.stopPropagation()} title="파일 포함/제외" />
                    <FileDot path={r.path} />
                    <span className="fip-fname">{r.path.split("/").pop()}</span>
                    <span className="fip-fpath">{r.path.split("/").slice(0, -1).join("/")}</span>
                    <span className="fip-fcnt">{r.hits.length}</span>
                  </div>
                  {r.hits.map((h, i) => {
                    const ex = isExcluded(r.path, h.line, i);
                    const seld = sel && sel.p === r.path && sel.h === i;
                    return (
                      <div key={i} className={"fip-hitrow" + (seld ? " sel" : "") + (ex ? " excl" : "")}
                        onClick={() => setSel({ p: r.path, h: i })}
                        onDoubleClick={() => { onOpenAt(r.path, h.line); onClose(); }}>
                        {mode === "replace" && (
                          <input type="checkbox" className="fip-ck" checked={!ex}
                            onChange={() => toggleExcl(r.path, h.line, i)} onClick={(e) => e.stopPropagation()} />
                        )}
                        <span className="fip-lno">{h.line}</span>
                        <span className="fip-htext">{highlight(h.text.replace(/^\s+/, ""), re)}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {query.trim() && !busy && !results.length && (
              <div className="fip-empty">일치하는 결과가 없습니다</div>
            )}
          </div>

          <div className="fip-preview scroll">
            {pv ? (
              <>
                <div className="fip-pv-head"><FileDot path={pv.path} /><span>{pv.path}</span></div>
                <div className="fip-pv-code">
                  {pv.lines.slice(pvStart, pvEnd).map((ln, i) => {
                    const lineNo = pvStart + i + 1;
                    const isHit = lineNo === pv.hitLine;
                    const replaced = mode === "replace" && isHit ? replaceLine(ln, buildSearchRegex(query, opts, true), replace, rx) : null;
                    return (
                      <div key={lineNo} className={"fip-pv-line" + (isHit ? " hit" : "")}>
                        <span className="fip-pv-ln">{lineNo}</span>
                        <span className="fip-pv-lc">{isHit ? highlight(ln, re) : ln || " "}</span>
                        {replaced != null && replaced !== ln && (
                          <span className="fip-pv-rep" title="바꾼 결과 미리보기">→ {replaced}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="fip-empty">{query.trim() ? "결과를 선택하면 미리보기가 표시됩니다" : "검색어를 입력하세요"}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ====================== SEARCH EVERYWHERE (double-Shift) ======================

// Double-Shift → project-wide file-name search (fuzzy), Android-Studio "Go to
// File" style. Intentionally file-name only (not the broader AS "Search
// Everywhere") per the product intent.
function SearchEverywhere({ files, onOpenFile, onClose }: any) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [q]);

  const items = useMemo(() => E.fuzzyOver(files || [], q).slice(0, 14), [q, files]);
  const choose = (p: string) => { onOpenFile(p); onClose(); };

  return (
    <div className="sd-overlay se-overlay" onMouseDown={onClose}>
      <div className="se" onMouseDown={(e) => e.stopPropagation()}>
        <div className="se-input">
          <Icons.Search size={18} style={{ color: "var(--tx-3)" }} />
          <input ref={inputRef} placeholder="파일 검색 (프로젝트 전체 경로)" value={q} spellCheck={false}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") { e.preventDefault(); if (items[sel]) choose(items[sel].path); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }} />
        </div>
        <div className="se-list scroll">
          {items.map((r: any, i: number) => (
            <div key={r.path} className={"se-item" + (i === sel ? " sel" : "")}
              onMouseEnter={() => setSel(i)} onClick={() => choose(r.path)}>
              <FileDot path={r.path} />
              <span className="se-label">{r.path.split("/").pop()}</span>
              <span className="se-sub">{r.path}</span>
            </div>
          ))}
          {!items.length && <div className="se-empty">{q ? "일치하는 파일 없음" : "파일명을 입력하세요"}</div>}
        </div>
      </div>
    </div>
  );
}

export { FindInPath, SearchEverywhere };
