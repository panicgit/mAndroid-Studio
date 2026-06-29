import { describe, it, expect } from "vitest";
import type { LNode } from "./types";

describe("test harness", () => {
  it("runs and exposes DOMParser (jsdom env)", () => {
    expect(typeof DOMParser).toBe("function");
    const n: LNode = { tag: "View", attrs: {}, children: [] };
    expect(n.tag).toBe("View");
  });
});
