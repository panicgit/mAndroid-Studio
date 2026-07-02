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

describe("raster drawable resolution", () => {
  const files: Record<string, string> = {
    "app/src/main/res/drawable/ic_x.png": "data:image/png;base64,AAAA",
    "app/src/main/res/drawable-xhdpi/ic_y.webp": "data:image/webp;base64,BBBB",
    "app/src/main/res/drawable/ic_logo.xml": `<vector xmlns:android="http://schemas.android.com/apk/res/android"
        android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
      <path android:pathData="M0 0h24v24h-24z" android:fillColor="#3366FF"/></vector>`,
  };
  const res = buildResourceTable(files, 2.75, 1);
  it("resolves a raster .png data URL", () =>
    expect(res.drawable("ic_x")).toEqual({ kind: "raster", dataUrl: "data:image/png;base64,AAAA" }));
  it("resolves a raster .webp data URL from a density bucket", () =>
    expect(res.drawable("ic_y")).toEqual({ kind: "raster", dataUrl: "data:image/webp;base64,BBBB" }));
  it("still resolves a vector drawable alongside rasters", () =>
    expect(res.drawable("ic_logo")?.kind).toBe("vector"));
});

describe("selector (state-list) drawable resolution", () => {
  it("resolves to the default item's @drawable reference", () => {
    const files: Record<string, string> = {
      "app/src/main/res/drawable/sel.xml": `<selector xmlns:android="http://schemas.android.com/apk/res/android">
        <item android:state_pressed="true" android:drawable="@drawable/pressed"/>
        <item android:drawable="@drawable/base"/>
      </selector>`,
      "app/src/main/res/drawable/base.xml": `<shape android:shape="rectangle"><solid android:color="#FF8800"/></shape>`,
      "app/src/main/res/drawable/pressed.xml": `<shape><solid android:color="#000000"/></shape>`,
    };
    const d = buildResourceTable(files, 2.75, 1).drawable("sel");
    expect(d?.kind).toBe("shape");
    if (d?.kind === "shape") expect(d.css.background).toBe("#FF8800");
  });
  it("resolves an inline default <shape> with a stroke border", () => {
    const files: Record<string, string> = {
      "app/src/main/res/drawable/sel2.xml": `<selector xmlns:android="http://schemas.android.com/apk/res/android">
        <item android:state_pressed="true" android:drawable="@drawable/pressed"/>
        <item><shape android:shape="rectangle"><stroke android:color="@color/primary500" android:width="1dp"/></shape></item>
      </selector>`,
      "app/src/main/res/values/colors.xml": `<resources><color name="primary500">#3366FF</color></resources>`,
    };
    const d = buildResourceTable(files, 2.75, 1).drawable("sel2");
    expect(d?.kind).toBe("shape");
    if (d?.kind === "shape") expect(d.css.border).toBe("1px solid #3366FF");
  });
});

describe("resolveString data-binding expressions", () => {
  const res = buildResourceTable({}, 2.75, 1);
  it("@{...} resolves to empty string", () => expect(resolveString("@{vm.title}", res)).toBe(""));
  it("@={...} two-way resolves to empty string", () => expect(resolveString("@={vm.q}", res)).toBe(""));
  it("plain literal unaffected", () => expect(resolveString("Hello", res)).toBe("Hello"));
});

describe("theme ?attr colors", () => {
  const res = buildResourceTable({}, 2.75, 1);
  it("resolves ?attr/colorPrimary", () => expect(resolveColor("?attr/colorPrimary", res)).toBe("#6200EE"));
  it("resolves ?colorSurface (no attr/ prefix)", () => expect(resolveColor("?colorSurface", res)).toBe("#FFFFFF"));
  it("resolves ?android:attr/colorPrimaryDark", () => expect(resolveColor("?android:attr/colorPrimaryDark", res)).toBe("#3700B3"));
  it("unknown attr → null", () => expect(resolveColor("?attr/nope", res)).toBeNull());
});
