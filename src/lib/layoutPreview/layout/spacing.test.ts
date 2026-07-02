import { describe, it, expect } from "vitest";
import { nodeMargins, nodePadding } from "./spacing";
import { makeStubMeasure } from "../measure";
import type { LayoutCtx, LNode } from "../types";

const ctx = (): LayoutCtx => ({
  res: {
    string: () => null, color: () => null, drawable: () => null,
    dimen: (n) => ({ dp_8: 8, dp_20: 20, dp_16: 16 }[n] ?? null),
  },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const iv: LNode = {
  tag: "ImageView", attrs: {
    padding: "@dimen/dp_8", paddingStart: "@dimen/dp_20", paddingEnd: "@dimen/dp_16",
  }, children: [],
};

describe("nodePadding with @dimen refs", () => {
  it("resolves start/end/base @dimen paddings to dp", () => {
    expect(nodePadding(iv, ctx())).toEqual({ l: 20, t: 8, r: 16, b: 8 });
  });
});

describe("Horizontal/Vertical shorthands", () => {
  const c2 = (): LayoutCtx => ({
    res: { string: () => null, color: () => null, drawable: () => null, dimen: () => null },
    measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
  });
  it("paddingHorizontal sets left+right only", () => {
    const n: LNode = { tag: "View", attrs: { paddingHorizontal: "16dp" }, children: [] };
    expect(nodePadding(n, c2())).toEqual({ l: 16, t: 0, r: 16, b: 0 });
  });
  it("marginVertical sets top+bottom only", () => {
    const n: LNode = { tag: "View", attrs: { layout_marginVertical: "12dp" }, children: [] };
    expect(nodeMargins(n, c2())).toEqual({ l: 0, t: 12, r: 0, b: 12 });
  });
  it("explicit side wins over the Horizontal/Vertical shorthand", () => {
    const n: LNode = { tag: "View", attrs: { paddingHorizontal: "16dp", paddingLeft: "4dp" }, children: [] };
    expect(nodePadding(n, c2())).toEqual({ l: 4, t: 0, r: 16, b: 0 });
  });
});
