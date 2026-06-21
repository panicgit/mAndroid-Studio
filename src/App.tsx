import React from "react";
import { Icons } from "./components/icons";
import * as E from "./lib/engine";
import * as ED from "./components/editor";
import * as PN from "./components/panels";
import * as D from "./lib/data";
import { Channel } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { startLogcat, stopLogcat } from "./ipc/logcat";
import { listDevices, deployVariant, adbLs, adbPull } from "./ipc/device";
import { gitStatus, gitDiff } from "./ipc/git";
import { save } from "@tauri-apps/plugin-dialog";
import { readTree, listFiles, pickFolder } from "./ipc/fs";
import { readFile, writeFile } from "./ipc/file";
import { FindInPath, SearchEverywhere } from "./components/searchDialogs";
import { runGradle, stopGradle, listBuildVariants } from "./ipc/gradle";
import { detectEnv } from "./ipc/env";
/* DAS — main shell: state wiring, activity bar, bottom panel, status bar, tweaks */

  const { useState, useEffect, useRef, useCallback, useMemo } = React;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "dark",
    "accent": "#1D99FF",
    "density": "compact",
    "uiFont": 13,
    "codeFont": 13,
    "wrap": false,
    "winChrome": true
  }/*EDITMODE-END*/;

  const ACCENTS = { "#1D99FF": ["#1D99FF", "#008CFF", "#163BD8"], "#7f63f4": ["#7f63f4", "#6a4cf0", "#5638d6"], "#58c98b": ["#58c98b", "#2eb673", "#1f9a5e"], "#f5a623": ["#f5a623", "#e8920a", "#c97a00"] };
  const DENSITY = { compact: { row: 24, log: 21 }, regular: { row: 28, log: 24 }, comfy: { row: 32, log: 28 } };

  function App() {
    const t = TWEAK_DEFAULTS;

    // ---- project ----
    const [projectRoot, setProjectRoot] = useState("");
    const [tree, setTree] = useState(null);
    const [files, setFiles] = useState([]);
    const projectName = projectRoot ? (projectRoot.split("/").filter(Boolean).pop() || projectRoot) : "";
    const loadProject = useCallback((root) => {
      setProjectRoot(root);
      try { localStorage.setItem("das.projectRoot", root); } catch (_) {}
      readTree(root).then(setTree).catch(() => setTree(null));
      listFiles(root).then(setFiles).catch(() => setFiles([]));
    }, []);
    const openFolder = useCallback(() => {
      pickFolder().then((p) => { if (p) loadProject(p); }).catch(() => {});
    }, [loadProject]);

    // apply theme + tweak vars
    useEffect(() => {
      const r = document.documentElement;
      r.setAttribute("data-theme", t.theme);
      const acc = ACCENTS[t.accent] || ACCENTS["#1D99FF"];
      r.style.setProperty("--accent", acc[0]);
      r.style.setProperty("--accent-700", acc[1]);
      r.style.setProperty("--accent-900", acc[2]);
      const den = DENSITY[t.density] || DENSITY.compact;
      r.style.setProperty("--row-h", den.row + "px");
      r.style.setProperty("--log-row-h", den.log + "px");
      r.style.setProperty("--ui-fs", t.uiFont + "px");
      r.style.setProperty("--code-fs", t.codeFont + "px");
    }, [t.theme, t.accent, t.density, t.uiFont, t.codeFont]);

    // ---- editor state ----
    const [activity, setActivity] = useState("files");
    // file explorer view mode: "android" (logical) | "project" (physical)
    const [fileView, setFileView] = useState(() => {
      try { return localStorage.getItem("das.fileView") || "android"; } catch (_) { return "android"; }
    });
    const changeFileView = useCallback((v) => {
      setFileView(v);
      try { localStorage.setItem("das.fileView", v); } catch (_) {}
    }, []);
    const [tabs, setTabs] = useState([]);
    const [activeTab, setActiveTab] = useState("");
    const [contents, setContents] = useState({});
    const [dirty, setDirty] = useState({});
    const [findMode, setFindMode] = useState(null); // null | "find" | "replace" — in-editor bar
    const [findInPathMode, setFindInPathMode] = useState(null); // null | "find" | "replace" — modal
    const [seOpen, setSeOpen] = useState(false); // Search Everywhere overlay
    const [highlightLine, setHighlightLine] = useState(null);
    const [errorLine, setErrorLine] = useState(null);
    const [paletteOpen, setPaletteOpen] = useState(false);

    const openFile = useCallback((path, line) => {
      setTabs((ts) => ts.includes(path) ? ts : [...ts, path]);
      setActiveTab(path);
      setErrorLine(null);
      if (line) { setHighlightLine(line); setTimeout(() => setHighlightLine((l) => l === line ? l : l), 0); }
      else setHighlightLine(null);
    }, []);

    // Load real file content for the active tab once; edits are kept thereafter.
    useEffect(() => {
      const p = activeTab;
      if (!p || !p.startsWith("/") || contents[p] != null) return;
      let live = true;
      readFile(p).then((txt) => { if (live) { liveContents.current[p] = txt; setContents((c) => ({ ...c, [p]: txt })); } }).catch(() => {});
      return () => { live = false; };
    }, [activeTab, contents]);

    // Live, per-file content lives in a ref so typing NEVER triggers an App
    // re-render. The dominant ~50ms/keystroke cost (measured) was the controlled
    // round-trip: contents-state -> whole-App render -> value flows back to the
    // editor. The editor (CodeMirror) is now the source of truth; App only
    // (a) flags dirty once per file, and (b) syncs the visible `contents` state
    // on a 300ms debounce for Find/Replace/display.
    const liveContents = useRef({});
    const syncTimer = useRef(null);
    const onChangeContent = useCallback((path, val) => {
      liveContents.current[path] = val;
      setDirty((d) => (d[path] ? d : { ...d, [path]: true })); // bails after 1st edit -> no render
      if (syncTimer.current) clearTimeout(syncTimer.current);
      syncTimer.current = setTimeout(() => {
        syncTimer.current = null;
        const v = liveContents.current[path];
        setContents((c) => (c[path] === v ? c : { ...c, [path]: v }));
      }, 300);
    }, []);

    const closeFind = useCallback(() => setFindMode(null), []);

    // After a project-wide Replace All, re-read any changed files that are open
    // so editor buffers don't go stale.
    const onFilesChanged = useCallback((absPaths) => {
      for (const p of absPaths) {
        readFile(p).then((txt) => {
          liveContents.current[p] = txt;
          setContents((c) => ({ ...c, [p]: txt }));
          setDirty((d) => (d[p] ? { ...d, [p]: false } : d));
        }).catch(() => {});
      }
    }, []);

    const saveActive = useCallback(() => {
      const p = activeTab;
      if (!p || !p.startsWith("/")) return;
      // Always write the editor's CURRENT content (live ref), never the debounced
      // state copy, so a quick type-then-save can't drop the last keystrokes.
      const txt = liveContents.current[p] != null ? liveContents.current[p] : contents[p];
      if (txt == null) return;
      writeFile(p, txt).then(() => setDirty((d) => ({ ...d, [p]: false }))).catch(() => {});
    }, [activeTab, contents]);

    const [jdkPath, setJdkPath] = useState(null);
    useEffect(() => { detectEnv().then((e) => setJdkPath(e.jdkPath)).catch(() => {}); }, []);

    // session restore (folder + open tabs) — survives reloads/dev rebuilds
    useEffect(() => {
      try {
        const root = localStorage.getItem("das.projectRoot");
        if (root) loadProject(root);
        const savedTabs = JSON.parse(localStorage.getItem("das.tabs") || "[]");
        if (Array.isArray(savedTabs) && savedTabs.length) {
          setTabs(savedTabs);
          const a = localStorage.getItem("das.activeTab");
          if (a) setActiveTab(a);
        }
      } catch (_) {}
    }, [loadProject]);
    useEffect(() => {
      try {
        localStorage.setItem("das.tabs", JSON.stringify(tabs));
        localStorage.setItem("das.activeTab", activeTab);
      } catch (_) {}
    }, [tabs, activeTab]);

    const openDiff = useCallback((path) => {
      const key = "diff:" + path;
      setTabs((ts) => ts.includes(key) ? ts : [...ts, key]);
      setActiveTab(key);
      if (projectRoot) gitDiff(projectRoot, path).then((d) => setDiffs((m) => ({ ...m, [path]: d }))).catch(() => {});
    }, [projectRoot]);

    const closeTab = useCallback((path) => {
      setTabs((ts) => {
        const ni = ts.filter((x) => x !== path);
        setActiveTab((cur) => cur === path ? (ni[ni.length - 1] || "") : cur);
        return ni;
      });
    }, []);

    // ---- device ----
    const [devices, setDevices] = useState([]);
    // Multi-select run targets (AS "Select Multiple Devices"). Build/Run deploys to
    // every selected device; the first one is the "primary" used by single-device
    // features (logcat, file browser, status bar).
    const [selectedDevices, setSelectedDevices] = useState([]);
    const device = selectedDevices[0] || "";
    const deviceObj = devices.find((d) => d.id === device) || devices[0] || { id: "", label: "기기 없음", android: "", type: "phone", state: "offline" };
    const devInit = useRef(false);
    const toggleDevice = useCallback((id) => {
      setSelectedDevices((sel) => sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
    }, []);
    // Poll the device list so it self-heals from a transient cold-start error and
    // reflects devices being plugged in / unplugged live (like AS). Selections are
    // pruned to still-connected devices; a sensible default is auto-picked once, but
    // a deliberate empty selection is respected thereafter.
    useEffect(() => {
      let live = true;
      const load = () => listDevices().then((ds) => {
        if (!live) return;
        setDevices(ds);
        setSelectedDevices((sel) => {
          const present = sel.filter((id) => ds.some((d) => d.id === id));
          if (present.length) { devInit.current = true; return present.length === sel.length ? sel : present; }
          if (!devInit.current) {
            const first = ds.find((d) => d.state === "device") || ds[0];
            if (first) { devInit.current = true; return [first.id]; }
          }
          return present.length === sel.length ? sel : present;
        });
      }).catch(() => {});
      load();
      const iv = setInterval(load, 4000);
      return () => { live = false; clearInterval(iv); };
    }, []);

    // ---- bottom panel ---- (logcat hidden by default; opens on demand / on build)
    const [bottomTab, setBottomTab] = useState("logcat");
    const [bottomOpen, setBottomOpen] = useState(false);
    const [poppedOut, setPoppedOut] = useState(false); // logcat detached into its own window

    // ---- build ----
    const [buildLines, setBuildLines] = useState([]);
    const [building, setBuilding] = useState(false);
    const [buildStatus, setBuildStatus] = useState(null); // 'ok' | 'fail' | null
    const buildTimer = useRef(null);

    // ---- build variants (AS "Build Variants": module × flavor/buildType) ----
    const [modules, setModules] = useState([]);   // ModuleVariants[]
    const [variant, setVariant] = useState(null); // { module, variant } | null
    useEffect(() => {
      if (!projectRoot) { setModules([]); setVariant(null); return; }
      listBuildVariants(projectRoot).then((ms) => {
        setModules(ms);
        let next = null;
        try {
          const raw = localStorage.getItem("das.variant:" + projectRoot);
          if (raw) { const s = JSON.parse(raw); if (ms.some((m) => m.gradlePath === s.module && m.variants.includes(s.variant))) next = s; }
        } catch (_) {}
        if (!next && ms.length) {
          const m = ms[0];
          const v = m.variants.find((x) => /Debug$/.test(x)) || (m.variants.includes("debug") ? "debug" : m.variants[0]);
          if (v) next = { module: m.gradlePath, variant: v };
        }
        setVariant(next);
      }).catch(() => { setModules([]); setVariant(null); });
    }, [projectRoot]);
    const selectVariant = useCallback((sel) => {
      setVariant(sel);
      try { localStorage.setItem("das.variant:" + projectRoot, JSON.stringify(sel)); } catch (_) {}
    }, [projectRoot]);

    const runBuild = useCallback((fail, run) => {
      if (building || !projectRoot) return;
      setBottomTab("build"); setBottomOpen(true); setBuildLines([]); setBuilding(true); setBuildStatus(null);
      const ch = new Channel();
      ch.onmessage = (ev) => {
        setBuildLines((ls) => [...ls, ev]);
        if (ev.cls === "ok") setBuildStatus("ok");
        else if (ev.t && (ev.t.indexOf("BUILD FAILED") >= 0 || ev.t.indexOf("FAILURE:") >= 0)) setBuildStatus("fail");
      };
      // With a known variant we always *assemble* the APK, then (for Run) deploy
      // it to exactly the selected devices via adb. Gradle's own install* task is
      // avoided because it installs to EVERY connected device. The bare-task
      // fallback only applies when no variant could be detected (non-Android).
      const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
      const qualify = (verb) => (variant.module ? variant.module + ":" : "") + verb + cap(variant.variant);
      const task = variant ? qualify("assemble") : (run ? "installDebug" : "assembleDebug");
      runGradle(projectRoot, task, jdkPath, ch)
        .then(() => {
          setBuilding(false);
          if (!run || !variant) return;
          const targets = devices.filter((d) => selectedDevices.includes(d.id) && d.state === "device");
          if (!targets.length) {
            setBuildLines((ls) => [...ls, { t: "▶ 선택된 연결 기기가 없습니다 — 우상단에서 대상 기기를 선택하세요", cls: "err" }]);
            return;
          }
          targets.forEach((d) => {
            setBuildLines((ls) => [...ls, { t: `▶ ${d.label}에 설치 중…`, cls: "dim" }]);
            deployVariant(d.id, projectRoot, variant.module, variant.variant)
              .then((pkg) => setBuildLines((ls) => [...ls, { t: `▶ ${d.label} 실행됨 · ${pkg}`, cls: "dim" }]))
              .catch((e) => setBuildLines((ls) => [...ls, { t: `▶ ${d.label} 배포 실패: ${String(e)}`, cls: "err" }]));
          });
          setTimeout(() => setBottomTab("logcat"), 800);
        })
        .catch((e) => { setBuildLines((ls) => [...ls, { t: "> " + String(e), cls: "err" }]); setBuilding(false); setBuildStatus("fail"); });
    }, [building, projectRoot, jdkPath, variant, selectedDevices, devices]);

    const jumpToError = useCallback((err) => {
      openFile(err.path);
      setActiveTab(err.path);
      setTabs((ts) => ts.includes(err.path) ? ts : [...ts, err.path]);
      setTimeout(() => setErrorLine(err.line), 30);
    }, [openFile]);

    // ---- logcat ----
    const [logLines, setLogLines] = useState([]);
    const clearLog = useCallback(() => setLogLines([]), []);
    const [levels, setLevels] = useState({ V: false, D: true, I: true, W: true, E: true });
    const [logFilter, setLogFilter] = useState("");
    const [paused, setPaused] = useState(false);
    const [autoscroll, setAutoscroll] = useState(true);
    const [pidOnly, setPidOnly] = useState(false);
    const CAP = 8000;
    const pendingRef = useRef([]);
    // Only render logcat into React state while the panel is actually visible.
    // When hidden, lines still accumulate in pendingRef (bounded) but we skip the
    // 200ms setState so a streaming device never re-renders the app in the bg.
    const logVisRef = useRef(false);
    useEffect(() => { logVisRef.current = bottomOpen && bottomTab === "logcat" && !poppedOut; }, [bottomOpen, bottomTab, poppedOut]);
    useEffect(() => {
      if (!device || paused || poppedOut) return; // popped-out window owns the stream
      let cancelled = false;
      pendingRef.current = [];
      const ch = new Channel();
      ch.onmessage = (batch) => {
        if (cancelled) return;
        const p = pendingRef.current;
        p.push(...batch);
        if (p.length > CAP) pendingRef.current = p.slice(-CAP); // bound buffer while hidden
      };
      const flush = setInterval(() => {
        if (cancelled || !logVisRef.current || pendingRef.current.length === 0) return;
        const incoming = pendingRef.current;
        pendingRef.current = [];
        setLogLines((ls) => {
          const next = ls.concat(incoming);
          return next.length > CAP ? next.slice(next.length - CAP) : next;
        });
      }, 200);
      startLogcat(device, undefined, ch).catch(() => {});
      return () => { cancelled = true; clearInterval(flush); stopLogcat().catch(() => {}); };
    }, [device, paused, poppedOut]);
    // Flush buffered lines the moment the panel becomes visible.
    useEffect(() => {
      if (bottomOpen && bottomTab === "logcat" && pendingRef.current.length) {
        const incoming = pendingRef.current;
        pendingRef.current = [];
        setLogLines((ls) => { const next = ls.concat(incoming); return next.length > CAP ? next.slice(next.length - CAP) : next; });
      }
    }, [bottomOpen, bottomTab]);

    // Detach logcat into its own window; main window then stops its own stream
    // (single "logcat" child in Rust) and resumes when the popout is closed.
    const popOutLogcat = useCallback(async () => {
      try {
        const existing = await WebviewWindow.getByLabel("logcat");
        if (existing) { try { await existing.setFocus(); } catch (_) {} setPoppedOut(true); setBottomOpen(false); return; }
        const w = new WebviewWindow("logcat", {
          url: "index.html?view=logcat" + (device ? "&device=" + encodeURIComponent(device) : ""),
          title: "mAndroid Studio · Logcat", width: 960, height: 580,
        });
        w.once("tauri://created", () => { setPoppedOut(true); setBottomOpen(false); });
        w.once("tauri://destroyed", () => setPoppedOut(false));
        w.once("tauri://error", () => setPoppedOut(false));
      } catch (_) {}
    }, [device]);

    // ---- git ----
    const [gitInfo, setGitInfo] = useState(null);
    const [gitSel, setGitSel] = useState("");
    const [diffs, setDiffs] = useState({});
    useEffect(() => { if (projectRoot) gitStatus(projectRoot).then(setGitInfo).catch(() => setGitInfo(null)); else setGitInfo(null); }, [projectRoot]);
    // ---- adb files ----
    const [adbFiles, setAdbFiles] = useState([]);
    const [adbPath, setAdbPath] = useState("/sdcard");
    useEffect(() => { if (activity === "device" && device) adbLs(device, adbPath).then(setAdbFiles).catch(() => setAdbFiles([])); }, [activity, device, adbPath]);
    const adbNavigate = (name) => setAdbPath((p) => (p === "/" ? "" : p.replace(/\/$/, "")) + "/" + name);
    const adbUp = () => setAdbPath((p) => { const i = p.lastIndexOf("/"); return i > 0 ? p.slice(0, i) : "/"; });
    const adbRefresh = () => { if (device) adbLs(device, adbPath).then(setAdbFiles).catch(() => {}); };
    const adbPullFile = (name) => {
      const remote = (adbPath.endsWith("/") ? adbPath : adbPath + "/") + name;
      save({ defaultPath: name }).then((local) => { if (local && device) adbPull(device, remote, local).catch(() => {}); }).catch(() => {});
    };

    // ---- keyboard (Android-Studio key map) ----
    // ⌘F find · ⌘R replace · ⇧⌘F find-in-path · ⇧⌘R replace-in-path
    // ⌘B build · ⇧F10 run · ⌘S save · ⌘P go-to-file · Esc close overlays
    useEffect(() => {
      const h = (e) => {
        const meta = e.metaKey || e.ctrlKey;
        const shift = e.shiftKey;
        const k = e.key.toLowerCase();
        if (meta && shift && k === "f") { e.preventDefault(); setFindInPathMode("find"); }
        else if (meta && shift && k === "r") { e.preventDefault(); setFindInPathMode("replace"); }
        else if (meta && k === "f") { e.preventDefault(); setFindMode("find"); }
        else if (meta && k === "r") { e.preventDefault(); setFindMode("replace"); }
        else if (meta && k === "p") { e.preventDefault(); setPaletteOpen(true); }
        else if (meta && k === "s") { e.preventDefault(); saveActive(); }
        else if (meta && k === "b") { e.preventDefault(); runBuild(false, false); }
        else if (shift && e.key === "F10") { e.preventDefault(); runBuild(false, true); }
        else if (e.key === "Escape") { setPaletteOpen(false); setFindMode(null); setFindInPathMode(null); setSeOpen(false); }
      };
      window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
    }, [runBuild, saveActive]);

    // Double-Shift → Search Everywhere. Two Shift key-ups within 350ms with no
    // other key pressed in between (a non-Shift keydown disarms the gesture, so
    // typing capitals never triggers it).
    useEffect(() => {
      let lastUp = 0;
      const down = (e) => { if (e.key !== "Shift") lastUp = 0; };
      const up = (e) => {
        if (e.key !== "Shift") return;
        const now = Date.now();
        if (now - lastUp < 350) { lastUp = 0; setSeOpen(true); }
        else lastUp = now;
      };
      window.addEventListener("keydown", down, true);
      window.addEventListener("keyup", up, true);
      return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
    }, []);

    // activity bar config
    const acts = [
      { id: "files", icon: Icons.Files, label: "탐색기" },
      { id: "search", icon: Icons.Search, label: "검색" },
      { id: "git", icon: Icons.Git, label: "소스 컨트롤", badge: gitInfo ? gitInfo.changed.length + gitInfo.staged.length : 0 },
      { id: "device", icon: Icons.Smartphone, label: "디바이스 파일" },
    ];

    const sideTitle = { files: "탐색기" + (projectName ? " · " + projectName : ""), search: "검색", git: "소스 컨트롤", device: "디바이스 파일" }[activity];

    function renderSide() {
      if (activity === "files") return tree
        ? React.createElement(fileView === "android" ? ED.AndroidTree : ED.FileTree, { tree, activePath: activeTab.replace(/^diff:/, ""), onOpen: openFile })
        : React.createElement("div", { className: "empty-editor", style: { gap: 12, padding: 24 } },
            React.createElement("div", { style: { color: "var(--tx-3)", fontSize: 13 } }, "열린 폴더가 없습니다"),
            React.createElement("button", { className: "btn btn-run", onClick: openFolder }, React.createElement(Icons.Folder, { size: 14 }), "폴더 열기"));
      if (activity === "search") return React.createElement(PN.SearchPanel, { root: projectRoot, onOpenAt: (p, l) => { setActivity("files"); openFile(projectRoot + "/" + p, l); } });
      if (activity === "git") return React.createElement(PN.GitPanel, { git: gitInfo || { branch: "", ahead: 0, behind: 0, staged: [], changed: [] }, selected: gitSel, onSelect: (p) => { setGitSel(p); openDiff(p); }, onOpenDiff: openDiff });
      if (activity === "device") return React.createElement(PN.AdbFilesPanel, { files: adbFiles, deviceLabel: deviceObj.label, path: adbPath, onNavigate: adbNavigate, onUp: adbUp, onPull: adbPullFile, onRefresh: adbRefresh });
      return null;
    }

    // Memoized: this O(n) scan over the whole logcat ring buffer (up to 8000
    // lines) otherwise re-runs in App's render body on every keystroke.
    const errCount = useMemo(() => logLines.filter((l) => l.level === "E").length, [logLines]);

    // ---- resizable left panel ----
    // Width is driven by the `--side-w` CSS var (read by .sidepanel) so the drag
    // loop mutates ONE CSS variable per frame (rAF-throttled) instead of calling
    // setState on every mousemove — that would re-render the whole App per move.
    // React state holds the committed value only for persistence; commit on mouseup.
    const [sideW, setSideW] = useState(() => {
      try { const v = parseInt(localStorage.getItem("das.sideW") || "", 10); return Number.isFinite(v) && v >= 180 && v <= 560 ? v : 264; } catch (_) { return 264; }
    });
    const sideWRef = useRef(sideW);
    useEffect(() => {
      sideWRef.current = sideW;
      document.documentElement.style.setProperty("--side-w", sideW + "px");
      try { localStorage.setItem("das.sideW", String(sideW)); } catch (_) {}
    }, [sideW]);
    const startSideResize = useCallback((e) => {
      e.preventDefault();
      const ACT_W = 48; // activity bar width — side panel starts after it
      let raf = 0;
      let latest = sideWRef.current;
      const apply = () => { raf = 0; document.documentElement.style.setProperty("--side-w", latest + "px"); };
      const onMove = (ev) => {
        latest = Math.max(180, Math.min(560, ev.clientX - ACT_W));
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (raf) cancelAnimationFrame(raf);
        document.documentElement.style.setProperty("--side-w", latest + "px");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSideW(latest); // commit once: persists + keeps React state in sync
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    }, []);

    return React.createElement("div", { className: "win", style: t.winChrome ? null : { borderRadius: 0 } },
      // ---- TITLE BAR ----
      t.winChrome && React.createElement("div", { className: "titlebar", "data-tauri-drag-region": true, style: { paddingLeft: 78 } },
        React.createElement("div", { className: "tb-title", "data-tauri-drag-region": "deep" }, React.createElement("b", null, "mAndroid Studio"), projectName ? " — " + projectName : " — 열린 폴더 없음"),
        React.createElement("div", { className: "tb-spacer", "data-tauri-drag-region": "deep" }),
        React.createElement(ED.VariantSelector, { modules, selected: variant, onSelect: selectVariant }),
        React.createElement(ED.DeviceSelector, { devices, selected: selectedDevices, onToggle: toggleDevice }),
        React.createElement("div", { className: "tb-actions" },
          building
            ? React.createElement("button", { className: "btn btn-stop", onClick: () => { stopGradle().catch(() => {}); setBuilding(false); setBuildStatus(null); setBuildLines((l) => [...l, { t: "> 빌드 취소됨", cls: "err" }]); } }, React.createElement(Icons.X, { size: 14 }), "Stop")
            : React.createElement(React.Fragment, null,
              React.createElement("button", { className: "btn btn-ghost", onClick: () => runBuild(false, false), title: "⌘B" }, React.createElement(Icons.Hammer, { size: 14 }), "Build"),
              React.createElement("button", { className: "btn btn-run", onClick: () => runBuild(false, true), title: "⌘R" }, React.createElement(Icons.Play, { size: 14, fill: "currentColor" }), "Run")))),

      // ---- BODY ----
      React.createElement("div", { className: "body" },
        // activity bar
        React.createElement("div", { className: "activitybar" },
          acts.map((a) => React.createElement("div", {
            key: a.id, className: "act" + (activity === a.id ? " active" : ""), title: a.label,
            onClick: () => setActivity(a.id),
          }, React.createElement(a.icon, { size: 21 }), a.badge ? React.createElement("span", { className: "badge" }, a.badge) : null)),
          React.createElement("div", { className: "act-spacer" }),
          React.createElement("div", { className: "act", title: "logcat 토글", onClick: () => { setBottomTab("logcat"); setBottomOpen(true); } }, React.createElement(Icons.Terminal, { size: 21 }))),

        // side panel
        React.createElement("div", { className: "sidepanel" },
          React.createElement("div", { className: "side-head" },
            activity === "files"
              ? React.createElement(ED.ViewSelector, { view: fileView, onChange: changeFileView })
              : sideTitle,
            activity === "files" && React.createElement("div", { className: "tools" },
              React.createElement("div", { className: "side-tool", title: "폴더 열기", onClick: openFolder }, React.createElement(Icons.Folder, { size: 14 })),
              React.createElement("div", { className: "side-tool", title: "빠른 열기 (⌘P)", onClick: () => setPaletteOpen(true) }, React.createElement(Icons.Search, { size: 14 })),
              React.createElement("div", { className: "side-tool", title: "새로고침", onClick: () => projectRoot && loadProject(projectRoot) }, React.createElement(Icons.RefreshCw, { size: 14 })))),
          renderSide()),

        // draggable splitter — resize the side panel horizontally
        React.createElement("div", { className: "side-resizer", onMouseDown: startSideResize }),

        // main column = editor + bottom panel
        React.createElement("div", { style: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 } },
          React.createElement(ED.Editor, {
            tabs, activeTab, onActivate: setActiveTab, onClose: closeTab, contents, dirty, liveContents,
            wrap: t.wrap, highlightLine, errorLine, findMode, onCloseFind: closeFind, onSetFindMode: setFindMode,
            onChangeContent, onSave: saveActive, diffs,
          }),
          // BOTTOM PANEL
          bottomOpen && React.createElement("div", { className: "bottompanel" },
            React.createElement("div", { className: "bp-tabs" },
              React.createElement("div", { className: "bp-tab" + (bottomTab === "logcat" ? " active" : ""), onClick: () => setBottomTab("logcat") },
                React.createElement(Icons.Terminal, { size: 14 }), "Logcat",
                errCount > 0 && React.createElement("span", { className: "cnt err" }, errCount)),
              React.createElement("div", { className: "bp-tab" + (bottomTab === "build" ? " active" : ""), onClick: () => setBottomTab("build") },
                React.createElement(Icons.Hammer, { size: 14 }), "Build",
                buildStatus === "fail" && React.createElement("span", { className: "cnt err" }, "FAILED"),
                buildStatus === "ok" && React.createElement("span", { className: "cnt", style: { background: "rgba(88,201,139,.18)", color: "var(--lv-I)" } }, "OK")),
              React.createElement("div", { className: "bp-spacer" }),
              React.createElement("div", { className: "bp-toolbar" },
                bottomTab === "build" && React.createElement("button", { className: "side-tool", title: "빌드 실패 시뮬레이션", onClick: () => runBuild(true, false) }, React.createElement(Icons.Circle, { size: 14, style: { color: "var(--lv-E)" } })),
                React.createElement("button", { className: "side-tool", title: "패널 닫기", onClick: () => setBottomOpen(false) }, React.createElement(Icons.X, { size: 15 })))),
            bottomTab === "logcat"
              ? React.createElement(PN.LogcatPane, {
                lines: logLines, levels, setLevels, filter: logFilter, setFilter: setLogFilter,
                paused, setPaused, autoscroll, setAutoscroll, onClear: clearLog,
                pidOnly, setPidOnly, pid: 18342, onPopOut: popOutLogcat,
              })
              : React.createElement(PN.BuildConsole, { lines: buildLines, running: building, onJump: jumpToError }))),
      ),

      // ---- STATUS BAR ----
      React.createElement("div", { className: "statusbar" },
        React.createElement("span", { className: "sb-item accent" }, React.createElement(Icons.Git, { size: 12 }), (gitInfo && gitInfo.branch) || "—"),
        React.createElement("span", { className: "sb-item" }, `↑${gitInfo ? gitInfo.ahead : 0} ↓${gitInfo ? gitInfo.behind : 0}`),
        React.createElement("span", { className: "sb-item" }, React.createElement(Icons.Dot, { size: 9, style: { color: errCount ? "var(--lv-E)" : "var(--lv-I)" } }), `${errCount} errors`),
        React.createElement("span", { className: "sb-spacer" }),
        activeTab && !activeTab.startsWith("diff:") && React.createElement(React.Fragment, null,
          React.createElement("span", { className: "sb-item" }, E.langOf(activeTab)),
          React.createElement("span", { className: "sb-item" }, "UTF-8"),
          React.createElement("span", { className: "sb-item" }, "Spaces: 4")),
        React.createElement("span", { className: "sb-item mem-badge" }, "mAndroid Studio ", React.createElement("b", null, "128 MB"), " · idle"),
        React.createElement("span", { className: "sb-item" }, React.createElement(Icons.Smartphone, { size: 12 }), deviceObj.label)),

      // ---- QUICK OPEN ----
      paletteOpen && React.createElement(PN.QuickOpen, { files, onClose: () => setPaletteOpen(false), onOpen: (p) => { setActivity("files"); openFile(projectRoot + "/" + p); } }),

      // ---- FIND / REPLACE IN PATH (⇧⌘F / ⇧⌘R) ----
      findInPathMode && React.createElement(FindInPath, {
        mode: findInPathMode, root: projectRoot,
        onClose: () => setFindInPathMode(null),
        onOpenAt: (p, l) => { setActivity("files"); openFile(projectRoot + "/" + p, l); },
        onFilesChanged,
      }),

      // ---- SEARCH EVERYWHERE (double-Shift) ----
      seOpen && React.createElement(SearchEverywhere, {
        files,
        onOpenFile: (p) => { setActivity("files"); openFile(projectRoot + "/" + p); },
        onClose: () => setSeOpen(false),
      }),

    );
  }

export default App;
