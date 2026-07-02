import type { Dimen, LayoutCtx, LNode, ResourceProvider } from "./types";

export function parseDimen(v: string | undefined, density: number, fontScale: number): Dimen {
  if (v == null || v === "") return { mode: "wrap", px: 0 };
  const s = v.trim();
  if (s === "match_parent" || s === "fill_parent") return { mode: "match", px: 0 };
  if (s === "wrap_content") return { mode: "wrap", px: 0 };
  const m = /^(-?\d+(?:\.\d+)?)(dp|dip|sp|px|pt|in|mm)?$/.exec(s);
  if (!m) return { mode: "wrap", px: 0 };
  const n = parseFloat(m[1]);
  const unit = m[2] || "dp";
  if (n === 0 && (unit === "dp" || unit === "dip")) return { mode: "constraint", px: 0 };
  let px: number;
  switch (unit) {
    case "sp": px = n * fontScale; break;     // dp 공간에서 sp는 fontScale 배
    case "px": px = n / density; break;        // px → dp
    case "pt": px = (n * 160) / 72; break;     // 근사
    default:   px = n;                          // dp/dip
  }
  return { mode: "fixed", px };
}

const hex = (h: string) => parseInt(h, 16);
export function parseColor(v: string | undefined): string | null {
  if (!v || v[0] !== "#") return null;
  const h = v.slice(1);
  const a3 = (x: string) => x + x;
  if (h.length === 3) return `#${a3(h[0])}${a3(h[1])}${a3(h[2])}`;
  if (h.length === 6) return `#${h}`;
  if (h.length === 4) { // #ARGB
    const a = hex(a3(h[0])) / 255;
    return `rgba(${hex(a3(h[1]))},${hex(a3(h[2]))},${hex(a3(h[3]))},${Math.round(a * 1000) / 1000})`;
  }
  if (h.length === 8) { // #AARRGGBB
    const a = hex(h.slice(0, 2)) / 255;
    return `rgba(${hex(h.slice(2, 4))},${hex(h.slice(4, 6))},${hex(h.slice(6, 8))},${Math.round(a * 1000) / 1000})`;
  }
  return null;
}

export function parseGravity(v: string | undefined) {
  const flags = (v || "").split("|").map((s) => s.trim());
  let h: "start" | "center" | "end" | "fill" = "start";
  let vv: "top" | "center" | "bottom" | "fill" = "top";
  for (const f of flags) {
    if (f === "center") { h = "center"; vv = "center"; }
    else if (f === "center_horizontal") h = "center";
    else if (f === "center_vertical") vv = "center";
    else if (f === "left" || f === "start") h = "start";
    else if (f === "right" || f === "end") h = "end";
    else if (f === "top") vv = "top";
    else if (f === "bottom") vv = "bottom";
    else if (f === "fill_horizontal") h = "fill";
    else if (f === "fill_vertical") vv = "fill";
    else if (f === "fill") { h = "fill"; vv = "fill"; }
  }
  return { h, v: vv };
}

// @dimen/NAME → fixed dp via ctx.res.dimen; @android:dimen/… and unknowns → wrap;
// everything else delegates to the pure parseDimen.
export function resolveDimen(v: string | undefined, ctx: LayoutCtx): Dimen {
  if (v != null) {
    const m = /^@dimen\/(.+)$/.exec(v.trim());
    if (m) {
      const dp = ctx.res.dimen(m[1]);
      return dp != null ? { mode: "fixed", px: dp } : { mode: "wrap", px: 0 };
    }
  }
  return parseDimen(v, ctx.density, ctx.fontScale);
}

// android:textSize → sp number. Resolves @dimen/NAME via the resource table
// (which already returns the value in the table's font scale) so
// textSize="@dimen/text_body" no longer parseFloat→NaN→14. Literals like "16sp"
// parse straight through; missing/unknown fall back to the platform 14sp default.
export function resolveSp(v: string | undefined, res: ResourceProvider): number {
  const DEFAULT = 14;
  if (v == null || v === "") return DEFAULT;
  const m = /^@dimen\/(.+)$/.exec(v.trim());
  if (m) {
    const dp = res.dimen(m[1]);
    return dp != null ? dp : DEFAULT;
  }
  return parseFloat(v) || DEFAULT;
}

// android:visibility resolution. parse.ts already merges tools:* over android:* so a
// tools:visibility override lands in attrs.visibility. A data-binding @{…} / @={…} value is
// design-time-unknown → treat as VISIBLE.
export function resolveVisibility(node: LNode): "visible" | "invisible" | "gone" {
  const v = node.attrs.visibility;
  if (v == null) return "visible";
  const s = v.trim();
  if (/^@=?\{/.test(s)) return "visible";
  if (s === "gone") return "gone";
  if (s === "invisible") return "invisible";
  return "visible";
}

export function resolveSize(d: Dimen, avail: number, content: number): number {
  switch (d.mode) {
    case "match": return avail;
    case "fixed": return d.px;
    case "wrap": return Math.min(content, avail);
    case "constraint": return avail; // Phase1: 비-constraint 부모에선 match처럼 취급
  }
}
