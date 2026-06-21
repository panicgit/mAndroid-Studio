import React from "react";
import { Icons } from "./icons";
import * as E from "../lib/engine";
import { FileDot } from "./editor";
import { searchContent } from "../ipc/search";
/* DAS — bottom panels (logcat, build), git, search, adb files, palette, status bar */

  const { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } = React;

  // ===================== VIRTUALIZED LOGCAT =====================
  function highlightText(text, q) {
    if (!q) return text;
    const lc = text.toLowerCase(); const ql = q.toLowerCase();
    const parts = []; let i = 0, last = 0;
    while ((i = lc.indexOf(ql, last)) >= 0) {
      if (i > last) parts.push(text.slice(last, i));
      parts.push(React.createElement("mark", { className: "hit", key: i }, text.slice(i, i + q.length)));
      last = i + q.length;
    }
    parts.push(text.slice(last));
    return parts;
  }

  function LogcatPane({ lines, levels, setLevels, filter, setFilter, paused, setPaused, autoscroll, setAutoscroll, onClear, pidOnly, setPidOnly, pid, onPopOut }) {
    const scrollRef = useRef(null);
    const MAXVIEW = 240; // tail window the viewport keeps mounted (ring buffer holds up to 30k)

    const filtered = useMemo(() => lines.filter((l) =>
      levels[l.level] &&
      (!pidOnly || l.pid === pid) &&
      (!filter || (l.msg + " " + l.tag).toLowerCase().includes(filter.toLowerCase()))
    ), [lines, levels, filter, pidOnly, pid]);

    const total = filtered.length;
    const vis = useMemo(() => filtered.slice(Math.max(0, total - MAXVIEW)), [filtered, total]);

    // autoscroll to bottom on new lines
    useLayoutEffect(() => {
      const el = scrollRef.current; if (!el) return;
      if (autoscroll) { el.scrollTop = el.scrollHeight; }
    }, [vis.length, autoscroll]);

    const onScroll = () => {
      const el = scrollRef.current; if (!el) return;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
      if (!atBottom && autoscroll) setAutoscroll(false);
      else if (atBottom && !autoscroll) setAutoscroll(true);
    };

    const toggleLv = (lv) => setLevels((s) => ({ ...s, [lv]: !s[lv] }));

    return React.createElement("div", { className: "bp-body" },
      React.createElement("div", { className: "logcat-toolbar" },
        React.createElement("div", { className: "lv-chips" },
          E.LEVELS.map((lv) => React.createElement("div", {
            key: lv, className: "lv-chip " + lv + (levels[lv] ? " on" : ""), onClick: () => toggleLv(lv),
          }, lv))),
        React.createElement("div", { className: "pid-pill", onClick: () => setPidOnly((p) => !p), style: { cursor: "pointer", opacity: pidOnly ? 1 : .65 } },
          React.createElement(Icons.Filter, { size: 12 }),
          "PID ", React.createElement("b", null, pid),
          pidOnly && React.createElement(Icons.Check, { size: 12, style: { color: "var(--accent)" } })),
        React.createElement("input", {
          className: "log-filter", placeholder: "메시지/태그 필터…", value: filter,
          onChange: (e) => setFilter(e.target.value),
        }),
        React.createElement("div", { className: "bp-spacer" }),
        React.createElement("span", { className: "log-meta" }, `${total.toLocaleString()} / ${lines.length.toLocaleString()} 줄`),
        React.createElement("button", { className: "side-tool", title: paused ? "재개" : "일시정지", onClick: () => setPaused((p) => !p) },
          React.createElement(paused ? Icons.Play : Icons.Pause, { size: 15 })),
        React.createElement("button", { className: "side-tool", title: "맨 아래로 (autoscroll)", onClick: () => setAutoscroll(true), style: { color: autoscroll ? "var(--accent)" : null } },
          React.createElement(Icons.ArrowDown, { size: 15 })),
        React.createElement("button", { className: "side-tool", title: "지우기", onClick: onClear }, React.createElement(Icons.Trash, { size: 14 })),
        onPopOut && React.createElement("button", { className: "side-tool", title: "별도 창으로 열기", onClick: onPopOut }, React.createElement(Icons.PopOut, { size: 14 }))),
      React.createElement("div", { className: "log-scroll scroll", ref: scrollRef, onScroll },
        total > MAXVIEW && React.createElement("div", { className: "log-trunc" },
          React.createElement(Icons.ArrowDown, { size: 12, style: { transform: "rotate(180deg)" } }),
          `이전 ${(total - MAXVIEW).toLocaleString()}줄 (링버퍼 보관, 최신 ${MAXVIEW}줄 표시)`),
        vis.map((l) => React.createElement("div", { key: l.id, className: "log-line " + l.level },
          React.createElement("span", { className: "log-ts" }, l.ts),
          React.createElement("span", { className: "log-pid" }, l.pid + "-" + l.tid),
          React.createElement("span", { className: "log-lv " + l.level }, l.level),
          React.createElement("span", { className: "log-tag" }, highlightText(l.tag, filter)),
          React.createElement("span", { className: "log-msg" }, highlightText(l.msg, filter)))),
        total === 0 && React.createElement("div", { className: "build-empty", style: { fontFamily: "var(--ui)" } }, "표시할 로그가 없습니다 — 레벨/필터를 확인하세요"),
        !autoscroll && React.createElement("button", { className: "autoscroll-off", onClick: () => setAutoscroll(true) },
          React.createElement(Icons.ArrowDown, { size: 13 }), "최신 로그로")));
  }

  // ===================== BUILD CONSOLE =====================
  function BuildConsole({ lines, running, onJump }) {
    const ref = useRef(null);
    useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines.length]);
    if (!lines.length && !running) {
      return React.createElement("div", { className: "bp-body" },
        React.createElement("div", { className: "build-empty" },
          React.createElement("div", { style: { fontSize: 13, color: "var(--tx-2)", marginBottom: 6 } }, "Gradle 출력"),
          "▶ Run 또는 Build를 눌러 ", React.createElement("code", { style: { color: "var(--tx-2)" } }, "./gradlew assembleDebug --console=plain"), " 실행"));
    }
    return React.createElement("div", { className: "bp-body" },
      React.createElement("div", { className: "build-scroll scroll", ref },
        lines.map((l, i) => React.createElement("div", {
          key: i, className: "build-line" + (l.cls ? " " + l.cls : "") + (l.error ? " clickable" : ""),
          onClick: l.error ? () => onJump(l.error) : null,
        }, l.error ? React.createElement(React.Fragment, null, l.t) : l.t)),
        running && React.createElement("div", { className: "build-line dim" }, React.createElement("span", { className: "spinner" }), "실행 중…")));
  }

  // ===================== GIT PANEL (side) =====================
  function GitPanel({ git, selected, onSelect, onOpenDiff }) {
    const Row = (f) => React.createElement("div", {
      key: f.path, className: "git-row" + (selected === f.path ? " sel" : ""), onClick: () => onSelect(f.path), onDoubleClick: () => onOpenDiff(f.path),
    },
      React.createElement("span", { className: "st git-" + f.status }, f.status),
      React.createElement("span", { className: "fn" },
        React.createElement("span", { className: "dir" }, f.path.split("/").slice(0, -1).join("/") + "/"),
        f.path.split("/").pop()),
      React.createElement("span", { className: "stat" },
        f.add ? React.createElement("span", { className: "a" }, "+" + f.add) : null,
        f.del ? React.createElement("span", { className: "d" }, "−" + f.del) : null));
    return React.createElement("div", { className: "side-body scroll" },
      React.createElement("div", { style: { padding: "10px 14px 6px" } },
        React.createElement("span", { className: "branch-pill" }, React.createElement(Icons.Git, { size: 13 }), git.branch),
        React.createElement("span", { style: { marginLeft: 8, fontSize: 11, color: "var(--tx-3)" } }, `↑${git.ahead} ↓${git.behind}`)),
      git.staged.length > 0 && React.createElement(React.Fragment, null,
        React.createElement("div", { className: "git-section-h" }, React.createElement(Icons.Check, { size: 12 }), "Staged", React.createElement("span", { style: { color: "var(--tx-dim)" } }, git.staged.length)),
        git.staged.map(Row)),
      React.createElement("div", { className: "git-section-h" }, React.createElement(Icons.Dot, { size: 12 }), "Changes", React.createElement("span", { style: { color: "var(--tx-dim)" } }, git.changed.length)),
      git.changed.map(Row));
  }

  function DiffView({ path, diff }) {
    if (!diff || !diff.hunks.length) {
      return React.createElement("div", { className: "bp-body" }, React.createElement("div", { className: "build-empty" }, "변경 내역 없음 — 새 파일이거나 바이너리"));
    }
    return React.createElement("div", { className: "bp-body" },
      React.createElement("div", { className: "diff-head" }, React.createElement(Icons.Git, { size: 13 }), React.createElement("span", { className: "adb-path" }, path)),
      React.createElement("div", { className: "diff-scroll scroll" },
        diff.hunks.map((h, hi) => React.createElement("div", { key: hi },
          React.createElement("div", { className: "diff-hunk-h" }, h.header),
          h.lines.map((ln, li) => React.createElement("div", {
            key: li, className: "diff-l" + (ln.t === "+" ? " add" : ln.t === "-" ? " del" : ""),
          },
            React.createElement("span", { className: "sgn" }, ln.t === " " ? "" : ln.t),
            React.createElement("span", { className: "dt" }, ln.l)))))));
  }

  // ===================== SEARCH PANEL =====================
  function SearchPanel({ onOpenAt, root }) {
    const [q, setQ] = useState("");
    const [results, setResults] = useState([]);
    useEffect(() => {
      if (!root || !q) { setResults([]); return; }
      let live = true;
      const t = setTimeout(() => { searchContent(root, q).then((r) => { if (live) setResults(r); }).catch(() => {}); }, 200);
      return () => { live = false; clearTimeout(t); };
    }, [q, root]);
    const hitCount = results.reduce((a, r) => a + r.hits.length, 0);
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current && inputRef.current.focus(); }, []);
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
      React.createElement("div", { className: "search-box" },
        React.createElement("div", { className: "search-input-row" },
          React.createElement(Icons.Search, { size: 14, style: { color: "var(--tx-3)" } }),
          React.createElement("input", { ref: inputRef, placeholder: "프로젝트 전체 검색 (ripgrep)", value: q, onChange: (e) => setQ(e.target.value) })),
        React.createElement("div", { style: { fontSize: 11, color: "var(--tx-3)" } }, q ? `${results.length}개 파일에서 ${hitCount}건` : "내용을 입력하세요")),
      React.createElement("div", { className: "side-body scroll", style: { flex: 1 } },
        results.map((r) => React.createElement("div", { key: r.path },
          React.createElement("div", { className: "search-result-file" },
            React.createElement(FileDot, { path: r.path }),
            React.createElement("span", { style: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.path.split("/").pop()),
            React.createElement("span", { style: { color: "var(--tx-dim)", fontSize: 11, marginLeft: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.path.split("/").slice(0, -1).join("/")),
            React.createElement("span", { className: "cnt" }, r.hits.length)),
          r.hits.map((h, i) => React.createElement("div", {
            key: i, className: "search-hit", onClick: () => onOpenAt(r.path, h.line),
          },
            React.createElement("span", { className: "lno" }, h.line),
            React.createElement("span", { className: "txt", dangerouslySetInnerHTML: { __html: hlHit(h.text, q) } })))))));
  }
  function hlHit(text, q) {
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (!q) return esc(text.trim());
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(text.trim());
    const t = text; // keep indentation context but trim left
    const lead = t.length - t.trimStart().length;
    const s = Math.max(lead, i - 24);
    const pre = (s > lead ? "…" : "") + t.slice(s, i);
    return esc(pre) + "<mark>" + esc(t.slice(i, i + q.length)) + "</mark>" + esc(t.slice(i + q.length, i + q.length + 60));
  }

  // ===================== ADB DEVICE FILES =====================
  function AdbFilesPanel({ files, deviceLabel, path, onNavigate, onUp, onPull, onRefresh }) {
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", minHeight: 0, flex: 1 } },
      React.createElement("div", { className: "adb-bar" },
        React.createElement(Icons.Smartphone, { size: 13, style: { color: "var(--accent)" } }),
        React.createElement("span", null, deviceLabel),
        React.createElement(Icons.ChevronRight, { size: 12, style: { color: "var(--tx-dim)" } }),
        React.createElement("span", { className: "adb-path" }, path || "/sdcard"),
        React.createElement("div", { className: "bp-spacer" }),
        React.createElement("button", { className: "side-tool", title: "상위 폴더", onClick: onUp }, React.createElement(Icons.CornerDownRight, { size: 14, style: { transform: "rotate(180deg)" } })),
        React.createElement("button", { className: "side-tool", title: "새로고침", onClick: onRefresh }, React.createElement(Icons.RefreshCw, { size: 14 }))),
      React.createElement("div", { className: "side-body scroll", style: { flex: 1 } },
        React.createElement("table", { className: "adb-table" },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", null, "이름"), React.createElement("th", null, "권한"),
            React.createElement("th", null, "소유자"), React.createElement("th", null, "크기"),
            React.createElement("th", null, "수정일"), React.createElement("th", null, ""))),
          React.createElement("tbody", null,
            files.map((f) => React.createElement("tr", {
              key: f.name, className: "adb-row",
              style: f.dir ? { cursor: "pointer" } : null,
              onClick: f.dir ? () => onNavigate(f.name) : null,
            },
              React.createElement("td", null, React.createElement("span", { className: "nm" },
                React.createElement(f.dir ? Icons.Folder : Icons.File, { size: 15, style: { color: f.dir ? "var(--accent)" : "var(--tx-3)" } }),
                f.name)),
              React.createElement("td", { className: "perm" }, f.perm),
              React.createElement("td", { className: "owner" }, f.owner),
              React.createElement("td", { className: "sz" }, f.dir ? "—" : f.size),
              React.createElement("td", { className: "dt" }, f.date),
              React.createElement("td", null, !f.dir && React.createElement("button", { className: "side-tool adb-pull", title: "adb pull", onClick: (e) => { e.stopPropagation(); onPull(f.name); } }, React.createElement(Icons.Download, { size: 14 }))))),
            files.length === 0 && React.createElement("tr", null, React.createElement("td", { colSpan: 6, style: { color: "var(--tx-3)", padding: "16px 12px", fontFamily: "var(--ui)" } }, "비어있거나 접근 불가"))))));
  }

  // ===================== QUICK OPEN PALETTE =====================
  function QuickOpen({ onClose, onOpen, files }) {
    const [q, setQ] = useState("");
    const [sel, setSel] = useState(0);
    const ref = useRef(null);
    useEffect(() => { ref.current && ref.current.focus(); }, []);
    const results = useMemo(() => E.fuzzyOver(files || [], q).slice(0, 10), [q, files]);
    useEffect(() => setSel(0), [q]);
    const choose = (p) => { onOpen(p); onClose(); };
    return React.createElement("div", { className: "palette-overlay", onMouseDown: onClose },
      React.createElement("div", { className: "palette", onMouseDown: (e) => e.stopPropagation() },
        React.createElement("div", { className: "palette-input" },
          React.createElement(Icons.Search, { size: 17, style: { color: "var(--tx-3)" } }),
          React.createElement("input", {
            ref, placeholder: "파일 이름으로 검색 (fuzzy)…", value: q, onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter") { if (results[sel]) choose(results[sel].path); }
              else if (e.key === "Escape") onClose();
            },
          })),
        React.createElement("div", { className: "palette-list scroll" },
          results.map((r, i) => React.createElement("div", {
            key: r.path, className: "palette-item" + (i === sel ? " sel" : ""),
            onMouseEnter: () => setSel(i), onClick: () => choose(r.path),
          },
            React.createElement(FileDot, { path: r.path }),
            React.createElement("span", { className: "pname" }, r.path.split("/").pop()),
            React.createElement("span", { className: "ppath" }, r.path))),
          !results.length && React.createElement("div", { style: { padding: 16, color: "var(--tx-3)", fontSize: 12 } }, "일치하는 파일 없음"))));
  }

  // Memoize the bottom panels: they are always mounted while open and would
  // otherwise re-render on every editor keystroke (App re-renders top-down).
  const LogcatPaneMemo = React.memo(LogcatPane);
  const BuildConsoleMemo = React.memo(BuildConsole);
  export { LogcatPaneMemo as LogcatPane, BuildConsoleMemo as BuildConsole, GitPanel, DiffView, SearchPanel, AdbFilesPanel, QuickOpen };
