import { describe, it, expect } from "vitest";
import { resolveDimen } from "./values";
import { makeStubMeasure } from "./measure";
import type { LayoutCtx } from "./types";

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
