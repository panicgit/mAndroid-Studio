import { describe, it, expect } from "vitest";
import { extractRefs, deriveResDir, buildResFiles } from "./projectResources";

describe("extractRefs", () => {
  const xml = `<LinearLayout>
    <ImageView android:src="@drawable/ic_arrow_left" android:background="@drawable/r4_white"/>
    <include layout="@layout/row_item"/>
    <TextView android:text="@string/x"/>
  </LinearLayout>`;
  it("collects drawable and layout names", () => {
    const r = extractRefs(xml);
    expect([...r.drawables].sort()).toEqual(["ic_arrow_left", "r4_white"]);
    expect([...r.layouts]).toEqual(["row_item"]);
  });
});

describe("deriveResDir", () => {
  it("returns the /res ancestor of a layout file", () => {
    expect(deriveResDir("/Users/x/app/src/main/res/layout/foo.xml"))
      .toBe("/Users/x/app/src/main/res");
  });
  it("handles qualified layout dirs (layout-land)", () => {
    expect(deriveResDir("/p/res/layout-land/bar.xml")).toBe("/p/res");
  });
  it("returns null when not under /res/layout", () => {
    expect(deriveResDir("/p/src/Main.kt")).toBeNull();
  });
});

describe("buildResFiles", () => {
  // Fake injected fs: res dir with values + drawables + an included layout.
  const tree = {
    "/p/res/values/strings.xml": `<resources><string name="x">X</string></resources>`,
    "/p/res/values/dimens.xml": `<resources><dimen name="d_800">8dp</dimen></resources>`,
    "/p/res/drawable/ic_arrow_left.xml": `<vector/>`,
    "/p/res/drawable/r4_white.xml": `<shape/>`,
    "/p/res/drawable/unused.xml": `<shape/>`,
    "/p/res/layout/row_item.xml": `<TextView/>`,
  };
  const listFiles = async (dir: string) =>
    Object.keys(tree).filter((p) => p.startsWith(dir + "/"));
  const readFile = async (p: string) => {
    if (!(p in tree)) throw new Error("ENOENT " + p);
    return tree[p as keyof typeof tree];
  };
  const layoutXml = `<LinearLayout>
    <ImageView android:src="@drawable/ic_arrow_left" android:background="@drawable/r4_white"/>
    <include layout="@layout/row_item"/></LinearLayout>`;

  it("builds an absolute-keyed files map of values + referenced drawables/layouts", async () => {
    const files = await buildResFiles(
      "/p/res/layout/host.xml", layoutXml, { listFiles, readFile });
    // all values*/*.xml included
    expect(files["/p/res/values/strings.xml"]).toContain("<string");
    expect(files["/p/res/values/dimens.xml"]).toContain("d_800");
    // only referenced drawables
    expect(files["/p/res/drawable/ic_arrow_left.xml"]).toBe("<vector/>");
    expect(files["/p/res/drawable/r4_white.xml"]).toBe("<shape/>");
    expect(files["/p/res/drawable/unused.xml"]).toBeUndefined();
    // referenced layout for <include>
    expect(files["/p/res/layout/row_item.xml"]).toBe("<TextView/>");
  });
});
