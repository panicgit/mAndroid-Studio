import { useMemo, useRef, useState, useEffect, Component, type ReactNode, type CSSProperties } from "react";
import { parseLayout } from "../lib/layoutPreview/parse";
import { buildResourceTable } from "../lib/layoutPreview/resources";
import { resolveColor } from "../lib/layoutPreview/resources";
import { domMeasure } from "../lib/layoutPreview/measure";
import { layout } from "../lib/layoutPreview/engine";
import { classify, widgetVisual } from "../lib/layoutPreview/widgets";
import { resolveVisibility } from "../lib/layoutPreview/values";
import { DEVICE_PROFILES, DEFAULT_PROFILE } from "../lib/layoutPreview/deviceProfiles";
import type { PositionedBox, ResourceProvider } from "../lib/layoutPreview/types";

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() { return this.state.err ? <div className="lp-error">프리뷰 렌더 오류: {this.state.err}</div> : this.props.children; }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const id = setTimeout(() => setV(value), ms); return () => clearTimeout(id); }, [value, ms]);
  return v;
}

function applyBackground(style: CSSProperties, node: PositionedBox["node"], res: ResourceProvider) {
  const bg = node.attrs.background;
  if (!bg) return;
  const ref = /^@drawable\/(.+)$/.exec(bg);
  if (ref) {
    const d = res.drawable(ref[1]);
    if (d && d.kind === "shape") Object.assign(style, d.css);
    else if (d && d.kind === "raster") Object.assign(style, {
      backgroundImage: `url("${d.dataUrl}")`,
      backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
    } as CSSProperties);
    return;
  }
  const c = resolveColor(bg, res);
  if (c) style.background = c;
}

const NO_FONTS: ReadonlySet<string> = new Set();

// @font/NAME .ttf/.otf/.woff(2) data-URLs the harness embedded in the resource files.
const FONT_FILE_RE = /\/res\/font[^/]*\/([^/]+)\.(?:ttf|otf|woff2?)$/i;

function fontDataUrls(files: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, value] of Object.entries(files)) {
    const mm = FONT_FILE_RE.exec(path);
    if (mm && typeof value === "string" &&
        (value.startsWith("data:font/") || value.startsWith("data:application/")) && !m.has(mm[1]))
      m.set(mm[1], value);
  }
  return m;
}

function collectFontRefs(b: PositionedBox, out: Set<string>): void {
  const mm = /^@font\/(.+)$/.exec(b.node.attrs.fontFamily || "");
  if (mm) out.add(mm[1]);
  b.children.forEach((c) => collectFontRefs(c, out));
}

// Inject a single <style> of @font-face rules (one per referenced @font/NAME that has a
// real font file), then render the tree. A leaf only gets its custom family when a face
// was actually injected; otherwise it falls back to fontWeight only.
export function renderPreview(box: PositionedBox, res: ResourceProvider, files: Record<string, string>): ReactNode {
  const urls = fontDataUrls(files);
  const refs = new Set<string>();
  collectFontRefs(box, refs);
  const faces: Array<[string, string]> = [];
  refs.forEach((name) => { const u = urls.get(name); if (u) faces.push([name, u]); });
  const available = new Set(faces.map(([n]) => n));
  return (
    <>
      {faces.length > 0 && (
        <style>{faces.map(([n, u]) => `@font-face{font-family:"${n}";src:url(${u});}`).join("")}</style>
      )}
      {renderBox(box, res, "root", available)}
    </>
  );
}

