import { describe, it, expect } from "vitest";
import { parseLayout } from "./parse";

const SPLASH = `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools"
    android:layout_width="match_parent"
    android:layout_height="match_parent">
  <ImageView android:id="@+id/logo"
      android:layout_width="160dp" android:layout_height="160dp"
      android:layout_gravity="center" android:src="@drawable/ic_logo"/>
  <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
      android:layout_gravity="center_horizontal|bottom"
      android:text="@string/app_name" tools:text="CafePOS"/>
</FrameLayout>`;

describe("parseLayout", () => {
  it("strips namespaces and keeps local attr names", () => {
    const { root, error } = parseLayout(SPLASH);
    expect(error).toBeNull();
    expect(root!.tag).toBe("FrameLayout");
    expect(root!.attrs.layout_width).toBe("match_parent");
    expect(root!.children).toHaveLength(2);
  });
  it("extracts android:id local name", () => {
    const { root } = parseLayout(SPLASH);
    expect(root!.children[0].id).toBe("logo");
  });
  it("applies tools: overrides over android:", () => {
    const { root } = parseLayout(SPLASH);
    expect(root!.children[1].attrs.text).toBe("CafePOS"); // tools:text wins
  });
  it("reports an error for malformed XML, root null", () => {
    const { root, error } = parseLayout("<FrameLayout><TextView></FrameLayout>");
    expect(root).toBeNull();
    expect(error).toBeTruthy();
  });
});

describe("parseLayout — data-binding unwrap", () => {
  const DB = `<?xml version="1.0" encoding="utf-8"?>
<layout xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:app="http://schemas.android.com/apk/res-auto">
  <data>
    <variable name="vm" type="com.example.VM" />
    <import type="android.view.View" />
  </data>
  <LinearLayout android:layout_width="match_parent" android:layout_height="match_parent"
      android:orientation="vertical">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"/>
  </LinearLayout>
</layout>`;

  it("unwraps <layout> to its first real child and drops <data>", () => {
    const { root, error } = parseLayout(DB);
    expect(error).toBeNull();
    expect(root!.tag).toBe("LinearLayout");
    expect(root!.children).toHaveLength(1);
    expect(root!.children[0].tag).toBe("TextView");
  });

  it("leaves a normal root untouched", () => {
    expect(parseLayout(SPLASH).root!.tag).toBe("FrameLayout");
  });
});

describe("parseLayout — <include> inlining", () => {
  const HOST = `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
      android:layout_width="match_parent" android:layout_height="match_parent">
    <include layout="@layout/row_item"/>
  </LinearLayout>`;
  const ROW = `<TextView xmlns:android="http://schemas.android.com/apk/res/android"
      android:layout_width="match_parent" android:layout_height="wrap_content"/>`;

  it("substitutes the referenced layout's root", () => {
    const { root } = parseLayout(HOST, { row_item: ROW });
    expect(root!.children[0].tag).toBe("TextView");
  });
  it("placeholder leaf when the layout is missing", () => {
    const { root } = parseLayout(HOST, {});
    expect(root!.children[0].tag).toBe("include");
    expect(root!.children[0].attrs.layout).toBe("@layout/row_item");
  });
});
