import type { Measure, ResourceProvider } from "./types";
import { classify, tagName, widgetText } from "./widgets";
import { resolveSp } from "./values";

export const DEFAULT_IMG = 24; // dp, src 미해석 ImageView 기본 박스(아이콘 크기)

// 결정적 측정(테스트 + 순수 엔진). 텍스트만 모델링: 폭 = chars*charW, 줄바꿈으로 높이 증가.
export function makeStubMeasure(charW = 7, lineH = 18): Measure {
  return (node, maxW) => {
    if (classify(node.tag) !== "leaf") return { w: 0, h: 0 }; // 컨테이너는 자식으로 결정
    const k = tagName(node.tag);
    if (k === "ImageView" || k === "ImageButton") return { w: DEFAULT_IMG, h: DEFAULT_IMG };
    if (k === "View" || k === "Space") return { w: 0, h: 0 };
    const text = node.attrs.text || node.attrs.hint || ""; // 테스트에선 @ref도 길이만 사용
    if (!text) return { w: 0, h: lineH };
    const ideal = text.length * charW;
    const w = Math.min(ideal, maxW);
    const lines = Math.max(1, Math.ceil(ideal / Math.max(1, maxW)));
    return { w, h: lines * lineH };
  };
}

// 런타임 실제 측정. canvas measureText로 폭을, 줄 수로 높이를 근사.
export function domMeasure(res: ResourceProvider, density: number, fontScale: number): Measure {
  void density; // 측정은 dp 공간에서 수행하므로 density는 CSS 스케일 단계에서만 쓰임
  const canvas = document.createElement("canvas");
  const cx = canvas.getContext("2d")!;
  return (node, maxW) => {
    if (classify(node.tag) !== "leaf") return { w: 0, h: 0 };
    const k = tagName(node.tag);
    if (k === "ImageView" || k === "ImageButton") return { w: DEFAULT_IMG, h: DEFAULT_IMG };
    if (k === "View" || k === "Space") return { w: 0, h: 0 };
    const text = widgetText(node, res);
    const sizeSp = resolveSp(node.attrs.textSize, res);
    const fontDp = sizeSp * fontScale;
    cx.font = `${fontDp}px sans-serif`; // dp 공간에서 측정
    if (!text) return { w: 0, h: Math.round(fontDp * 1.3) };
    const ideal = cx.measureText(text).width;
    const w = Math.min(ideal, maxW);
    const lineH = Math.round(fontDp * 1.35);
    const lines = Math.max(1, Math.ceil(ideal / Math.max(1, maxW)));
    return { w, h: lines * lineH };
  };
}