export function renderBox(b: PositionedBox, res: ResourceProvider, key: string, fonts: ReadonlySet<string> = NO_FONTS): ReactNode {
  const style: CSSProperties = { position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, boxSizing: "border-box" };
  if (resolveVisibility(b.node) === "invisible") style.visibility = "hidden";
  if (classify(b.node.tag) !== "leaf") {
    applyBackground(style, b.node, res);
    return <div key={key} style={style}>{b.children.map((c, i) => renderBox(c, res, key + "." + i, fonts))}</div>;
  }
  const v = widgetVisual(b.node, res);
  Object.assign(style, {
    background: v.placeholder ? "rgba(127,140,160,.18)" : v.bg || "transparent",
    border: v.placeholder ? "1px dashed rgba(127,140,160,.5)" : v.border ? "1px solid var(--line-2)" : "none",
    color: v.text.startsWith("@") ? "#e06c5c" : v.textColor || "var(--tx-1)",
    fontSize: v.fontSizeSp, fontWeight: v.fontWeight,
    display: "flex", alignItems: "center",
    justifyContent: v.bg ? "center" : "flex-start",
    borderRadius: v.bg ? 6 : 0, padding: v.bg && v.text ? "0 6px" : 0, overflow: v.placeholder || v.bg ? "hidden" : "visible",
    whiteSpace: "nowrap",
  } as CSSProperties);
  if (v.fontFamily && fonts.has(v.fontFamily)) style.fontFamily = `"${v.fontFamily}", sans-serif`;
  if (v.bgDrawable && v.bgDrawable.kind === "shape") Object.assign(style, v.bgDrawable.css);
  if (v.bgDrawable && v.bgDrawable.kind === "raster") Object.assign(style, {
    backgroundImage: `url("${v.bgDrawable.dataUrl}")`,
    backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
  } as CSSProperties);
  if (v.srcDrawable && v.srcDrawable.kind === "raster") {
    return (
      <div key={key} style={style} title={b.node.tag}>
        <img src={v.srcDrawable.dataUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    );
  }
  if (v.srcDrawable && v.srcDrawable.kind === "vector") {
    Object.assign(style, {
      backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(v.srcDrawable.svg)}")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "center", backgroundSize: "contain",
    } as CSSProperties);
  }
  const showLabel = !(v.srcDrawable && v.srcDrawable.kind === "vector");
  // Placeholder boxes stay empty (no tag-name text) so the dashed box doesn't overlap neighbors.
  const label = showLabel ? v.text : "";
  return <div key={key} style={style} title={b.node.tag}>{label}</div>;
}

export default function LayoutPreview({ xml, files }: { xml: string; files: Record<string, string> }) {
  const debXml = useDebounced(xml, 120);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [zoom, setZoom] = useState(1);

  const res = useMemo(() => buildResourceTable(files, profile.density, 1), [files, profile.density]);

  const includes = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [path, text] of Object.entries(files)) {
      const lm = /\/res\/layout[^/]*\/([^/]+)\.xml$/.exec(path);
      if (lm && !(lm[1] in m)) m[lm[1]] = text;
    }
    return m;
  }, [files]);

  const lastValidBox = useRef<PositionedBox | null>(null);

  const { box, error } = useMemo(() => {
    const parsed = parseLayout(debXml, includes);
    if (!parsed.root || parsed.error) return { box: null as PositionedBox | null, error: parsed.error || "no root" };
    try {
      const ctx = { res, measure: domMeasure(res, profile.density, 1), density: profile.density, fontScale: 1 };
      return { box: layout(parsed.root, ctx, { w: profile.wdp, h: profile.hdp - profile.statusBar }), error: null as string | null };
    } catch (e) {
      return { box: null as PositionedBox | null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [debXml, res, profile, includes]);

  const displayBox = (() => {
    if (box) { lastValidBox.current = box; return box; }
    return lastValidBox.current;
  })();

  return (
    <div className="lp-root">
      <div className="lp-toolbar">
        <select value={profile.id} onChange={(e) => setProfile(DEVICE_PROFILES.find((p) => p.id === e.target.value)!)}>
          {DEVICE_PROFILES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>＋</button>
      </div>
      {error && <div className="lp-error">XML 오류: {error}</div>}
      <div className="lp-stage">
        <Boundary>
          <div className="lp-device" style={{ width: profile.wdp * zoom, height: profile.hdp * zoom }}>
            <div style={{
              position: "absolute", top: 0, left: 0, width: profile.wdp, height: profile.hdp,
              transform: `scale(${zoom})`, transformOrigin: "top left",
              background: "var(--bg-editor)", overflow: "hidden",
            }}>
              <div style={{
                position: "absolute", top: 0, left: 0, width: profile.wdp, height: profile.statusBar,
                background: "rgba(0,0,0,.18)", pointerEvents: "none",
              }} />
              <div style={{
                position: "absolute", top: profile.statusBar, left: 0,
                width: profile.wdp, height: profile.hdp - profile.statusBar, overflow: "hidden",
              }}>
                {displayBox && renderPreview(displayBox, res, files)}
              </div>
            </div>
          </div>
        </Boundary>
      </div>
    </div>
  );
}
