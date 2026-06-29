import type { ContainerFn, PositionedBox } from "../types";
import { parseGravity } from "../values";

const num = (s: string | undefined) => { const n = parseFloat(s || ""); return isNaN(n) ? 0 : n; };

export const layoutLinear: ContainerFn = (node, boxW, boxH, maxW, maxH, place) => {
  const vertical = (node.attrs.orientation || "horizontal") === "vertical";
  const children = node.children;
  const weights = children.map((c) => num(c.attrs.layout_weight));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // 1패스: 자식을 자연 크기로 측정
  const boxes: PositionedBox[] = children.map((c) => place(c, maxW, maxH));
  const usedMain = boxes.reduce((sum, b, i) => sum + (weights[i] > 0 ? 0 : vertical ? b.h : b.w), 0);

  // 2패스: 남은 주축 공간을 weight 비율로 분배
  const avail = vertical ? boxH ?? maxH : boxW ?? maxW;
  const leftover = Math.max(0, avail - usedMain);
  if (totalWeight > 0) {
    weights.forEach((w, i) => {
      if (w <= 0) return;
      const share = leftover * (w / totalWeight);
      if (vertical) boxes[i].h = share; else boxes[i].w = share;
    });
  }

  // 배치(주축 누적 + 교차축 gravity)
  const crossBox = vertical ? boxW ?? maxW : boxH ?? maxH;
  let cursor = 0;
  let contentMain = 0, contentCross = 0;
  boxes.forEach((b, i) => {
    const g = parseGravity(children[i].attrs.layout_gravity);
    if (vertical) {
      b.y = cursor; cursor += b.h; contentMain = cursor;
      b.x = g.h === "center" ? (crossBox - b.w) / 2 : g.h === "end" ? crossBox - b.w : 0;
      contentCross = Math.max(contentCross, b.w);
    } else {
      b.x = cursor; cursor += b.w; contentMain = cursor;
      b.y = g.v === "center" ? (crossBox - b.h) / 2 : g.v === "bottom" ? crossBox - b.h : 0;
      contentCross = Math.max(contentCross, b.h);
    }
  });
  return vertical
    ? { children: boxes, contentW: boxW ?? contentCross, contentH: boxH ?? contentMain }
    : { children: boxes, contentW: boxW ?? contentMain, contentH: boxH ?? contentCross };
};
