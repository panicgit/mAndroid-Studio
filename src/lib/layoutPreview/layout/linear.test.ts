import { describe, it, expect } from "vitest";
import { layout } from "../engine";
import { makeStubMeasure } from "../measure";
import { parseLayout } from "../parse";
import type { LayoutCtx, PositionedBox } from "../types";

const ctx = (): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen: () => null },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const all = (b: PositionedBox, tag: string): PositionedBox[] => {
  const out: PositionedBox[] = [];
  const walk = (x: PositionedBox) => { if (x.node.tag === tag) out.push(x); x.children.forEach(walk); };
  walk(b); return out;
};

describe("LinearLayout", () => {
  it("distributes leftover height by weight (vertical)", () => {
    const xml = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="vertical"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"/>
      <View android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="3"/>
    </LinearLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [a, b] = all(box, "View");
    expect(a.h).toBeCloseTo(200, 5); // 800 * 1/4
    expect(b.h).toBeCloseTo(600, 5); // 800 * 3/4
    expect(a.y).toBe(0);
    expect(b.y).toBeCloseTo(200, 5);
  });

  it("stacks horizontally with wrap children", () => {
    const xml = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="horizontal"
        android:layout_width="match_parent" android:layout_height="wrap_content">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="AB"/>
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="CD"/>
    </LinearLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [t0, t1] = all(box, "TextView");
    expect(t0.x).toBe(0);
    expect(t1.x).toBe(16); // "AB" = 2*8
  });
});
