import { describe, it, expect } from "vitest";
import { parseDimen, parseColor, parseGravity, resolveSize } from "./values";

describe("parseDimen", () => {
  it("maps match_parent/fill_parent and wrap_content", () => {
    expect(parseDimen("match_parent", 2.75, 1).mode).toBe("match");
    expect(parseDimen("fill_parent", 2.75, 1).mode).toBe("match");
    expect(parseDimen("wrap_content", 2.75, 1).mode).toBe("wrap");
  });
  it("treats 0dp as constraint", () => {
    expect(parseDimen("0dp", 2.75, 1).mode).toBe("constraint");
  });
  it("parses dp/sp/px to dp px value", () => {
    expect(parseDimen("16dp", 2.75, 1)).toEqual({ mode: "fixed", px: 16 });
    expect(parseDimen("16sp", 2.75, 2)).toEqual({ mode: "fixed", px: 32 }); // fontScale 2
    expect(parseDimen("55px", 2.75, 1).px).toBeCloseTo(20, 5);             // 55 / 2.75
  });
  it("defaults missing to wrap", () => {
    expect(parseDimen(undefined, 2.75, 1).mode).toBe("wrap");
  });
});

describe("parseColor", () => {
  it("expands #RGB and #ARGB, passes #RRGGBB", () => {
    expect(parseColor("#f00")).toBe("#ff0000");
    expect(parseColor("#8f00")).toBe("rgba(255,0,0,0.533)");
    expect(parseColor("#112233")).toBe("#112233");
  });
  it("converts #AARRGGBB to rgba", () => {
    expect(parseColor("#80ff0000")).toBe("rgba(255,0,0,0.502)");
  });
  it("returns null for non-literal (refs handled elsewhere)", () => {
    expect(parseColor("@color/foo")).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe("parseGravity", () => {
  it("parses combined flags", () => {
    expect(parseGravity("center_horizontal|bottom")).toEqual({ h: "center", v: "bottom" });
    expect(parseGravity("center")).toEqual({ h: "center", v: "center" });
    expect(parseGravity(undefined)).toEqual({ h: "start", v: "top" });
  });
});

describe("resolveSize", () => {
  it("match->avail, wrap->content, fixed->px", () => {
    expect(resolveSize({ mode: "match", px: 0 }, 300, 50)).toBe(300);
    expect(resolveSize({ mode: "wrap", px: 0 }, 300, 50)).toBe(50);
    expect(resolveSize({ mode: "fixed", px: 80 }, 300, 50)).toBe(80);
    expect(resolveSize({ mode: "constraint", px: 0 }, 300, 50)).toBe(300); // Phase1: 비-constraint 부모에선 match처럼
  });
});
