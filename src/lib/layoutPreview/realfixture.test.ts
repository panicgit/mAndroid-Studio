import { describe, it, expect } from "vitest";
import { layout } from "./engine";
import { makeStubMeasure } from "./measure";
import { parseLayout } from "./parse";
import { nodePadding } from "./layout/spacing";
import type { LayoutCtx, LNode, PositionedBox } from "./types";

const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<layout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools">
  <data>
    <variable name="vm" type="com.payhere.cat.viewmodel.PayDetailViewModel" />
    <import type="android.view.View" />
  </data>
  <androidx.constraintlayout.widget.ConstraintLayout
      android:layout_width="match_parent" android:layout_height="match_parent">
    <androidx.constraintlayout.widget.ConstraintLayout
        android:layout_width="match_parent" android:layout_height="match_parent"
        android:background="@drawable/r4_white" android:elevation="@dimen/d_500"
        android:orientation="vertical"
        app:layout_constraintLeft_toLeftOf="parent" app:layout_constraintRight_toRightOf="parent">
      <androidx.constraintlayout.widget.ConstraintLayout
          android:id="@+id/cl_top" android:layout_width="match_parent" android:layout_height="64dp"
          app:layout_constraintEnd_toEndOf="parent" app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent">
        <ImageView android:id="@+id/iv_back" android:layout_width="wrap_content" android:layout_height="match_parent"
            android:padding="@dimen/d_800" android:paddingStart="@dimen/d_2000" android:paddingEnd="@dimen/d_1600"
            android:src="@drawable/ic_arrow_left"
            app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"
            tools:text="@string/option_group_sub" />
      </androidx.constraintlayout.widget.ConstraintLayout>
    </androidx.constraintlayout.widget.ConstraintLayout>
  </androidx.constraintlayout.widget.ConstraintLayout>
</layout>`;

const ctx = (): LayoutCtx => ({
  res: {
    string: (n) => (n === "option_group_sub" ? "옵션" : null),
    color: () => null, drawable: () => null,
    dimen: (n) => ({ d_800: 8, d_1600: 16, d_2000: 20, d_500: 5 }[n] ?? null),
  },
  measure: makeStubMeasure(8, 20), density: 2.75, fontScale: 1,
});
const byId = (b: PositionedBox, id: string): PositionedBox | undefined =>
  b.node.id === id ? b : b.children.map((c) => byId(c, id)).find(Boolean);

describe("canonical data-binding fixture", () => {
  it("unwraps to ConstraintLayout root and lays out non-empty", () => {
    const { root, error } = parseLayout(FIXTURE);
    expect(error).toBeNull();
    expect(root!.tag).toContain("ConstraintLayout");
    const box = layout(root!, ctx(), { w: 360, h: 740 });
    expect(box.w).toBe(360);
    expect(box.children.length).toBeGreaterThan(0);
    const clTop = byId(box, "cl_top")!;
    expect(clTop.h).toBe(64); // android:layout_height="64dp"
  });
  it("resolves the ImageView @dimen paddings to dp", () => {
    const { root } = parseLayout(FIXTURE);
    const findIv = (n: LNode): LNode | undefined =>
      n.id === "iv_back" ? n : n.children.map(findIv).find(Boolean);
    const iv = findIv(root!)!;
    expect(nodePadding(iv, ctx())).toEqual({ l: 20, t: 8, r: 16, b: 8 });
  });
});
