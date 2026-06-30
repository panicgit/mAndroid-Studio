import type { ResourceProvider, Drawable } from "./types";
import { parseColor, parseDimen } from "./values";
import { vectorToSvg, shapeToCss, selectorDefault } from "./drawables";

const RES_VALUES = /\/res\/values[^/]*\/[^/]+\.xml$/;
const RES_DRAWABLE = /\/res\/drawable[^/]*\/([^/]+)\.xml$/;
const RES_DRAWABLE_RASTER = /\/res\/drawable[^/]*\/([^/]+)\.(?:png|webp|jpg|jpeg)$/i;

function collectDrawables(files: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    const mm = RES_DRAWABLE.exec(path);
    if (mm && !m.has(mm[1])) m.set(mm[1], text);
  }
  return m;
}

// Raster drawables provided as data-URLs (the browser harness embeds PNG/WebP bytes).
function collectRasters(files: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, value] of Object.entries(files)) {
    const mm = RES_DRAWABLE_RASTER.exec(path);
    if (mm && typeof value === "string" && value.startsWith("data:image/") && !m.has(mm[1]))
      m.set(mm[1], value);
  }
  return m;
}

// Material 라이트 테마 기본값 (?attr/ 해석용 내장 맵).
const THEME: Record<string, string> = {
  colorPrimary: "#6200EE",
  colorPrimaryVariant: "#3700B3",
  colorPrimaryDark: "#3700B3",
  colorSecondary: "#03DAC6",
  colorSecondaryVariant: "#018786",
  colorAccent: "#03DAC6",
  colorOnPrimary: "#FFFFFF",
  colorOnSecondary: "#000000",
  colorSurface: "#FFFFFF",
  colorOnSurface: "#000000",
  colorBackground: "#FFFFFF",
  colorOnBackground: "#000000",
  colorError: "#B00020",
  colorOnError: "#FFFFFF",
};

export function resolveThemeColor(name: string): string | null {
  return THEME[name] ?? null;
}

// <resources> 안의 <string|color|dimen name="..">값</..> 를 모은다.
function collect(files: Record<string, string>): {
  strings: Map<string, string>; colors: Map<string, string>; dimens: Map<string, string>;
} {
  const strings = new Map<string, string>();
  const colors = new Map<string, string>();
  const dimens = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    if (!RES_VALUES.test(path)) continue;
    let doc: Document;
    try { doc = new DOMParser().parseFromString(text, "application/xml"); } catch { continue; }
    if (doc.querySelector("parsererror")) continue;
    for (const el of Array.from(doc.querySelectorAll("string"))) {
      const n = el.getAttribute("name"); if (n) strings.set(n, (el.textContent || "").trim());
    }
    for (const el of Array.from(doc.querySelectorAll("color"))) {
      const n = el.getAttribute("name"); if (n) colors.set(n, (el.textContent || "").trim());
    }
    for (const el of Array.from(doc.querySelectorAll("dimen"))) {
      const n = el.getAttribute("name"); if (n) dimens.set(n, (el.textContent || "").trim());
    }
  }
  return { strings, colors, dimens };
}

export function buildResourceTable(
  files: Record<string, string>, density: number, fontScale: number,
): ResourceProvider {
  const { strings, colors, dimens } = collect(files);
  const drawables = collectDrawables(files);
  const rasters = collectRasters(files);

  // Resolve a drawable by name. Prefers vector/shape/selector XML; falls back to a
  // raster data-URL of the same name. Selectors resolve to their default item, which
  // may reference another @drawable (recursed here with cycle/depth guards).
  function resolveDrawable(name: string, depth: number, seen: Set<string>): Drawable | null {
    if (depth > 8 || seen.has(name)) return null;
    const text = drawables.get(name);
    if (text != null) {
      // Pass the provider so @color/@dimen refs inside the drawable resolve.
      const sel = selectorDefault(text, provider);
      if (sel) {
        if (sel.drawableRef) { seen.add(name); return resolveDrawable(sel.drawableRef, depth + 1, seen); }
        if (sel.css) return { kind: "shape", css: sel.css };
        return null;
      }
      const svg = vectorToSvg(text, provider);
      if (svg) return { kind: "vector", svg };
      const css = shapeToCss(text, provider);
      if (css) return { kind: "shape", css };
    }
    const raster = rasters.get(name);
    if (raster) return { kind: "raster", dataUrl: raster };
    return null;
  }

  const provider: ResourceProvider = {
    string: (name) => (strings.has(name) ? strings.get(name)! : null),
    color: (name) => {
      const raw = colors.get(name);
      return raw ? parseColor(raw) : null;
    },
    dimen: (name) => {
      const raw = dimens.get(name);
      if (!raw) return null;
      const d = parseDimen(raw, density, fontScale);
      return d.mode === "fixed" ? d.px : null;
    },
    drawable: (name): Drawable | null => resolveDrawable(name, 0, new Set()),
  };
  return provider;
}

export function resolveString(v: string | undefined, res: ResourceProvider): string {
  if (v == null) return "";
  if (/^@=?\{/.test(v.trim())) return ""; // data-binding @{...} / @={...} → blank
  const m = /^@string\/(.+)$/.exec(v);
  if (!m) return v;
  return res.string(m[1]) ?? v;
}

export function resolveColor(v: string | undefined, res: ResourceProvider): string | null {
  if (v == null) return null;
  const c = /^@color\/(.+)$/.exec(v);
  if (c) return res.color(c[1]);
  const t = /^\?(?:android:)?(?:attr\/)?(.+)$/.exec(v);
  if (t) return resolveThemeColor(t[1]);
  return parseColor(v);
}
