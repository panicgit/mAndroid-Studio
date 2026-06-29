import type { ContainerFn, PositionedBox } from "../types";
import { parseDimen, parseGravity } from "../values";
import { nodeMargins } from "./spacing";

const num = (s: string | undefined) => { const n = parseFloat(s || ""); return isNaN(n) ? 0 : n; };

export const layoutLinear: ContainerFn = (node, boxW, boxH, maxW, maxH, place, ctx) => {
  const vertical = (node.attrs.orientation || "horizontal") === "vertical";
  const children = node.children;
  const weights = children.map((c) => num(c.attrs.layout_weight));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // 1패스: 자식을 자연 크기로 측정
  const boxes: PositionedBox[] = children.map((c) => place(c, maxW, maxH));

  // 각 자식의 주축 측정값. 0dp(constraint)는 0으로 본다(가중치로 채워짐).
  const mainMode = children.map((c) =>
    parseDimen(vertical ? c.attrs.layout_height : c.attrs.layout_width, ctx.density, ctx.fontScale).mode);
  const measuredMain = boxes.map((b, i) => (mainMode[i] === "constraint" ? 0 : vertical ? b.h : b.w));
  // weighted 자식은 우선 측정 주축으로 접는다(0dp→0; 주축이 wrap이면 분배가 없으므로 이게 최종).
  boxes.forEach((b, i) => { if (weights[i] > 0) { if (vertical) b.h = measuredMain[i]; else b.w = measuredMain[i]; } });

  // 2패스: 주축이 exact(match/fixed)일 때만 남은 공간을 분배. wrap이면 남는 공간이 없다.
  // Android: delta = avail − Σ(모든 자식 측정 주축); weighted 최종 = 측정 + delta*(w/total).
  const mainBox = vertical ? boxH : boxW;
  if (mainBox != null && totalWeight > 0) {
    const sumMeasured = measuredMain.reduce((a, b) => a + b, 0);
    const delta = mainBox - sumMeasured;
    weights.forEach((w, i) => {
      if (w <= 0) return;
      const size = measuredMain[i] + delta * (w / totalWeight);
      if (vertical) boxes[i].h = size; else boxes[i].w = size;
    });
  }

  // 배치(주축 누적 + margin + 교차축 gravity)
  const crossBox = vertical ? boxW ?? maxW : boxH ?? maxH;
  let cursor = 0;
  let contentMain = 0, contentCross = 0;
  boxes.forEach((b, i) => {
    const g = parseGravity(children[i].attrs.layout_gravity);
    const m = nodeMargins(children[i], ctx);
    if (vertical) {
      b.y = cursor + m.t; cursor = b.y + b.h + m.b; contentMain = cursor;
      b.x = g.h === "center" ? (crossBox - b.w) / 2 : g.h === "end" ? crossBox - b.w - m.r : m.l;
      contentCross = Math.max(contentCross, b.w + m.l + m.r);
    } else {
      b.x = cursor + m.l; cursor = b.x + b.w + m.r; contentMain = cursor;
      b.y = g.v === "center" ? (crossBox - b.h) / 2 : g.v === "bottom" ? crossBox - b.h - m.b : m.t;
      contentCross = Math.max(contentCross, b.h + m.t + m.b);
    }
  });
  return vertical
    ? { children: boxes, contentW: boxW ?? contentCross, contentH: boxH ?? contentMain }
    : { children: boxes, contentW: boxW ?? contentMain, contentH: boxH ?? contentCross };
};
