import type { ResourceProvider } from "./types";
import { parseColor, parseDimen } from "./values";

const RES_VALUES = /\/res\/values[^/]*\/[^/]+\.xml$/;

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
  const m = /^@color\/(.+)$/.exec(v);
  if (m) return res.color(m[1]);
  return parseColor(v);
}
