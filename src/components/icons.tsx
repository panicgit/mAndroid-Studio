import React from "react";
/* DAS — Lucide-style line icons (stroke 1.75). Subset needed for the IDE. */

  const I = ({ d, size = 16, sw = 1.75, children, fill }) =>
    React.createElement("svg", {
      width: size, height: size, viewBox: "0 0 24 24", fill: fill || "none",
      stroke: "currentColor", strokeWidth: sw, strokeLinecap: "round", strokeLinejoin: "round",
      style: { flex: "none", display: "block" },
    }, children || React.createElement("path", { d }));

  const P = (d) => React.createElement("path", { d, key: d });

  const Icons = {
    Files: (p) => I({ ...p, children: [P("M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"), P("M14 2v6h6")] }),
    Search: (p) => I({ ...p, children: [React.createElement("circle", { cx: 11, cy: 11, r: 8, key: "c" }), P("m21 21-4.3-4.3")] }),
    Git: (p) => I({ ...p, children: [React.createElement("circle", { cx: 6, cy: 6, r: 3, key: "a" }), React.createElement("circle", { cx: 6, cy: 18, r: 3, key: "b" }), P("M6 9v6"), P("M18 9a9 9 0 0 1-9 9"), React.createElement("circle", { cx: 18, cy: 6, r: 3, key: "c" }), P("M18 9v0")] }),
    Smartphone: (p) => I({ ...p, children: [React.createElement("rect", { x: 7, y: 2, width: 10, height: 20, rx: 2, key: "r" }), P("M11 18h2")] }),
    Play: (p) => I({ ...p, children: [React.createElement("polygon", { points: "6 3 20 12 6 21 6 3", key: "p" })] }),
    Hammer: (p) => I({ ...p, children: [P("m15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9"), P("M17.6 6.8 21 10"), P("m9 12 6-6 6 6-3 3-6-6Z"), P("M14 6 10 2")] }),
    Terminal: (p) => I({ ...p, children: [P("m4 17 6-6-6-6"), P("M12 19h8")] }),
    ChevronRight: (p) => I({ ...p, children: [P("m9 18 6-6-6-6")] }),
    ChevronDown: (p) => I({ ...p, children: [P("m6 9 6 6 6-6")] }),
    X: (p) => I({ ...p, children: [P("M18 6 6 18"), P("m6 6 12 12")] }),
    Folder: (p) => I({ ...p, children: [P("M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z")] }),
    FolderOpen: (p) => I({ ...p, children: [P("m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6A2 2 0 0 1 18.46 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2")] }),
    Filter: (p) => I({ ...p, children: [P("M22 3H2l8 9.46V19l4 2v-8.54L22 3z")] }),
    Pause: (p) => I({ ...p, children: [React.createElement("rect", { x: 6, y: 4, width: 4, height: 16, rx: 1, key: "a" }), React.createElement("rect", { x: 14, y: 4, width: 4, height: 16, rx: 1, key: "b" })] }),
    Trash: (p) => I({ ...p, children: [P("M3 6h18"), P("M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2")] }),
    ArrowDown: (p) => I({ ...p, children: [P("M12 5v14"), P("m19 12-7 7-7-7")] }),
    PopOut: (p) => I({ ...p, children: [P("M15 3h6v6"), P("M10 14 21 3"), P("M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6")] }),
    Settings: (p) => I({ ...p, children: [P("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"), React.createElement("circle", { cx: 12, cy: 12, r: 3, key: "c" })] }),
    Check: (p) => I({ ...p, children: [P("M20 6 9 17l-5-5")] }),
    Circle: (p) => I({ ...p, children: [React.createElement("circle", { cx: 12, cy: 12, r: 10, key: "c" })] }),
    Replace: (p) => I({ ...p, children: [P("M14 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2"), P("M6 16a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2"), P("m3 7 3 3 3-3"), P("M6 10V5a3 3 0 0 1 3-3"), P("m21 17-3-3-3 3"), P("M18 14v5a3 3 0 0 1-3 3")] }),
    File: (p) => I({ ...p, children: [P("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"), P("M14 2v5h5")] }),
    Download: (p) => I({ ...p, children: [P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), P("M7 10l5 5 5-5"), P("M12 15V3")] }),
    Upload: (p) => I({ ...p, children: [P("M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"), P("M17 8l-5-5-5 5"), P("M12 3v12")] }),
    Plus: (p) => I({ ...p, children: [P("M5 12h14"), P("M12 5v14")] }),
    RefreshCw: (p) => I({ ...p, children: [P("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"), P("M21 3v5h-5"), P("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"), P("M8 16H3v5")] }),
    Dot: (p) => I({ ...p, fill: "currentColor", children: [React.createElement("circle", { cx: 12, cy: 12, r: 5, key: "c", stroke: "none" })] }),
    CornerDownRight: (p) => I({ ...p, children: [P("m15 10 5 5-5 5"), P("M4 4v7a4 4 0 0 0 4 4h12")] }),
    Wrap: (p) => I({ ...p, children: [P("M3 6h18"), P("M3 12h15a3 3 0 1 1 0 6h-4"), P("m16 16-2 2 2 2"), P("M3 18h7")] }),
    // Android-view module (3D box).
    Module: (p) => I({ ...p, children: [P("M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"), P("m3.3 7 8.7 5 8.7-5"), P("M12 22V12")] }),
  };

  export { Icons };
