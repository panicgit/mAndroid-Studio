import type { ResourceProvider, Drawable } from "./types";
import { parseColor, parseDimen } from "./values";
import { vectorToSvg, shapeToCss } from "./drawables";

const RES_VALUES = /\/res\/values[^/]*\/[^/]+\.xml$/;
const RES_DRAWABLE = /\/res\/drawable[^/]*\/([^/]+)\.xml$/;

function collectDrawables(files: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [path, text] of Object.entries(files)) {
    const mm = RES_DRAWABLE.exec(path);
    if (mm && !m.has(mm[1])) m.set(mm[1], text);
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
  return {
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
    drawable: (name): Drawable | null => {
      const text = drawables.get(name);
      if (!text) return null;
      const svg = vectorToSvg(text);
      if (svg) return { kind: "vector", svg };
      const css = shapeToCss(text);
      if (css) return { kind: "shape", css };
      return null;
    },
  };
}

export function resolveString(v: string | undefined, res: ResourceProvider): string {
  if (v == null) return "";
  const m = /^@string\/(.+)$/.exec(v);
  if (!m) return v;
  return res.string(m[1]) ?? v; // 미해석 시 원문(@string/..) 노출 → 경고 신호
}

export function resolveColor(v: string | undefined, res: ResourceProvider): string | null {
  if (v == null) return null;
  const c = /^@color\/(.+)$/.exec(v);
  if (c) return res.color(c[1]);
  const t = /^\?(?:android:)?(?:attr\/)?(.+)$/.exec(v);
  if (t) return resolveThemeColor(t[1]);
  return parseColor(v);
}
