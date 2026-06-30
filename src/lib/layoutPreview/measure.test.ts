import { describe, it, expect } from "vitest";
import { makeStubMeasure, DEFAULT_IMG } from "./measure";
import type { LNode } from "./types";

const n = (tag: string, attrs: Record<string, string> = {}): LNode => ({ tag, attrs, children: [] });

describe("makeStubMeasure", () => {
  const m = makeStubMeasure(8, 18); // 8dp/char, 18dp line
  it("sizes a TextView by its text length", () => {
    const s = m(n("TextView", { text: "Hello" }), 1000, 1000); // 5 chars
    expect(s.w).toBe(40);
    expect(s.h).toBe(18);
  });
  it("gives ImageView a default placeholder box", () => {
    const s = m(n("ImageView", {}), 1000, 1000);
    expect(s.w).toBeGreaterThan(0);
    expect(s.h).toBeGreaterThan(0);
  });
  it("uses an icon-sized (24dp) default for an unresolved ImageView", () => {
    expect(DEFAULT_IMG).toBe(24);
    const s = m(n("ImageView", {}), 1000, 1000);
    expect(s).toEqual({ w: 24, h: 24 });
  });
  it("never exceeds the available width (wraps height)", () => {
    const s = m(n("TextView", { text: "abcdefghij" }), 40, 1000); // 80dp wanted, 40 cap
    expect(s.w).toBeLessThanOrEqual(40);
    expect(s.h).toBe(36); // 2 lines
  });
  it("returns zero size for containers (children decide)", () => {
    expect(m(n("LinearLayout"), 100, 100)).toEqual({ w: 0, h: 0 });
  });
});
