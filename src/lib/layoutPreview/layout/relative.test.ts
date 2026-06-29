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
const NS = `xmlns:android="http://schemas.android.com/apk/res/android"`;

describe("RelativeLayout", () => {
  it("resolves alignParent + center rules", () => {
    const xml = `<RelativeLayout ${NS}
        android:layout_width="match_parent" android:layout_height="match_parent">
      <TextView android:id="@+id/title" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="Hi" android:layout_alignParentTop="true" android:layout_centerHorizontal="true"/>
      <Button android:id="@+id/ok" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="OK" android:layout_alignParentBottom="true" android:layout_alignParentEnd="true"
          android:layout_marginEnd="16dp"/>
    </RelativeLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const title = all(box, "TextView")[0];
    expect(title.x).toBeCloseTo((360 - 16) / 2, 5); // "Hi" = 2*8 = 16
    expect(title.y).toBe(0);
    const ok = all(box, "Button")[0];
    expect(ok.x).toBe(360 - 16 - 16); // W - marginEnd - width(16)
    expect(ok.y).toBe(800 - 20);      // bottom-aligned, height 20
  });

  it("resolves positional rules (toRightOf / below) with margins", () => {
    const xml = `<RelativeLayout ${NS}
        android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/anchor" android:layout_width="100dp" android:layout_height="50dp"/>
      <TextView android:id="@+id/label" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="ABCD" android:layout_toRightOf="@id/anchor" android:layout_marginStart="8dp"/>
      <TextView android:id="@+id/under" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="XY" android:layout_below="@id/anchor"/>
    </RelativeLayout>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const label = all(box, "TextView").find((b) => b.node.id === "label")!;
    expect(label.x).toBe(100 + 8); // anchor.right(0+100) + marginStart(8)
    expect(label.y).toBe(0);
    const under = all(box, "TextView").find((b) => b.node.id === "under")!;
    expect(under.y).toBe(50); // anchor.bottom(0+50)
    expect(under.x).toBe(0);
  });

  it("breaks cyclic positional refs without throwing", () => {
    const xml = `<RelativeLayout ${NS}
        android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/a" android:layout_width="40dp" android:layout_height="10dp" android:layout_toRightOf="@id/b"/>
      <View android:id="@+id/b" android:layout_width="40dp" android:layout_height="10dp" android:layout_toRightOf="@id/a"/>
    </RelativeLayout>`;
    let box!: PositionedBox;
    expect(() => { box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 }); }).not.toThrow();
    const vs = all(box, "View");
    expect(vs).toHaveLength(2);
    expect(Number.isFinite(vs[0].x)).toBe(true);
    expect(Number.isFinite(vs[1].x)).toBe(true);
  });
});
