import { describe, it, expect } from "vitest";
import { layout } from "../engine";
import { makeStubMeasure } from "../measure";
import { parseLayout } from "../parse";
import type { LayoutCtx, PositionedBox } from "../types";

const ctx = (): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen: () => null },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const child = (b: PositionedBox): PositionedBox => b.children[0];

describe("ScrollView", () => {
  it("measures its single child with unbounded vertical space", () => {
    const xml = `<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
        android:layout_width="match_parent" android:layout_height="match_parent">
      <LinearLayout android:orientation="vertical"
          android:layout_width="match_parent" android:layout_height="wrap_content">
        <View android:layout_width="match_parent" android:layout_height="500dp"/>
        <View android:layout_width="match_parent" android:layout_height="500dp"/>
      </LinearLayout>
    </ScrollView>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    expect(box.h).toBe(800);                 // ScrollView 자신은 뷰포트
    expect(child(box).h).toBeCloseTo(1000, 5); // 내용은 800을 초과(스크롤)
  });
});
