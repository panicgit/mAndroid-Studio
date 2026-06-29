import type { ContainerFn, PositionedBox } from "../types";
import { parseGravity } from "../values";
import { nodeMargins } from "./spacing";

export const layoutFrame: ContainerFn = (node, boxW, boxH, maxW, maxH, place, ctx) => {
  const kids: PositionedBox[] = node.children.map((c) => place(c, maxW, maxH));
  const contentW = kids.reduce((m, k) => Math.max(m, k.w), 0);
  const contentH = kids.reduce((m, k) => Math.max(m, k.h), 0);
  const W = boxW ?? contentW;
  const H = boxH ?? contentH;
  kids.forEach((k, i) => {
    const child = node.children[i];
    const g = parseGravity(child.attrs.layout_gravity);
    const m = nodeMargins(child, ctx);
    k.x = g.h === "center" ? (W - k.w) / 2 : g.h === "end" ? W - k.w - m.r : m.l;
    k.y = g.v === "center" ? (H - k.h) / 2 : g.v === "bottom" ? H - k.h - m.b : m.t;
  });
  return { children: kids, contentW: W, contentH: H };
};
