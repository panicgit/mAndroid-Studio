import { describe, it, expect } from "vitest";
import { nodePadding } from "./spacing";
import { makeStubMeasure } from "../measure";
import type { LayoutCtx, LNode } from "../types";

const ctx = (): LayoutCtx => ({
  res: {
    string: () => null, color: () => null, drawable: () => null,
    dimen: (n) => ({ d_800: 8, d_2000: 20, d_1600: 16 }[n] ?? null),
  },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const iv: LNode = {
  tag: "ImageView", attrs: {
    padding: "@dimen/d_800", paddingStart: "@dimen/d_2000", paddingEnd: "@dimen/d_1600",
  }, children: [],
};

describe("nodePadding with @dimen refs", () => {
  it("resolves start/end/base @dimen paddings to dp", () => {
    expect(nodePadding(iv, ctx())).toEqual({ l: 20, t: 8, r: 16, b: 8 });
  });
});
