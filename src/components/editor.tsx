import React from "react";
import { Icons } from "./icons";
import * as E from "../lib/engine";
import * as D from "../lib/data";
import { DiffView } from "./panels";
import CodeEditor from "./CodeEditor";
import LayoutPreview from "./LayoutPreview";
import { buildAndroidView } from "../lib/androidView";
import * as CM from "./cmSearch";
import { listFiles } from "../ipc/fs";
import { readFile } from "../ipc/file";
import { buildResFiles } from "../lib/layoutPreview/projectResources";
/* DAS — file tree, device selector, editor tabs, code view, find/replace */

  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  // ---------- file-type dot color ----------
  function extColor(path) {
    if (/\.kt$/.test(path)) return "#7f63f4";
    if (/\.kts$/.test(path) || /\.gradle/.test(path)) return "#58c98b";
    if (/\.xml$/.test(path)) return "#f5a623";
    if (/\.java$/.test(path)) return "#e8743b";
    if (/\.properties$/.test(path)) return "#8a929e";
    return "#6b7280";
  }
  // res/layout 하위의 View 기반 XML인지 — Design 토글 노출 조건.
  function isLayoutXml(path, content) {
    if (!/\/res\/layout[^/]*\/[^/]+\.xml$/.test(path)) return false;
    const m = /<\s*([A-Za-z][\w.]*)/.exec(content || "");
    const root = m ? m[1] : "";
    return !["resources", "vector", "selector", "shape", "layer-list", "menu"].includes(root)
      && !/^animated-/.test(root);
  }

  function FileDot({ path }) {
    return React.createElement("span", { className: "ic", style: { width: 16, justifyContent: "center" } },
      React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: extColor(path) } }));
  }

  // ===================== DEVICE SELECTOR =====================
  // Multi-select device picker (AS "Select Multiple Devices"). `selected` is an
  // array of device ids; `onToggle(id)` flips one. The menu stays open across
  // toggles so several targets can be checked in one go.
  function DeviceSelector({ devices, selected, onToggle }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);
    const sel = Array.isArray(selected) ? selected : (selected ? [selected] : []);
    const chosen = devices.filter((d) => sel.includes(d.id));
    const primary = chosen[0] || { id: "", label: "기기 없음", state: "offline", android: "", type: "phone" };
    const label = chosen.length > 1 ? `${primary.label} +${chosen.length - 1}` : primary.label;
    return React.createElement("div", { className: "device-sel", ref },
      React.createElement("button", { className: "device-btn", onClick: () => setOpen((o) => !o) },
        React.createElement("span", { className: "device-dot" + (primary.state === "offline" ? " off" : "") }),
        React.createElement(Icons.Smartphone, { size: 14 }),
        React.createElement("span", null, label),
        React.createElement(Icons.ChevronDown, { size: 13 })),
      open && React.createElement("div", { className: "device-menu" },
        !devices.length && React.createElement("div", { className: "device-empty" }, "연결된 기기 없음"),
        devices.map((d) => {
          const on = sel.includes(d.id);
          return React.createElement("div", {
            key: d.id, className: "device-item" + (on ? " sel" : ""),
            onClick: () => { if (d.state !== "offline") onToggle(d.id); },
            style: d.state === "offline" ? { opacity: .5 } : null,
          },
            React.createElement("span", { className: "device-check" }, on && React.createElement(Icons.Check, { size: 14, style: { color: "var(--accent)" } })),
            React.createElement("span", { className: "device-dot" + (d.state === "offline" ? " off" : "") }),
            React.createElement(Icons.Smartphone, { size: 16, style: { color: "var(--tx-3)" } }),
            React.createElement("div", { className: "device-meta" },
              React.createElement("span", { className: "nm" }, d.label),
              React.createElement("span", { className: "sub" }, `${d.android} · ${d.state === "offline" ? "offline" : d.id}`)));
        })));
  }

  // ===================== BUILD VARIANT SELECTOR =====================
  // Android Studio "Build Variants": pick which application module + variant
  // (flavor × buildType) Build/Run targets. `modules` is empty for non-Android or
  // flavor-less projects, in which case the selector hides and the caller falls
  // back to a bare assembleDebug/installDebug.
  function VariantSelector({ modules, selected, onSelect }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);
    if (!modules || !modules.length) return null;
    const multi = modules.length > 1;
    const curMod = selected ? modules.find((m) => m.gradlePath === selected.module) : null;
    const label = !selected ? "Variant 선택"
      : (multi && curMod ? `${curMod.name} · ${selected.variant}` : selected.variant);
    return React.createElement("div", { className: "variant-sel", ref },
      React.createElement("button", { className: "variant-btn", onClick: () => setOpen((o) => !o), title: "Build Variant" },
        React.createElement(Icons.Module, { size: 14 }),
        React.createElement("span", null, label),
        React.createElement(Icons.ChevronDown, { size: 13 })),
      open && React.createElement("div", { className: "variant-menu scroll" },
        modules.map((m) => React.createElement(React.Fragment, { key: m.gradlePath || m.name },
          multi && React.createElement("div", { className: "variant-group" }, m.name),
          m.variants.map((v) => {
            const sel = selected && selected.module === m.gradlePath && selected.variant === v;
            return React.createElement("div", {
              key: (m.gradlePath || m.name) + ":" + v,
              className: "variant-item" + (sel ? " sel" : ""),
              onClick: () => { onSelect({ module: m.gradlePath, variant: v }); setOpen(false); },
            },
              React.createElement("span", { className: "nm" }, v),
              sel && React.createElement(Icons.Check, { size: 15, style: { marginLeft: "auto", color: "var(--accent)" } }));
          })))));
  }

  // ===================== FILE TREE =====================
  function TreeNode({ node, depth, openMap, toggle, activePath, onOpen, defaultOpen, selPath, setSelPath }) {
    const isDir = node.type === "dir";
    const key = node.path || node.name + depth;
    const isOpen = openMap[key] !== undefined ? openMap[key] : defaultOpen;
    if (isDir) {
      return React.createElement("div", null,
        React.createElement("div", {
          className: "tree-row", style: { paddingLeft: 6 + depth * 14 }, onClick: () => toggle(key),
        },
          React.createElement("span", { className: "chev" }, React.createElement(isOpen ? Icons.ChevronDown : Icons.ChevronRight, { size: 14 })),
          React.createElement("span", { className: "ic", style: { color: "var(--accent)" } }, React.createElement(isOpen ? Icons.FolderOpen : Icons.Folder, { size: 15 })),
          React.createElement("span", { className: "nm" }, node.name)),
        isOpen && node.children.map((c, i) => React.createElement(TreeNode, {
          key: (c.path || c.name) + i, node: c, depth: depth + 1, openMap, toggle, activePath, onOpen, defaultOpen, selPath, setSelPath,
        })));
    }
    return React.createElement("div", {
      className: "tree-row" + (activePath === node.path || selPath === node.path ? " sel" : ""), style: { paddingLeft: 6 + depth * 14 + 16 },
      onClick: () => setSelPath && setSelPath(node.path),
      onDoubleClick: () => onOpen(node.path),
      title: "더블클릭으로 열기",
    },
      React.createElement(FileDot, { path: node.path }),
      React.createElement("span", { className: "nm" }, node.name),
      node.git && React.createElement("span", { className: "git-tag git-" + node.git }, node.git));
  }

  function FileTree({ tree, activePath, onOpen }) {
    const [openMap, setOpenMap] = useState({});
    const [selPath, setSelPath] = useState("");
    const toggle = (k) => setOpenMap((m) => ({ ...m, [k]: m[k] !== undefined ? !m[k] : false }));
    return React.createElement("div", { className: "side-body scroll", style: { paddingTop: 4, paddingBottom: 8 } },
      (tree.children || []).map((c, i) => React.createElement(TreeNode, {
        key: (c.path || c.name) + i, node: c, depth: 0, openMap, toggle, activePath, onOpen, defaultOpen: true, selPath, setSelPath,
      })));
  }

  // ===================== ANDROID VIEW =====================
  // A logical projection of the project (modules → manifests/kotlin+java/res…).
  // Falls back to the physical FileTree when the folder isn't a Gradle project.

  function AndroidFileIcon({ fileKind, path }) {
    const badge = (bg, ch) => React.createElement("span", { className: "ic", style: { width: 16, justifyContent: "center" } },
      React.createElement("span", {
        style: {
          width: 14, height: 14, borderRadius: 3, background: bg, color: "#fff",
          fontSize: 9, fontWeight: 700, lineHeight: 1, fontFamily: "var(--ui)",
          display: "flex", alignItems: "center", justifyContent: "center",
        },
      }, ch));
    if (fileKind === "kotlin") return badge("#7f63f4", "K");
    if (fileKind === "java") return badge("#e8743b", "J");
    if (fileKind === "manifest") return badge("#58c98b", "M");
    return React.createElement(FileDot, { path: path || "" });
  }

  function AndroidRow({ node, depth, nodeKey, openMap, toggle, activePath, onOpen, selPath, setSelPath, defaultOpen }) {
    if (node.kind === "file") {
      return React.createElement("div", {
        className: "tree-row" + (activePath === node.path || selPath === node.path ? " sel" : ""),
        style: { paddingLeft: 6 + depth * 14 + 16 },
        onClick: () => setSelPath && setSelPath(node.path),
        onDoubleClick: () => node.path && onOpen(node.path),
        title: "더블클릭으로 열기",
      },
        React.createElement(AndroidFileIcon, { fileKind: node.fileKind, path: node.path }),
        React.createElement("span", { className: "nm" }, node.label));
    }
    const children = node.children || [];
    const isOpen = openMap[nodeKey] !== undefined ? openMap[nodeKey] : defaultOpen;
    const iconColor = node.kind === "module" ? "#3ddc84" : node.kind === "package" ? "var(--tx-3)" : "var(--accent)";
    const IconCmp = node.kind === "module" ? Icons.Module : (isOpen ? Icons.FolderOpen : Icons.Folder);
    return React.createElement("div", null,
      React.createElement("div", {
        className: "tree-row", style: { paddingLeft: 6 + depth * 14 },
        onClick: () => children.length && toggle(nodeKey, isOpen),
      },
        React.createElement("span", { className: "chev" },
          children.length ? React.createElement(isOpen ? Icons.ChevronDown : Icons.ChevronRight, { size: 14 }) : null),
        React.createElement("span", { className: "ic", style: { color: iconColor } }, React.createElement(IconCmp, { size: 15 })),
        React.createElement("span", { className: "nm" }, node.label)),
      isOpen && children.map((c, i) => {
        const ck = c.path || (nodeKey + "|" + c.label);
        return React.createElement(AndroidRow, {
          key: ck + i, node: c, depth: depth + 1, nodeKey: ck, openMap, toggle,
          activePath, onOpen, selPath, setSelPath, defaultOpen: false,
        });
      }));
  }

  function AndroidTree({ tree, activePath, onOpen }) {
    const [openMap, setOpenMap] = useState({});
    const [selPath, setSelPath] = useState("");
    const toggle = useCallback((k, cur) => setOpenMap((m) => ({ ...m, [k]: !cur })), []);
    const nodes = useMemo(() => buildAndroidView(tree), [tree]);

    // Not a Gradle project → reuse the physical tree so the panel stays usable.
    if (!nodes) return React.createElement(FileTree, { tree, activePath, onOpen });

    const single = nodes.length === 1;
    return React.createElement("div", { className: "side-body scroll", style: { paddingTop: 4, paddingBottom: 8 } },
      nodes.map((n, i) => {
        const ck = n.path || ("root|" + n.label);
        return React.createElement(AndroidRow, {
          key: ck + i, node: n, depth: 0, nodeKey: ck, openMap, toggle,
          activePath, onOpen, selPath, setSelPath, defaultOpen: single,
        });
      }));
  }

  // ===================== VIEW SELECTOR (Android / Project) =====================
  function ViewSelector({ view, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
    }, []);
    const labelOf = (v) => (v === "android" ? "Android" : "Project");
    return React.createElement("div", { className: "view-sel", ref },
      React.createElement("button", { className: "view-btn", onClick: () => setOpen((o) => !o) },
        React.createElement("span", null, labelOf(view)),
        React.createElement(Icons.ChevronDown, { size: 12 })),
      open && React.createElement("div", { className: "view-menu" },
        ["android", "project"].map((v) => React.createElement("div", {
          key: v, className: "view-item" + (v === view ? " sel" : ""),
          onClick: () => { onChange(v); setOpen(false); },
        },
          React.createElement("span", { className: "nm" }, labelOf(v)),
          v === view && React.createElement(Icons.Check, { size: 14, style: { marginLeft: "auto", color: "var(--accent)" } })))));
  }

  // ===================== CODE VIEW + FIND =====================
  function CodeView({ path, content, wrap, highlightLine, errorLine, find, scrollRef }) {
    const lines = useMemo(() => content.split("\n"), [content]);
    const htmlLines = useMemo(() => {
      // highlight whole then split keeps token context; instead highlight per-file
      const full = E.highlight(path, content);
      return full.split("\n");
    }, [path, content]);

    return React.createElement("div", { className: "code" },
      lines.map((_, i) => {
        const n = i + 1;
        let cls = "code-line";
        if (highlightLine === n) cls += " hl";
        if (errorLine === n) cls += " err-line";
        return React.createElement("div", { key: n, className: cls, "data-line": n },
          React.createElement("span", { className: "ln" }, n),
          React.createElement("span", { className: "lc", dangerouslySetInnerHTML: { __html: htmlLines[i] || "&nbsp;" } }));
      }));
  }

  // Android-Studio-style in-editor find/replace toolbar. Drives the CodeMirror
  // view directly via the cmSearch engine (live all-match highlight, real
  // navigation, regex/case/word toggles). `getView` returns the live EditorView.
  function EditorSearchBar({ getView, mode, onClose, onSetMode }) {
    const [q, setQ] = useState("");
    const [rep, setRep] = useState("");
    const [cs, setCs] = useState(false);
    const [ww, setWw] = useState(false);
    const [rx, setRx] = useState(false);
    const [stat, setStat] = useState({ count: 0, index: -1 });
    const findRef = useRef(null);
    const query = useMemo(() => ({ search: q, caseSensitive: cs, wholeWord: ww, regexp: rx }), [q, cs, ww, rx]);

    // Seed the field from the current selection (AS behavior) + focus on open.
    useEffect(() => {
      const v = getView();
      if (v) {
        const sel = v.state.selection.main;
        if (!sel.empty) { const s = v.state.sliceDoc(sel.from, sel.to); if (s && s.indexOf("\n") < 0) setQ(s); }
      }
      const el = findRef.current; if (el) { el.focus(); el.select(); }
    }, []);

    // Clear the match highlight whenever the bar unmounts — covers closing via
    // Esc at the window level, tab switches, etc. (not just the close button).
    useEffect(() => () => { const v = getView(); if (v) CM.applyQuery(v, null); }, []);

    // Re-highlight + recount whenever the query/options change.
    useEffect(() => {
      const v = getView(); if (!v) return;
      CM.applyQuery(v, q ? query : null);
      setStat(CM.countAndIndex(v, q ? query : null));
    }, [query]);

    const recount = () => { const v = getView(); if (v) setStat(CM.countAndIndex(v, q ? query : null)); };
    const next = () => { const v = getView(); if (v && q) { CM.findNext(v, query); recount(); } };
    const prev = () => { const v = getView(); if (v && q) { CM.findPrev(v, query); recount(); } };
    const replaceOne = () => { const v = getView(); if (v && q) { CM.replaceCurrent(v, query, rep); CM.applyQuery(v, query); recount(); } };
    const replaceEvery = () => { const v = getView(); if (v && q) { CM.replaceAll(v, query, rep); CM.applyQuery(v, query); recount(); } };
    const close = () => { const v = getView(); if (v) CM.applyQuery(v, null); onClose(); };

    const noRes = !!q && stat.count === 0;
    const countLabel = !q ? "" : noRes ? "결과 없음" : (stat.index >= 0 ? `${stat.index + 1}/${stat.count}` : `${stat.count}건`);
    const toggle = (active, label, title, on) => React.createElement("button", {
      className: "es-toggle" + (active ? " on" : ""), title, tabIndex: -1, onClick: on,
    }, label);

    return React.createElement("div", { className: "ed-search" },
      React.createElement("div", { className: "es-row" },
        React.createElement("button", {
          className: "es-expand", title: mode === "replace" ? "바꾸기 접기" : "바꾸기 (⌘R)",
          onClick: () => onSetMode(mode === "replace" ? "find" : "replace"),
        }, React.createElement(mode === "replace" ? Icons.ChevronDown : Icons.ChevronRight, { size: 14 })),
        React.createElement("div", { className: "es-field" + (noRes ? " err" : "") },
          React.createElement("input", {
            ref: findRef, className: "es-input", placeholder: "찾기", value: q, spellCheck: false,
            onChange: (e) => setQ(e.target.value),
            onKeyDown: (e) => {
              if (e.key === "Enter") { e.preventDefault(); e.shiftKey ? prev() : next(); }
              else if (e.key === "Escape") { e.preventDefault(); close(); }
            },
          }),
          toggle(cs, "Aa", "대소문자 구분 (Match Case)", () => setCs((x) => !x)),
          toggle(ww, "W", "단어 단위 (Words)", () => setWw((x) => !x)),
          toggle(rx, ".*", "정규식 (Regex)", () => setRx((x) => !x))),
        React.createElement("span", { className: "es-count" + (noRes ? " err" : "") }, countLabel),
        React.createElement("button", { className: "es-nav", title: "이전 (⇧Enter)", disabled: !stat.count, onClick: prev },
          React.createElement(Icons.ChevronRight, { size: 15, style: { transform: "rotate(-90deg)" } })),
        React.createElement("button", { className: "es-nav", title: "다음 (Enter)", disabled: !stat.count, onClick: next },
          React.createElement(Icons.ChevronRight, { size: 15, style: { transform: "rotate(90deg)" } })),
        React.createElement("div", { className: "es-spacer" }),
        React.createElement("button", { className: "es-close", title: "닫기 (Esc)", onClick: close }, React.createElement(Icons.X, { size: 15 }))),
      mode === "replace" && React.createElement("div", { className: "es-row" },
        React.createElement("span", { className: "es-expand" }),
        React.createElement("div", { className: "es-field" },
          React.createElement("input", {
            className: "es-input", placeholder: "바꾸기", value: rep, spellCheck: false,
            onChange: (e) => setRep(e.target.value),
            onKeyDown: (e) => { if (e.key === "Enter") { e.preventDefault(); replaceOne(); } else if (e.key === "Escape") { e.preventDefault(); close(); } },
          })),
        React.createElement("button", { className: "es-btn", disabled: !stat.count, onClick: replaceOne }, "바꾸기"),
        React.createElement("button", { className: "es-btn", disabled: !stat.count, onClick: replaceEvery }, "모두 바꾸기"),
        React.createElement("div", { className: "es-spacer" })));
  }

  // ===================== EDITOR (tabs + body) =====================
  function Editor(props) {
    const { tabs, activeTab, onActivate, onClose, contents, wrap, highlightLine, errorLine,
      findMode, onCloseFind, onSetFindMode, dirty, onChangeContent, diffs, liveContents, projectRoot } = props;
    const scrollRef = useRef(null);
    const viewRef = useRef(null);
    const getView = useCallback(() => viewRef.current, []);
    // 탭별 Code/Split/Design 모드 (레이아웃 XML에서만 의미). das.viewModes 맵으로 보존.
    const [viewModes, setViewModes] = useState/* @type Record<string,string> */(() => {
      try { return JSON.parse(localStorage.getItem("das.viewModes") || "{}"); } catch (_) { return {}; }
    });
    useEffect(() => {
      try { localStorage.setItem("das.viewModes", JSON.stringify(viewModes)); } catch (_) {}
    }, [viewModes]);

    // Stable handler so CodeMirror doesn't reconfigure its update listener every keystroke.
    const handleChange = useCallback((v) => onChangeContent && onChangeContent(activeTab, v), [onChangeContent, activeTab]);

    // scroll to highlight/error line when it changes
    useEffect(() => {
      const target = errorLine || highlightLine;
      if (target && scrollRef.current) {
        const el = scrollRef.current.querySelector(`[data-line="${target}"]`);
        if (el) el.scrollIntoView({ block: "center" });
      }
    }, [highlightLine, errorLine, activeTab]);

    if (!tabs.length) {
      return React.createElement("div", { className: "editor-area" },
        React.createElement("div", { className: "empty-editor" },
          React.createElement(Icons.File, { size: 46, sw: 1.25 }),
          React.createElement("div", { style: { fontSize: 14, color: "var(--tx-3)" } }, "열린 파일이 없습니다"),
          React.createElement("div", { className: "kbd" }, "빠른 열기", React.createElement("kbd", null, "⌘"), React.createElement("kbd", null, "P"))));
    }
    const isDiff = activeTab.startsWith("diff:");
    const realPath = isDiff ? activeTab.slice(5) : activeTab;
    // Prefer the live (ref) content so a tab switch seeds the editor with the
    // most recent edits even though `contents` state is only synced on a debounce.
    const liveVal = liveContents ? liveContents.current[activeTab] : undefined;
    const content = liveVal != null
      ? liveVal
      : (contents[activeTab] != null ? contents[activeTab] : (D.FILES[realPath] || ""));
    // A real file whose content hasn't been read yet — show a skeleton instead of
    // an empty editor, so CodeMirror mounts ONCE with the real text (no empty→full
    // re-parse, no empty-editor flash) the moment the read resolves.
    const loading = !isDiff && realPath.startsWith("/") && liveVal == null && contents[activeTab] == null;
    const crumbs = realPath.split("/");
    const layoutEligible = isLayoutXml(realPath, content);
    const viewMode = (layoutEligible && viewModes[realPath]) || "code";
    const setViewMode = (m) => setViewModes((s) => ({ ...s, [realPath]: m }));

    const [previewFiles, setPreviewFiles] = useState({}); // { [absPath]: filesMap }
    useEffect(() => {
      if (!projectRoot || !(layoutEligible && realPath.startsWith("/"))) return;
      if (previewFiles[realPath]) return;
      let cancelled = false;
      const listFilesAbs = async (dir) => (await listFiles(dir)).map((p) =>
        p.startsWith("/") ? p : dir.replace(/\/$/, "") + "/" + p);
      buildResFiles(realPath, content, { listFiles: listFilesAbs, readFile })
        .then((map) => { if (!cancelled && map && Object.keys(map).length)
          setPreviewFiles((m) => ({ ...m, [realPath]: map })); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [layoutEligible, realPath, projectRoot]); // content intentionally omitted: ref scan is stable per file
    const previewFilesMap =
      (realPath.startsWith("/") && previewFiles[realPath]) || D.FILES;

    return React.createElement("div", { className: "editor-area" },
      React.createElement("div", { className: "tabstrip-row" },
        React.createElement("div", { className: "tabstrip scroll" },
          tabs.map((t) => {
            const td = t.startsWith("diff:");
            const rp = td ? t.slice(5) : t;
            const name = rp.split("/").pop() + (td ? " \u27f7" : "");
            return React.createElement("div", { key: t, className: "tab" + (t === activeTab ? " active" : ""), onClick: () => onActivate(t) },
              React.createElement(FileDot, { path: rp }),
              React.createElement("span", { className: "lbl" }, name),
              dirty[t]
                ? React.createElement("span", { className: "cls", onClick: (e) => { e.stopPropagation(); onClose(t); } }, React.createElement("span", { className: "dirty" }))
                : React.createElement("span", { className: "cls", onClick: (e) => { e.stopPropagation(); onClose(t); } }, React.createElement(Icons.X, { size: 13 })));
          })),
        layoutEligible && React.createElement("div", { className: "view-toggle" },
          ["code", "split", "design"].map((m) =>
            React.createElement("button", {
              key: m,
              className: "vt-btn" + (viewMode === m ? " on" : ""),
              onClick: () => setViewMode(m),
            }, m === "code" ? "Code" : m === "split" ? "Split" : "Design")))),
      findMode && !isDiff && React.createElement(EditorSearchBar, { getView, mode: findMode, onClose: onCloseFind, onSetMode: onSetFindMode }),
      React.createElement("div", { className: "editor-scroll scroll" + (wrap ? " wrap" : ""), ref: scrollRef },
        React.createElement("div", { className: "breadcrumb" },
          crumbs.map((c, i) => React.createElement(React.Fragment, { key: i },
            i > 0 && React.createElement(Icons.ChevronRight, { size: 12, className: "sep" }),
            React.createElement("span", { style: i === crumbs.length - 1 ? { color: "var(--tx-1)" } : null }, c)))),
        isDiff
          ? React.createElement(DiffView, { path: realPath, diff: diffs && diffs[realPath] })
          : viewMode === "design"
            ? React.createElement(LayoutPreview, { xml: content, files: previewFilesMap })
            : viewMode === "split"
              ? React.createElement("div", { className: "split-pane" },
                  React.createElement("div", { className: "split-code" },
                    React.createElement(CodeEditor, { path: realPath, value: content, gotoLine: errorLine || highlightLine, onChange: handleChange, onView: (v) => { viewRef.current = v; } })),
                  React.createElement("div", { className: "split-preview" },
                    React.createElement(LayoutPreview, { xml: content, files: previewFilesMap })))
              : loading
                ? React.createElement("div", { style: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-3)", fontSize: 13, fontFamily: "var(--ui)" } }, "여는 중…")
                : React.createElement(CodeEditor, { path: realPath, value: content, gotoLine: errorLine || highlightLine, onChange: handleChange, onView: (v) => { viewRef.current = v; } })));
  }

  // Memoize the heavy/stable subtrees so a parent re-render on every keystroke
  // (App holds editor content state) does NOT re-render the file tree, device
  // selector, or the editor shell unless their own props actually change.
  const FileTreeMemo = React.memo(FileTree);
  const AndroidTreeMemo = React.memo(AndroidTree);
  const DeviceSelectorMemo = React.memo(DeviceSelector);
  const VariantSelectorMemo = React.memo(VariantSelector);
  const EditorMemo = React.memo(Editor);
  export { EditorMemo as Editor, FileTreeMemo as FileTree, AndroidTreeMemo as AndroidTree, ViewSelector, DeviceSelectorMemo as DeviceSelector, VariantSelectorMemo as VariantSelector, FileDot, extColor };
