import { describe, it, expect } from "vitest";
import { buildResourceTable, resolveColor, resolveString } from "./resources";

const FILES: Record<string, string> = {
  "app/src/main/res/values/strings.xml": `<resources>
    <string name="app_name">CafePOS</string>
  </resources>`,
  "app/src/main/res/values/colors.xml": `<resources>
    <color name="brand">#3366FF</color>
  </resources>`,
  "app/src/main/res/values/dimens.xml": `<resources>
    <dimen name="gap">16dp</dimen>
  </resources>`,
};

describe("buildResourceTable", () => {
  const res = buildResourceTable(FILES, 2.75, 1);
  it("resolves @string", () => expect(res.string("app_name")).toBe("CafePOS"));
  it("resolves @color to CSS", () => expect(res.color("brand")).toBe("#3366FF"));
  it("resolves @dimen to dp", () => expect(res.dimen("gap")).toBe(16));
  it("returns null for unknown", () => expect(res.string("nope")).toBeNull());
});

describe("resolve helpers", () => {
  const res = buildResourceTable(FILES, 2.75, 1);
  it("resolveString keeps literal, resolves ref, keeps unresolved ref text", () => {
    expect(resolveString("Hello", res)).toBe("Hello");
    expect(resolveString("@string/app_name", res)).toBe("CafePOS");
    expect(resolveString("@string/missing", res)).toBe("@string/missing");
  });
  it("resolveColor literal and ref", () => {
    expect(resolveColor("#f00", res)).toBe("#ff0000");
    expect(resolveColor("@color/brand", res)).toBe("#3366FF");
    expect(resolveColor("@color/missing", res)).toBeNull();
  });
});

describe("drawable resolution", () => {
  const files: Record<string, string> = {
    "app/src/main/res/drawable/ic_logo.xml": `<vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
      <path android:pathData="M0 0h24v24h-24z" android:fillColor="#3366FF"/></vector>`,
    "app/src/main/res/drawable/bg_pill.xml": `<shape android:shape="rectangle">
      <solid android:color="#FF8800"/><corners android:radius="12dp"/></shape>`,
  };
  const res = buildResourceTable(files, 2.75, 1);
  it("resolves a vector drawable", () => {
    const d = res.drawable("ic_logo");
    expect(d?.kind).toBe("vector");
    if (d?.kind === "vector") expect(d.svg).toContain("<svg");
  });
  it("resolves a shape drawable", () => {
    const d = res.drawable("bg_pill");
    expect(d?.kind).toBe("shape");
    if (d?.kind === "shape") expect(d.css.borderRadius).toBe("12px");
  });
  it("returns null for unknown drawable", () => expect(res.drawable("nope")).toBeNull());
});

describe("theme ?attr colors", () => {
  const res = buildResourceTable({}, 2.75, 1);
  it("resolves ?attr/colorPrimary", () => expect(resolveColor("?attr/colorPrimary", res)).toBe("#6200EE"));
  it("resolves ?colorSurface (no attr/ prefix)", () => expect(resolveColor("?colorSurface", res)).toBe("#FFFFFF"));
  it("resolves ?android:attr/colorPrimaryDark", () => expect(resolveColor("?android:attr/colorPrimaryDark", res)).toBe("#3700B3"));
  it("unknown attr → null", () => expect(resolveColor("?attr/nope", res)).toBeNull());
});
