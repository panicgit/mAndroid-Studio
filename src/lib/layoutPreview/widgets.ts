import type { LNode, ResourceProvider } from "./types";
import { resolveString, resolveColor } from "./resources";

const last = (tag: string) => { const i = tag.lastIndexOf("."); return i >= 0 ? tag.slice(i + 1) : tag; };

export function classify(tag: string): "linear" | "frame" | "scroll" | "relative" | "constraint" | "stack" | "leaf" {
  switch (last(tag)) {
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
  const k = last(node.tag);
  if (k === "EditText" || k === "TextInputEditText") {
    if (node.attrs.text) return resolveString(node.attrs.text, res);
    return resolveString(node.attrs.hint, res);
  }
  if (TEXTUAL.has(k)) return resolveString(node.attrs.text, res);
  return "";
}

export function widgetVisual(node: LNode, res: ResourceProvider) {
  const k = last(node.tag);
  const text = widgetText(node, res);
  const textColor = resolveColor(node.attrs.textColor, res);
  const bg = resolveColor(node.attrs.background, res);
  const fontSizeSp = node.attrs.textSize ? parseFloat(node.attrs.textSize) || 14 : 14;
  // 알려진 leaf 위젯이 아니면서 leaf로 분류된 커스텀/미지원 뷰 → 점선 플레이스홀더
  const isImage = k === "ImageView" || k === "ImageButton";
  const placeholder = isImage || (!TEXTUAL.has(k) && !KNOWN_LEAF.has(k));
  const isButton = k === "Button" || k === "ImageButton";
  return {
    text,
    textColor,
    bg: bg ?? (isButton ? "var(--accent)" : null),
    border: isButton || k === "EditText" || k === "TextInputEditText",
    placeholder,
    fontSizeSp,
  };
}
