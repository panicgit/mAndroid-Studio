import type { LNode, ResourceProvider } from "./types";
import { resolveString, resolveColor } from "./resources";
import { resolveSp } from "./values";

// 정규화된 위젯 이름: 마지막 "." 뒤(없으면 전체). 빈 문자열은 그대로 "".
export function tagName(tag: string): string { const i = tag.lastIndexOf("."); return i >= 0 ? tag.slice(i + 1) : tag; }

export function classify(tag: string): "linear" | "frame" | "scroll" | "relative" | "constraint" | "stack" | "leaf" {
  switch (tagName(tag)) {
    case "LinearLayout": return "linear";
    case "FrameLayout": return "frame";
    case "ScrollView":
    case "HorizontalScrollView":
    case "NestedScrollView": return "scroll";
    case "RelativeLayout": return "relative";
    case "ConstraintLayout": return "constraint";
    case "merge": return "stack";
    default: return "leaf";
  }
}

const TEXTUAL = new Set(["TextView", "Button", "EditText", "CheckBox", "Switch", "RadioButton", "TextInputEditText"]);
const KNOWN_LEAF = new Set([
  "TextView", "Button", "EditText", "ImageView", "ImageButton", "View", "CheckBox",
  "Switch", "RadioButton", "ProgressBar", "TextInputEditText", "Space",
]);

export function widgetText(node: LNode, res: ResourceProvider): string {
  const k = tagName(node.tag);
  if (k === "EditText" || k === "TextInputEditText") {
    if (node.attrs.text) return resolveString(node.attrs.text, res);
    return resolveString(node.attrs.hint, res);
  }
  if (TEXTUAL.has(k)) return resolveString(node.attrs.text, res);
  return "";
}

export function widgetVisual(node: LNode, res: ResourceProvider) {
  const k = tagName(node.tag);
  const text = widgetText(node, res);
  const textColor = resolveColor(node.attrs.textColor, res);
  const bg = resolveColor(node.attrs.background, res);
  const fontSizeSp = resolveSp(node.attrs.textSize, res);
  const isImage = k === "ImageView" || k === "ImageButton";

  const srcRef = /^@drawable\/(.+)$/.exec(node.attrs.src || "");
  const srcDrawable = isImage && srcRef ? res.drawable(srcRef[1]) : null;
  const bgRef = /^@drawable\/(.+)$/.exec(node.attrs.background || "");
  const bgDrawable = bgRef ? res.drawable(bgRef[1]) : null;

  // fontFamily (@font/pretendard_bold|_semibold|_medium|_regular) + textStyle="bold".
  // "semibold" is checked before "bold" because it also contains the substring "bold".
  const fontHint = `${node.attrs.fontFamily || ""} ${node.attrs.textStyle || ""}`.toLowerCase();
  const fontWeight =
    fontHint.includes("semibold") || fontHint.includes("semi_bold") ? 600
    : fontHint.includes("bold") ? 700
    : fontHint.includes("medium") ? 500
    : 400;
  // Real typeface: @font/NAME → the local font name ("pretendard_bold"). The actual
  // @font-face (with the .ttf data-URL) is injected by LayoutPreview; here we only name it.
  const fontRef = /^@font\/(.+)$/.exec(node.attrs.fontFamily || "");
  const fontFamily = fontRef ? fontRef[1] : null;

  // 알려진 leaf 위젯이 아니면서 leaf로 분류된 커스텀/미지원 뷰 → 점선 플레이스홀더.
  // 단, src drawable이 해석되면 ImageView는 더 이상 플레이스홀더가 아니다.
  const placeholder = (isImage && !srcDrawable) || (!TEXTUAL.has(k) && !KNOWN_LEAF.has(k));
  const isButton = k === "Button" || k === "ImageButton";
  return {
    text,
    textColor,
    bg: bg ?? (isButton ? "var(--accent)" : null),
    border: isButton || k === "EditText" || k === "TextInputEditText",
    placeholder,
    fontSizeSp,
    fontWeight,
    fontFamily,
    srcDrawable,
    bgDrawable,
  };
}
