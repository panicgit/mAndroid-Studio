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

  it("adds the leading margin when anchoring start_toEndOf a sibling", () => {
    // sibling "ABCDE" = 5*8 = 40 wide at x=0; child has marginStart=4 → x = 40 + 4 = 44.
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="wrap_content">
      <TextView android:id="@+id/sib" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="ABCDE"
          app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"/>
      <TextView android:id="@+id/unit" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="X" android:layout_marginStart="4dp"
          app:layout_constraintStart_toEndOf="@id/sib" app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const [sib, unit] = all(root(xml), "TextView");
    expect(sib.x + sib.w).toBe(40);
    expect(unit.x).toBe(44); // sibling.right(40) + marginStart(4), not flush at 40
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

  it("wrap_content height is not inflated by a child bottom_toBottomOf=parent", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="wrap_content">
      <View android:id="@+id/v" android:layout_width="match_parent" android:layout_height="40dp"
          app:layout_constraintTop_toTopOf="parent" app:layout_constraintBottom_toBottomOf="parent"/>
    </${CL}>`;
    // big available height stands in for a ScrollView's unbounded measure
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 100000 });
    const v = all(box, "View")[0];
    expect(v.y).toBe(0);
    expect(box.h).toBe(40);     // sizes to the child, NOT the 100000 extent
  });

  it("single-side wrap_content leaf keeps its intrinsic measured width (regression guard)", () => {
    // Engine must NOT narrow a leaf that is only constrained on one side.
    // makeStubMeasure(8, 20): charW=8, lineH=20.
    // "ABCDEFGH" = 8 chars → intrinsic w=64, h=20 (single line).
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="match_parent">
      <TextView android:id="@+id/t" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="ABCDEFGH"
          app:layout_constraintLeft_toLeftOf="parent"
          app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const t = all(root(xml), "TextView")[0];
    expect(t.w).toBe(64);   // 8 chars * charW(8) — intrinsic, NOT narrowed/wrapped
    expect(t.h).toBe(20);   // single line (lineH), not 2 lines
    expect(t.x).toBe(0);
  });

  it("aligns a single-side bottom-anchored child to the trailing edge (fixed height)", () => {
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="200dp">
      <View android:id="@+id/v" android:layout_width="40dp" android:layout_height="40dp"
          app:layout_constraintBottom_toBottomOf="parent"/>
    </${CL}>`;
    const v = all(root(xml), "View")[0];
    expect(v.y).toBe(160); // 200 - 40, NOT 0
  });

  it("bottom-aligns a single-side trailing child within a wrap_content container", () => {
    // Mirrors amount_container: a top-anchored child sets the content extent and a
    // shorter trailing-only child must bottom-align inside it (not pin to the top).
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="wrap_content">
      <View android:id="@+id/a" android:layout_width="match_parent" android:layout_height="40dp"
          app:layout_constraintTop_toTopOf="parent"/>
      <View android:id="@+id/b" android:layout_width="20dp" android:layout_height="20dp"
          app:layout_constraintStart_toStartOf="parent"
          app:layout_constraintBottom_toBottomOf="parent"/>
    </${CL}>`;
    const box = layout(parseLayout(xml).root!, ctx(), { w: 360, h: 800 });
    const [a, b] = all(box, "View");
    expect(a.y).toBe(0);
    expect(b.y).toBe(20); // content extent 40 - child 20, bottom-aligned (NOT 0)
    expect(box.h).toBe(40);
  });

  it("constraintStart_toEndOf chain has no overlap (regression guard)", () => {
    // makeStubMeasure(8, 20): charW=8, lineH=20.
    // Mirrors captured_amount(5ch)/unit1(1ch)/captured_amount_split(5ch)/unit2(1ch) chain.
    // a: 5ch = w40, anchored start=parent start
    // b: 1ch = w8, marginStart=4  → x = 0+40+4 = 44
    // c: 5ch = w40, marginStart=8 → x = 44+8+8 = 60
    // d: 1ch = w8, marginStart=4  → x = 60+40+4 = 104
    const xml = `<${CL} ${NS} android:layout_width="match_parent" android:layout_height="wrap_content">
      <TextView android:id="@+id/a" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="ABCDE"
          app:layout_constraintStart_toStartOf="parent"
          app:layout_constraintTop_toTopOf="parent"/>
      <TextView android:id="@+id/b" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="X"
          android:layout_marginStart="4dp"
          app:layout_constraintStart_toEndOf="@id/a"
          app:layout_constraintTop_toTopOf="parent"/>
      <TextView android:id="@+id/c" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="FGHIJ"
          android:layout_marginStart="8dp"
          app:layout_constraintStart_toEndOf="@id/b"
          app:layout_constraintTop_toTopOf="parent"/>
      <TextView android:id="@+id/d" android:layout_width="wrap_content" android:layout_height="wrap_content"
          android:text="Y"
          android:layout_marginStart="4dp"
          app:layout_constraintStart_toEndOf="@id/c"
          app:layout_constraintTop_toTopOf="parent"/>
    </${CL}>`;
    const [a, b, c, d] = all(root(xml), "TextView");
    expect(a.x).toBe(0);   expect(a.w).toBe(40);
    expect(b.x).toBe(44);  expect(b.w).toBe(8);   // a.x + a.w + 4
    expect(c.x).toBe(60);  expect(c.w).toBe(40);  // b.x + b.w + 8
    expect(d.x).toBe(104); expect(d.w).toBe(8);   // c.x + c.w + 4
    // no overlap: each start >= previous right
    expect(b.x).toBeGreaterThanOrEqual(a.x + a.w);
    expect(c.x).toBeGreaterThanOrEqual(b.x + b.w);
    expect(d.x).toBeGreaterThanOrEqual(c.x + c.w);
  });
});
