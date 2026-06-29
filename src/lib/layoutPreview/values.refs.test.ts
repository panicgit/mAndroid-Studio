import { describe, it, expect } from "vitest";
import { resolveDimen, resolveSp } from "./values";
import { makeStubMeasure } from "./measure";
import type { LayoutCtx, ResourceProvider } from "./types";

const ctx = (dimen: (n: string) => number | null): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen, drawable: () => null },
  measure: makeStubMeasure(8, 20),
  density: 2.75, fontScale: 1,
});

describe("resolveDimen", () => {
  const c = ctx((n) => (n === "d_800" ? 8 : n === "d_2000" ? 20 : null));
  it("resolves @dimen/NAME to a fixed dp", () => {
    expect(resolveDimen("@dimen/d_800", c)).toEqual({ mode: "fixed", px: 8 });
    expect(resolveDimen("@dimen/d_2000", c)).toEqual({ mode: "fixed", px: 20 });
  });
  it("unknown @dimen falls back to wrap", () => {
    expect(resolveDimen("@dimen/nope", c)).toEqual({ mode: "wrap", px: 0 });
  });
  it("@android:dimen falls through gracefully (wrap)", () => {
    expect(resolveDimen("@android:dimen/x", c)).toEqual({ mode: "wrap", px: 0 });
  });
  it("literals behave exactly like parseDimen", () => {
    expect(resolveDimen("64dp", c)).toEqual({ mode: "fixed", px: 64 });
    expect(resolveDimen("match_parent", c)).toEqual({ mode: "match", px: 0 });
    expect(resolveDimen("0dp", c)).toEqual({ mode: "constraint", px: 0 });
  });
});

describe("resolveSp", () => {
  const res = (dimen: (n: string) => number | null): ResourceProvider =>
    ({ string: () => null, color: () => null, dimen, drawable: () => null });
  const r = res((n) => (n === "text_body" ? 18 : null));
  it("resolves textSize=@dimen/NAME to the dimen value (not NaN→14)", () => {
    expect(resolveSp("@dimen/text_body", r)).toBe(18);
  });
  it("parses a literal sp unchanged", () => {
    expect(resolveSp("16sp", r)).toBe(16);
  });
  it("unknown @dimen and missing textSize fall back to 14sp", () => {
    expect(resolveSp("@dimen/nope", r)).toBe(14);
    expect(resolveSp(undefined, r)).toBe(14);
  });
});
