import React from "react";
import * as PN from "./components/panels";
import { listDevices } from "./ipc/device";
import { startLogcat, stopLogcat } from "./ipc/logcat";
import { Channel } from "@tauri-apps/api/core";

/* Detached Logcat window (loaded via index.html?view=logcat). Runs its OWN adb
 * logcat stream so the main IDE window stays light. The main window stops its
 * stream while this is open (single "logcat" child in the Rust registry). */

const { useState, useEffect, useRef } = React;

export default function LogcatWindow() {
  const params = new URLSearchParams(location.search);
  const [devices, setDevices] = useState([]);
  const [device, setDevice] = useState(params.get("device") || "");
  const [logLines, setLogLines] = useState([]);
  const [levels, setLevels] = useState({ V: false, D: true, I: true, W: true, E: true });
  const [logFilter, setLogFilter] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [pidOnly, setPidOnly] = useState(false);
  const CAP = 8000;
  const pendingRef = useRef([]);

  // The theme color vars live under [data-theme]; the main App sets this on its
  // own document — this separate window must set it too or colors won't resolve.
  useEffect(() => { document.documentElement.setAttribute("data-theme", "dark"); }, []);

  useEffect(() => {
    listDevices().then((ds) => {
      setDevices(ds);
      setDevice((cur) => cur || ((ds.find((d) => d.state === "device") || ds[0] || {}).id || ""));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!device || paused) return;
    let cancelled = false;
    pendingRef.current = [];
    const ch = new Channel();
    ch.onmessage = (batch) => { if (!cancelled) pendingRef.current.push(...batch); };
    const flush = setInterval(() => {
      if (cancelled || pendingRef.current.length === 0) return;
      const incoming = pendingRef.current;
      pendingRef.current = [];
      setLogLines((ls) => { const next = ls.concat(incoming); return next.length > CAP ? next.slice(next.length - CAP) : next; });
    }, 200);
    startLogcat(device, undefined, ch).catch(() => {});
    return () => { cancelled = true; clearInterval(flush); stopLogcat().catch(() => {}); };
  }, [device, paused]);

  return React.createElement("div", { style: { position: "fixed", inset: 0, display: "flex", flexDirection: "column", background: "var(--bg-app)", color: "var(--tx-1)" } },
    React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", borderBottom: "1px solid var(--line)", background: "var(--bg-chrome)" } },
      React.createElement("span", { style: { fontSize: 12, fontWeight: 600 } }, "Logcat"),
      React.createElement("select", {
        value: device, onChange: (e) => setDevice(e.target.value),
        style: { background: "var(--bg-elev)", color: "var(--tx-1)", border: "1px solid var(--line-2)", borderRadius: 6, height: 26, padding: "0 8px", fontFamily: "var(--ui)", fontSize: 12 },
      }, devices.length
        ? devices.map((d) => React.createElement("option", { key: d.id, value: d.id }, d.label + (d.state === "offline" ? " (offline)" : "")))
        : React.createElement("option", { value: "" }, "기기 없음"))),
    React.createElement("div", { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
      React.createElement(PN.LogcatPane, {
        lines: logLines, levels, setLevels, filter: logFilter, setFilter: setLogFilter,
        paused, setPaused, autoscroll, setAutoscroll, onClear: () => setLogLines([]),
        pidOnly, setPidOnly, pid: 18342,
      })));
}
