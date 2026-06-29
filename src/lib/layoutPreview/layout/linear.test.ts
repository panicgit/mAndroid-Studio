import { describe, it, expect } from "vitest";
import { layout } from "../engine";
import { makeStubMeasure } from "../measure";
import { parseLayout } from "../parse";
import type { LayoutCtx, PositionedBox } from "../types";

const ctx = (): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen: () => null, drawable: () => null },
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

  it("weighted children retain measured size + weighted share (wrap text)", () => {
    // delta = 800 - (20 + 20) = 760; each weighted child = 20 + 760*(1/2) = 400.
    const xml = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="vertical"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <TextView android:layout_width="match_parent" android:layout_height="wrap_content"
          android:text="A" android:layout_weight="1"/>
      <TextView android:layout_width="match_parent" android:layout_height="wrap_content"
          android:text="B" android:layout_weight="1"/>
    </LinearLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [a, b] = all(box, "TextView");
    expect(a.h).toBeCloseTo(400, 5);
    expect(b.h).toBeCloseTo(400, 5);
  });

  it("weighted children retain DIFFERENT measured sizes (fixed heights)", () => {
    // delta = 800 - (100 + 300) = 400; share each = 200 → 300 and 500.
    const xml = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="vertical"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:layout_width="match_parent" android:layout_height="100dp" android:layout_weight="1"/>
      <View android:layout_width="match_parent" android:layout_height="300dp" android:layout_weight="1"/>
    </LinearLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [a, b] = all(box, "View");
    expect(a.h).toBeCloseTo(300, 5);
    expect(b.h).toBeCloseTo(500, 5);
  });

  it("does NOT distribute leftover when main axis is wrap_content (inside ScrollView)", () => {
    // wrap_content vertical LinearLayout measured under a huge maxH must NOT blow up.
    const xml = `<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <LinearLayout android:orientation="vertical"
          android:layout_width="match_parent" android:layout_height="wrap_content">
        <View android:layout_width="match_parent" android:layout_height="0dp" android:layout_weight="1"/>
      </LinearLayout>
    </ScrollView>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const v = all(box, "View")[0];
    const ll = all(box, "LinearLayout")[0];
    expect(v.h).toBe(0);   // weighted child collapses, no leftover to distribute
    expect(ll.h).toBe(0);  // parent contentH stays 0, not ~100000
  });

  it("honors child margins on the main and cross axes (vertical)", () => {
    const xml = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:orientation="vertical"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:layout_width="match_parent" android:layout_height="20dp"
          android:layout_marginTop="10dp" android:layout_marginBottom="5dp"/>
      <View android:layout_width="match_parent" android:layout_height="20dp"/>
    </LinearLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [a, b] = all(box, "View");
    expect(a.y).toBe(10);            // marginTop
    expect(b.y).toBe(10 + 20 + 5);   // prev top + height + marginBottom
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
