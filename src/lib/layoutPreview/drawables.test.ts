import { describe, it, expect } from "vitest";
import { vectorToSvg } from "./drawables";

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
