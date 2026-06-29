import type { ContainerFn } from "../types";

const BIG = 100000; // 주축 unbounded 근사

export const layoutScroll: ContainerFn = (node, boxW, boxH, maxW, maxH, place) => {
  const horizontal = node.tag.split(".").pop() === "HorizontalScrollView";
  const first = node.children[0];
  if (!first) return { children: [], contentW: boxW ?? 0, contentH: boxH ?? 0 };
  // 스크롤 축은 무한대로 측정, 교차축은 정상 상한
  const cMaxW = horizontal ? BIG : maxW;
  const cMaxH = horizontal ? maxH : BIG;
  const b = place(first, cMaxW, cMaxH);
  b.x = 0; b.y = 0;
  return { children: [b], contentW: boxW ?? b.w, contentH: boxH ?? b.h };
};
