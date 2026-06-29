// 벡터/shape drawable → SVG 문자열 / CSS 객체. 순수 함수. DOMParser로 XML 파싱.
// (jsdom 환경에서 테스트, 런타임은 WebView DOMParser.)
import type { Drawable } from "./types";
import { parseColor } from "./values";

function parseXml(xml: string): Element | null {
  try {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    return doc.documentElement || null;
  } catch { return null; }
}

// 네임스페이스 prefix(android:)를 무시하고 local name으로 속성을 읽는다.
function attr(el: Element, name: string): string | null {
  for (const a of Array.from(el.attributes)) {
    const i = a.name.indexOf(":");
    const local = i >= 0 ? a.name.slice(i + 1) : a.name;
    if (local === name) return a.value;
  }
  return null;
}
function firstChild(el: Element, tag: string): Element | null {
  for (const c of Array.from(el.children)) {
    const i = c.tagName.indexOf(":");
    const local = i >= 0 ? c.tagName.slice(i + 1) : c.tagName;
    if (local === tag) return c;
  }
  return null;
}
const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const col = (v: string | null, fallback: string): string => {
  const c = v ? parseColor(v) : null;
  return (c || fallback).toLowerCase();
};
const num = (v: string | null) => `${parseFloat(v || "0") || 0}px`;

export function vectorToSvg(xml: string): string | null {
  const root = parseXml(xml);
  if (!root || root.tagName.replace(/^.*:/, "") !== "vector") return null;
  const vw = attr(root, "viewportWidth") || "24";
  const vh = attr(root, "viewportHeight") || "24";
  const w = (attr(root, "width") || "24").replace(/(dp|dip|px|sp)$/i, "");
  const h = (attr(root, "height") || "24").replace(/(dp|dip|px|sp)$/i, "");
  const tint = attr(root, "tint");
  const paths: string[] = [];
  for (const p of Array.from(root.children)) {
    if (p.tagName.replace(/^.*:/, "") !== "path") continue;
    const d = attr(p, "pathData");
    if (!d) continue;
    const fill = col(attr(p, "fillColor") || tint, "#000000");
    const stroke = attr(p, "strokeColor");
    let a = `<path d="${xmlEsc(d)}" fill="${fill}"`;
    if (stroke && parseColor(stroke)) {
      a += ` stroke="${parseColor(stroke)!.toLowerCase()}" stroke-width="${parseFloat(attr(p, "strokeWidth") || "1") || 1}"`;
    }
    a += "/>";
    paths.push(a);
  }
  if (!paths.length) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}">${paths.join("")}</svg>`;
}

export function shapeToCss(xml: string): Record<string, string> | null {
  const root = parseXml(xml);
  if (!root || root.tagName.replace(/^.*:/, "") !== "shape") return null;
  const css: Record<string, string> = {};
  const kind = attr(root, "shape") || "rectangle";

  const solid = firstChild(root, "solid");
  if (solid) { const c = parseColor(attr(solid, "color") || ""); if (c) css.background = c; }

  const grad = firstChild(root, "gradient");
  if (grad) {
    const stops = [attr(grad, "startColor"), attr(grad, "centerColor"), attr(grad, "endColor")]
      .map((v) => (v ? parseColor(v) : null))
      .filter((c): c is string => !!c);
    if (stops.length >= 2) {
      const angle = parseFloat(attr(grad, "angle") || "0") || 0;
      // Android: angle 0 = 좌→우, 반시계. CSS: 90deg = 좌→우, 시계. 변환 cssDeg = 90 - androidAngle.
      css.background = `linear-gradient(${90 - angle}deg, ${stops.join(", ")})`;
    }
  }

  const corners = firstChild(root, "corners");
  if (corners) { const r = attr(corners, "radius"); if (r) css.borderRadius = num(r); }
  if (kind === "oval") css.borderRadius = "50%";

  const stroke = firstChild(root, "stroke");
  if (stroke) {
    const c = parseColor(attr(stroke, "color") || "");
    if (c) css.border = `${num(attr(stroke, "width") || "1")} solid ${c}`;
  }
  return css;
}

// Re-export Drawable type for consumers
export type { Drawable };
