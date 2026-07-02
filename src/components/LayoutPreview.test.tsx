/// <reference types="vitest" />
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBox, renderPreview } from "./LayoutPreview";
import type { PositionedBox, ResourceProvider } from "../lib/layoutPreview/types";

const res = { string: () => null, color: () => null, dimen: () => null, drawable: () => null };

const leaf = {
  node: { tag: "TextView", attrs: { text: "Hello" }, children: [] },
  x: 0, y: 0, w: 40, h: 20,
  children: [],
};

describe("renderBox — text fidelity", () => {
  it("emits white-space:nowrap for a plain text leaf", () => {
    const html = renderToStaticMarkup(renderBox(leaf, res, "k"));
    expect(html).toContain("white-space:nowrap");
  });

  it("does not shrink measured width with horizontal border-box padding on plain text leaves", () => {
    const html = renderToStaticMarkup(renderBox(leaf, res, "k"));
    expect(html).not.toMatch(/padding:0 6px|padding-left:6px/);
  });

  it("plain text leaf has overflow:visible so nowrap text is not clipped by 1px rounding", () => {
    const html = renderToStaticMarkup(renderBox(leaf, res, "k"));
    expect(html).toContain("overflow:visible");
  });
});

describe("renderBox — placeholder", () => {
  const placeholder = {
    node: { tag: "ImageView", attrs: {}, children: [] },
    x: 0, y: 0, w: 24, h: 24,
    children: [],
  };
  it("does not print the tag-name text inside an empty placeholder box", () => {
    const html = renderToStaticMarkup(renderBox(placeholder, res, "k"));
    expect(html).not.toContain(">ImageView<"); // no text node, only the title attr is allowed
  });
});

describe("renderBox — raster image", () => {
  const rasterRes: ResourceProvider = {
    string: () => null, color: () => null, dimen: () => null,
    drawable: (n) => (n === "ic_back" ? { kind: "raster", dataUrl: "data:image/png;base64,AAAA" } : null),
  };
  const img = {
    node: { tag: "ImageView", attrs: { src: "@drawable/ic_back" }, children: [] },
    x: 0, y: 0, w: 24, h: 24, children: [],
  };
  it("renders an <img> with the raster data URL for a raster src", () => {
    const html = renderToStaticMarkup(renderBox(img, rasterRes, "k"));
    expect(html).toContain("<img");
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });
});

describe("renderPreview — @font/NAME typefaces", () => {
  const fontLeaf = (name: string): PositionedBox => ({
    node: { tag: "TextView", attrs: { text: "Pay", fontFamily: `@font/${name}` }, children: [] },
    x: 0, y: 0, w: 40, h: 20, children: [],
  });

  it("injects an @font-face and applies the family when a font data-URL exists", () => {
    const files = { "app/src/main/res/font/pretendard_bold.ttf": "data:font/ttf;base64,AAAA" };
    const html = renderToStaticMarkup(renderPreview(fontLeaf("pretendard_bold"), res, files));
    expect(html).toContain("@font-face");
    expect(html).toContain('font-family:"pretendard_bold"');         // the @font-face rule
    expect(html).toContain("&quot;pretendard_bold&quot;, sans-serif"); // the text leaf inline style
  });

  it("no @font-face (and no custom family) when the referenced font has no file; text still renders", () => {
    const html = renderToStaticMarkup(renderPreview(fontLeaf("pretendard_bold"), res, {}));
    expect(html).not.toContain("@font-face");
    expect(html).not.toContain("pretendard_bold");
    expect(html).toContain("Pay"); // text still renders, fontWeight fallback only
  });
});
