import { describe, it, expect } from "vitest";
import { layout } from "./engine";
import { makeStubMeasure } from "./measure";
import { parseLayout } from "./parse";
import { nodePadding } from "./layout/spacing";
import type { LayoutCtx, LNode, PositionedBox } from "./types";

// A data-binding <layout> wrapping nested ConstraintLayouts that exercises:
// <data> stripping, @dimen padding refs, and a fixed-height inner container.
const FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<layout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto"
    xmlns:tools="http://schemas.android.com/tools">
  <data>
    <variable name="vm" type="com.example.app.MyViewModel" />
    <import type="android.view.View" />
  </data>
  <androidx.constraintlayout.widget.ConstraintLayout
      android:layout_width="match_parent" android:layout_height="match_parent">
    <androidx.constraintlayout.widget.ConstraintLayout
        android:layout_width="match_parent" android:layout_height="match_parent"
        android:background="@drawable/bg_card" android:elevation="@dimen/elev_card"
        android:orientation="vertical"
        app:layout_constraintLeft_toLeftOf="parent" app:layout_constraintRight_toRightOf="parent">
      <androidx.constraintlayout.widget.ConstraintLayout
          android:id="@+id/header" android:layout_width="match_parent" android:layout_height="64dp"
          app:layout_constraintEnd_toEndOf="parent" app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent">
        <ImageView android:id="@+id/icon" android:layout_width="wrap_content" android:layout_height="match_parent"
            android:padding="@dimen/pad_all" android:paddingStart="@dimen/pad_start" android:paddingEnd="@dimen/pad_end"
            android:src="@drawable/ic_back"
            app:layout_constraintStart_toStartOf="parent" app:layout_constraintTop_toTopOf="parent"
            tools:text="@string/label" />
      </androidx.constraintlayout.widget.ConstraintLayout>
    </androidx.constraintlayout.widget.ConstraintLayout>
  </androidx.constraintlayout.widget.ConstraintLayout>
</layout>`;

const ctx = (): LayoutCtx => ({
  res: {
    string: (n) => (n === "label" ? "Label" : null),
    color: () => null, drawable: () => null,
    dimen: (n) => ({ pad_all: 8, pad_end: 16, pad_start: 20, elev_card: 5 }[n] ?? null),
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
    const header = byId(box, "header")!;
    expect(header.h).toBe(64); // android:layout_height="64dp"
  });
  it("resolves the ImageView @dimen paddings to dp", () => {
    const { root } = parseLayout(FIXTURE);
    const findIcon = (n: LNode): LNode | undefined =>
      n.id === "icon" ? n : n.children.map(findIcon).find(Boolean);
    const icon = findIcon(root!)!;
    expect(nodePadding(icon, ctx())).toEqual({ l: 20, t: 8, r: 16, b: 8 });
  });
});
