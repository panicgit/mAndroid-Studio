import { describe, it, expect } from "vitest";
import { classify, widgetText, widgetVisual } from "./widgets";
import type { LNode, ResourceProvider } from "./types";

const res: ResourceProvider = {
  string: (n) => (n === "app_name" ? "CafePOS" : null),
  color: () => null,
  dimen: () => null,
  drawable: () => null,
};
const node = (tag: string, attrs: Record<string, string> = {}): LNode => ({ tag, attrs, children: [] });

describe("classify", () => {
  it("maps known containers and the constraint/relative fallback", () => {
    expect(classify("LinearLayout")).toBe("linear");
    expect(classify("FrameLayout")).toBe("frame");
    expect(classify("ScrollView")).toBe("scroll");
    expect(classify("NestedScrollView")).toBe("scroll");
    expect(classify("androidx.constraintlayout.widget.ConstraintLayout")).toBe("constraint");
    expect(classify("RelativeLayout")).toBe("relative");
    expect(classify("TextView")).toBe("leaf");
    expect(classify("com.example.CustomView")).toBe("leaf");
  });
});

describe("widgetText", () => {
  it("resolves @string text", () => {
    expect(widgetText(node("TextView", { text: "@string/app_name" }), res)).toBe("CafePOS");
  });
  it("EditText falls back to hint", () => {
    expect(widgetText(node("EditText", { hint: "Email" }), res)).toBe("Email");
  });
  it("Button has empty default", () => {
    expect(widgetText(node("Button", {}), res)).toBe("");
  });
});

describe("widgetVisual", () => {
  it("marks ImageView as placeholder", () => {
    expect(widgetVisual(node("ImageView", {}), res).placeholder).toBe(true);
  });
  it("Button gets a bg + border", () => {
    const v = widgetVisual(node("Button", { text: "OK" }), res);
    expect(v.border).toBe(true);
    expect(v.bg).toBeTruthy();
  });
});
