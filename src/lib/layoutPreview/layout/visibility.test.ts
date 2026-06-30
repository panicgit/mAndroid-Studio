import { describe, it, expect } from "vitest";
import { layout } from "../engine";
import { makeStubMeasure } from "../measure";
import { parseLayout } from "../parse";
import { resolveVisibility } from "../values";
import type { LayoutCtx, PositionedBox } from "../types";

const NS = `xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app="http://schemas.android.com/apk/res-auto" xmlns:tools="http://schemas.android.com/tools"`;
const ctx = (): LayoutCtx => ({
  res: { string: () => null, color: () => null, dimen: () => null, drawable: () => null },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const all = (b: PositionedBox, tag: string): PositionedBox[] => {
  const out: PositionedBox[] = [];
  const walk = (x: PositionedBox) => { if (x.node.tag.split(".").pop() === tag) out.push(x); x.children.forEach(walk); };
  walk(b); return out;
};
const root = (xml: string) => layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });

describe("resolveVisibility", () => {
  const mk = (v?: string) => ({ tag: "View", attrs: v == null ? {} : { visibility: v }, children: [] });
  it("defaults to visible, maps gone/invisible, treats @{…} as visible", () => {
    expect(resolveVisibility(mk())).toBe("visible");
    expect(resolveVisibility(mk("gone"))).toBe("gone");
    expect(resolveVisibility(mk("invisible"))).toBe("invisible");
    expect(resolveVisibility(mk("@{vm.x ? View.GONE : View.VISIBLE}"))).toBe("visible");
    expect(resolveVisibility(mk("visible"))).toBe("visible");
  });
});

describe("visibility in layout", () => {
  it("a gone child occupies zero space in a vertical LinearLayout", () => {
    const xml = `<LinearLayout ${NS} android:orientation="vertical" android:layout_width="match_parent" android:layout_height="wrap_content">
      <View android:id="@+id/a" android:layout_width="match_parent" android:layout_height="20dp"/>
      <View android:id="@+id/b" android:layout_width="match_parent" android:layout_height="50dp"
            android:layout_marginTop="100dp" android:visibility="gone"/>
      <View android:id="@+id/c" android:layout_width="match_parent" android:layout_height="30dp"/>
    </LinearLayout>`;
    const [a, b, c] = all(root(xml), "View");
    expect(a.y).toBe(0);
    expect(b.w).toBe(0); expect(b.h).toBe(0);   // zero size
    expect(c.y).toBe(20);                         // gone B (incl. its 100dp margin) contributes nothing
  });
  it("tools:visibility='gone' overrides android:visibility='visible'", () => {
    const xml = `<LinearLayout ${NS} android:orientation="vertical" android:layout_width="match_parent" android:layout_height="wrap_content">
      <View android:id="@+id/a" android:layout_width="match_parent" android:layout_height="20dp"/>
      <View android:id="@+id/g" android:layout_width="match_parent" android:layout_height="50dp"
            android:visibility="visible" tools:visibility="gone"/>
      <View android:id="@+id/c" android:layout_width="match_parent" android:layout_height="30dp"/>
    </LinearLayout>`;
    const [, , c] = all(root(xml), "View");
    expect(c.y).toBe(20);
  });
  it("an invisible child still occupies its space", () => {
    const xml = `<LinearLayout ${NS} android:orientation="vertical" android:layout_width="match_parent" android:layout_height="wrap_content">
      <View android:id="@+id/a" android:layout_width="match_parent" android:layout_height="20dp"/>
      <View android:id="@+id/b" android:layout_width="match_parent" android:layout_height="50dp" android:visibility="invisible"/>
      <View android:id="@+id/c" android:layout_width="match_parent" android:layout_height="30dp"/>
    </LinearLayout>`;
    const [, b, c] = all(root(xml), "View");
    expect(b.h).toBe(50);
    expect(c.y).toBe(70);   // 20 + 50
  });
});
