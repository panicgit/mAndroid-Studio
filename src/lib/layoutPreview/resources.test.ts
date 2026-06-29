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
