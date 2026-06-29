import { describe, it, expect } from "vitest";
import { layout } from "./engine";
import { makeStubMeasure } from "./measure";
import { parseLayout } from "./parse";
import type { LayoutCtx, PositionedBox } from "./types";

const ctx = (): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen: () => null },
  measure: makeStubMeasure(8, 20),
  density: 2.75, fontScale: 1,
});
const find = (b: PositionedBox, tag: string): PositionedBox | undefined =>
  b.node.tag === tag ? b : b.children.map((c) => find(c, tag)).find(Boolean);

describe("layout — frame + leaf", () => {
  it("centers a fixed-size child in a match_parent FrameLayout", () => {
    const xml = `<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <ImageView android:layout_width="160dp" android:layout_height="160dp"
          android:layout_gravity="center"/>
    </FrameLayout>`;
    const root = parseLayout(xml).root!;
    const box = layout(root, ctx(), { w: 360, h: 800 });
    expect(box.w).toBe(360);
    expect(box.h).toBe(800);
    const img = find(box, "ImageView")!;
    expect(img.w).toBe(160);
    expect(img.x).toBe((360 - 160) / 2); // 100
    expect(img.y).toBe((800 - 160) / 2); // 320
  });

  it("places a bottom-centered child with marginBottom", () => {
    const xml = `<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:layout_gravity="center_horizontal|bottom"
          android:layout_marginBottom="48dp" android:text="CafePOS"/>
    </FrameLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const tv = find(box, "TextView")!;
    expect(tv.w).toBe(7 * 8); // "CafePOS" = 7 chars * 8
    expect(tv.x).toBeCloseTo((360 - 56) / 2, 5);
    expect(tv.y).toBeCloseTo(800 - 20 - 48, 5); // bottom - height - marginBottom
  });
});
