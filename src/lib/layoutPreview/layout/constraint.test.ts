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
  const walk = (x: PositionedBox) => { if (x.node.tag.split(".").pop() === tag) out.push(x); x.children.forEach(walk); };
  walk(b); return out;
};
const CL = "androidx.constraintlayout.widget.ConstraintLayout";
const GL = "androidx.constraintlayout.widget.Guideline";
const NS = `xmlns:android="http://schemas.android.com/apk/res/android" xmlns:app="http://schemas.android.com/apk/res-auto"`;
const root = (xml: string) => layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });

describe("ConstraintLayout", () => {
  it("centers between opposing parent anchors with default bias", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <TextView android:id="@+id/t" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="ABCDE"
          app:layout_constraintTop_toTopOf="parent" app:layout_constraintBottom_toBottomOf="parent"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintEnd_toEndOf="parent"/>
    </${CL}>`;
    const t = all(root(xml), "TextView")[0];
    expect(t.w).toBe(40);               // "ABCDE" = 5*8
    expect(t.x).toBeCloseTo(160, 5);    // (360-40)/2
    expect(t.y).toBeCloseTo(390, 5);    // (800-20)/2
  });

  it("fills 0dp between anchors honoring side margins", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/bar" android:layout_width="0dp" android:layout_height="20dp"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintEnd_toEndOf="parent"
          app:layout_constraintTop_toTopOf="parent"
          android:layout_marginStart="16dp" android:layout_marginEnd="16dp"/>
    </${CL}>`;
    const bar = all(root(xml), "View")[0];
    expect(bar.x).toBe(16);
    expect(bar.w).toBe(360 - 16 - 16); // 328
    expect(bar.y).toBe(0);
  });

  it("anchors to a sibling edge with margin", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/a" android:layout_width="100dp" android:layout_height="40dp"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"/>
      <TextView android:id="@+id/b" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="Hi" android:layout_marginStart="8dp"
          app:layout_constraintStart_toEndOf="@id/a" app:layout_constraintTop_toTopOf="@id/a"/>
    </${CL}>`;
    const b = all(root(xml), "TextView")[0];
    expect(b.x).toBe(100 + 8); // a.right + marginStart
    expect(b.y).toBe(0);
  });

  it("derives a 0dp dimension from constraintDimensionRatio", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <ImageView android:id="@+id/img" android:layout_width="100dp" android:layout_height="0dp"
          app:layout_constraintDimensionRatio="1:1"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const img = all(root(xml), "ImageView")[0];
    expect(img.w).toBe(100);
    expect(img.h).toBe(100); // 1:1 of width
    expect(img.x).toBe(0);
    expect(img.y).toBe(0);
  });

  it("anchors to a percent Guideline", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <${GL} android:id="@+id/gl" android:orientation="vertical" app:layout_constraintGuide_percent="0.5"/>
      <View android:id="@+id/v" android:layout_width="0dp" android:layout_height="30dp"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintEnd_toStartOf="@id/gl"
          app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const v = all(root(xml), "View")[0];
    expect(v.x).toBe(0);
    expect(v.w).toBe(180); // up to guideline at 0.5*360
  });

  it("spreads a basic horizontal chain", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/a" android:layout_width="40dp" android:layout_height="30dp"
          app:layout_constraintHorizontal_chainStyle="spread"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintEnd_toStartOf="@id/b"
          app:layout_constraintTop_toTopOf="parent"/>
      <View android:id="@+id/b" android:layout_width="40dp" android:layout_height="30dp"
          app:layout_constraintStart_toEndOf="@id/a" app:layout_constraintEnd_toEndOf="parent"
          app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const [a, b] = all(root(xml), "View");
    expect(a.x).toBeCloseTo((360 - 80) / 3, 3);          // gap
    expect(b.x).toBeCloseTo((360 - 80) / 3 * 2 + 40, 3); // gap + size + gap
    expect(a.y).toBe(0);
    expect(b.y).toBe(0);
  });

  it("breaks cyclic anchors without throwing", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <View android:id="@+id/a" android:layout_width="40dp" android:layout_height="10dp"
          app:layout_constraintStart_toEndOf="@id/b" app:layout_constraintTop_toTopOf="parent"/>
      <View android:id="@+id/b" android:layout_width="40dp" android:layout_height="10dp"
          app:layout_constraintStart_toEndOf="@id/a" app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    let box!: PositionedBox;
    expect(() => { box = root(xml); }).not.toThrow();
    const vs = all(box, "View");
    expect(vs).toHaveLength(2);
    expect(Number.isFinite(vs[0].x)).toBe(true);
    expect(Number.isFinite(vs[1].x)).toBe(true);
  });
});
