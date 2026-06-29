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
