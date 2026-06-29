import { describe, it, expect } from "vitest";
import { vectorToSvg, shapeToCss } from "./drawables";

const VEC = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:pathData="M12 2L2 22h20z" android:fillColor="#FF0000"/>
  <path android:pathData="M0 0h4v4h-4z" android:strokeColor="#0000FF" android:strokeWidth="2"/>
</vector>`;

describe("vectorToSvg", () => {
  it("emits an svg with the source viewBox", () => {
    const svg = vectorToSvg(VEC)!;
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('width="24"');
  });
  it("maps pathData → d and fillColor → fill", () => {
    const svg = vectorToSvg(VEC)!;
    expect(svg).toContain('d="M12 2L2 22h20z"');
    expect(svg).toContain('fill="#ff0000"');
  });
  it("maps strokeColor/strokeWidth", () => {
    const svg = vectorToSvg(VEC)!;
    expect(svg).toContain('stroke="#0000ff"');
    expect(svg).toContain('stroke-width="2"');
  });
  it("returns null for non-vector XML", () => {
    expect(vectorToSvg(`<shape><solid android:color="#fff"/></shape>`)).toBeNull();
    expect(vectorToSvg(`<<<broken`)).toBeNull();
  });
});

describe("shapeToCss", () => {
  it("solid + corners + stroke → background/borderRadius/border", () => {
    const css = shapeToCss(`<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
      <solid android:color="#FF8800"/>
      <corners android:radius="8dp"/>
      <stroke android:width="2dp" android:color="#000000"/>
    </shape>`)!;
    expect(css.background).toBe("#FF8800");
    expect(css.borderRadius).toBe("8px");
    expect(css.border).toBe("2px solid #000000");
  });
  it("oval → 50% radius", () => {
    const css = shapeToCss(`<shape android:shape="oval"><solid android:color="#123456"/></shape>`)!;
    expect(css.borderRadius).toBe("50%");
  });
  it("gradient → linear-gradient (android angle 0 = left→right = css 90deg)", () => {
    const css = shapeToCss(`<shape><gradient android:startColor="#FF0000" android:endColor="#0000FF" android:angle="0"/></shape>`)!;
    expect(css.background).toBe("linear-gradient(90deg, #FF0000, #0000FF)");
  });
  it("returns null for non-shape XML", () => {
    expect(shapeToCss(`<vector android:viewportWidth="1" android:viewportHeight="1"/>`)).toBeNull();
  });
});
