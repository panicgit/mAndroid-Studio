import type { LNode, LayoutCtx, PositionedBox, Size, ContainerFn } from "./types";
import { resolveDimen, resolveSize, resolveVisibility } from "./values";
import { classify } from "./widgets";
import { nodePadding } from "./layout/spacing";
import { layoutFrame } from "./layout/frame";
import { layoutLinear } from "./layout/linear";
import { layoutScroll } from "./layout/scroll";
import { layoutRelative } from "./layout/relative";
import { layoutConstraint } from "./layout/constraint";

const CONTAINERS: Record<string, ContainerFn> = {
  frame: layoutFrame,
  stack: layoutFrame, // Phase1: Constraint/Relative 폴백
  linear: layoutLinear, // 추가
  scroll: layoutScroll,
  relative: layoutRelative,
  constraint: layoutConstraint,
};

export function layout(root: LNode, ctx: LayoutCtx, viewport: Size): PositionedBox {
  const place = (node: LNode, maxW: number, maxH: number): PositionedBox => {
    const lw = resolveDimen(node.attrs.layout_width, ctx);
    const lh = resolveDimen(node.attrs.layout_height, ctx);
    const kind = classify(node.tag);

    if (resolveVisibility(node) === "gone") return { node, x: 0, y: 0, w: 0, h: 0, children: [] };

    if (kind === "leaf") {
      const im = ctx.measure(node, maxW, maxH);
      return { node, x: 0, y: 0, w: resolveSize(lw, maxW, im.w), h: resolveSize(lh, maxH, im.h), children: [] };
    }

    const pad = nodePadding(node, ctx);
    const innerMaxW = resolveSize(lw, maxW, maxW) - pad.l - pad.r;
    const innerMaxH = resolveSize(lh, maxH, maxH) - pad.t - pad.b;
    const exactW = lw.mode === "match" || lw.mode === "fixed" ? innerMaxW : null;
    const exactH = lh.mode === "match" || lh.mode === "fixed" ? innerMaxH : null;

    const fn = CONTAINERS[kind] || layoutFrame;
    const r = fn(node, exactW, exactH, innerMaxW, innerMaxH, place, ctx);
    for (const c of r.children) { c.x += pad.l; c.y += pad.t; }
    const w = resolveSize(lw, maxW, r.contentW + pad.l + pad.r);
    const h = resolveSize(lh, maxH, r.contentH + pad.t + pad.b);
    return { node, x: 0, y: 0, w, h, children: r.children };
  };

  // 루트는 항상 뷰포트를 사용 가능 영역으로 받는다.
  const box = place(root, viewport.w, viewport.h);
  box.x = 0; box.y = 0;
  return box;
}
