import type { ContainerFn, LNode, PositionedBox } from "../types";
import { parseDimen, parseGravity } from "../values";

// 각 자식의 margin(dp)
function margins(node: LNode, density: number, fontScale: number) {
  const d = (k: string) => { const x = parseDimen(node.attrs[k], density, fontScale); return x.mode === "fixed" ? x.px : 0; };
  const all = d("layout_margin");
  return {
    l: node.attrs.layout_marginStart || node.attrs.layout_marginLeft ? d("layout_marginStart") || d("layout_marginLeft") : all,
    t: node.attrs.layout_marginTop ? d("layout_marginTop") : all,
    r: node.attrs.layout_marginEnd || node.attrs.layout_marginRight ? d("layout_marginEnd") || d("layout_marginRight") : all,
    b: node.attrs.layout_marginBottom ? d("layout_marginBottom") : all,
  };
}

export const layoutFrame: ContainerFn = (node, boxW, boxH, maxW, maxH, place, ctx) => {
  const kids: PositionedBox[] = node.children.map((c) => place(c, maxW, maxH));
  const contentW = kids.reduce((m, k) => Math.max(m, k.w), 0);
  const contentH = kids.reduce((m, k) => Math.max(m, k.h), 0);
  const W = boxW ?? contentW;
  const H = boxH ?? contentH;
  kids.forEach((k, i) => {
    const child = node.children[i];
    const g = parseGravity(child.attrs.layout_gravity);
    const m = margins(child, ctx.density, ctx.fontScale);
    k.x = g.h === "center" ? (W - k.w) / 2 : g.h === "end" ? W - k.w - m.r : m.l;
    k.y = g.v === "center" ? (H - k.h) / 2 : g.v === "bottom" ? H - k.h - m.b : m.t;
  });
  return { children: kids, contentW: W, contentH: H };
};
