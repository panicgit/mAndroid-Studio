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

import type { Drawable } from "./types";
const resWithDrawable: ResourceProvider = {
  string: () => null,
  color: () => null,
  dimen: () => null,
  drawable: (n): Drawable | null =>
    n === "logo" ? { kind: "vector", svg: "<svg></svg>" }
    : n === "pill" ? { kind: "shape", css: { background: "#FF8800" } }
    : null,
};

describe("widgetVisual fontWeight", () => {
  it("fontFamily pretendard_bold → 700", () =>
    expect(widgetVisual(node("TextView", { fontFamily: "@font/pretendard_bold" }), res).fontWeight).toBe(700));
  it("fontFamily pretendard_semibold → 600", () =>
    expect(widgetVisual(node("TextView", { fontFamily: "@font/pretendard_semibold" }), res).fontWeight).toBe(600));
  it("fontFamily pretendard_medium → 500", () =>
    expect(widgetVisual(node("TextView", { fontFamily: "@font/pretendard_medium" }), res).fontWeight).toBe(500));
  it("textStyle bold → 700", () =>
    expect(widgetVisual(node("TextView", { textStyle: "bold" }), res).fontWeight).toBe(700));
  it("no font hints → 400", () =>
    expect(widgetVisual(node("TextView", { text: "x" }), res).fontWeight).toBe(400));
});

describe("widgetVisual fontFamily", () => {
  it("@font/NAME → local family name", () =>
    expect(widgetVisual(node("TextView", { fontFamily: "@font/pretendard_bold" }), res).fontFamily).toBe("pretendard_bold"));
  it("no fontFamily → null", () =>
    expect(widgetVisual(node("TextView", { text: "x" }), res).fontFamily).toBeNull());
});

describe("widgetVisual drawables", () => {
  it("ImageView src=@drawable vector → srcDrawable, not placeholder", () => {
    const v = widgetVisual(node("ImageView", { src: "@drawable/logo" }), resWithDrawable);
    expect(v.srcDrawable?.kind).toBe("vector");
    expect(v.placeholder).toBe(false);
  });
  it("background=@drawable shape → bgDrawable", () => {
    const v = widgetVisual(node("TextView", { background: "@drawable/pill" }), resWithDrawable);
    expect(v.bgDrawable?.kind).toBe("shape");
  });
  it("ImageView without resolvable src stays placeholder", () => {
    const v = widgetVisual(node("ImageView", {}), resWithDrawable);
    expect(v.placeholder).toBe(true);
  });
});
