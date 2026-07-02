import type { LNode, LayoutCtx } from "../types";
import { resolveDimen } from "../values";
import { resolveVisibility } from "../values";

// margin/padding 공통 해석. base="layout_margin" 또는 "padding".
// Start/End는 Left/Right보다 우선하되, 명시적 "0dp"가 falsy로 무시되지 않도록
// 값이 아니라 attr KEY 존재 여부로 판단한다.
function edges(node: LNode, ctx: LayoutCtx, base: string): { l: number; t: number; r: number; b: number } {
  const d = (k: string) => { const x = resolveDimen(node.attrs[k], ctx); return x.mode === "fixed" ? x.px : 0; };
  const has = (k: string) => k in node.attrs;
  const all = d(base);
  const horiz = has(base + "Horizontal") ? d(base + "Horizontal") : all;
  const vert = has(base + "Vertical") ? d(base + "Vertical") : all;
  const pickH = (start: string, side: string) =>
    has(start) ? d(start) : has(side) ? d(side) : horiz;
  return {
    l: pickH(base + "Start", base + "Left"),
    t: has(base + "Top") ? d(base + "Top") : vert,
    r: pickH(base + "End", base + "Right"),
    b: has(base + "Bottom") ? d(base + "Bottom") : vert,
  };
}

export function nodeMargins(node: LNode, ctx: LayoutCtx): { l: number; t: number; r: number; b: number } {
  if (resolveVisibility(node) === "gone") return { l: 0, t: 0, r: 0, b: 0 };
  return edges(node, ctx, "layout_margin");
}

export function nodePadding(node: LNode, ctx: LayoutCtx): { l: number; t: number; r: number; b: number } {
  return edges(node, ctx, "padding");
}
