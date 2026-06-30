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
    "/p/res/values/dimens.xml": `<resources><dimen name="dp_8">8dp</dimen></resources>`,
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
    expect(files["/p/res/values/dimens.xml"]).toContain("dp_8");
    // only referenced drawables
    expect(files["/p/res/drawable/ic_arrow_left.xml"]).toBe("<vector/>");
    expect(files["/p/res/drawable/r4_white.xml"]).toBe("<shape/>");
    expect(files["/p/res/drawable/unused.xml"]).toBeUndefined();
    // referenced layout for <include>
    expect(files["/p/res/layout/row_item.xml"]).toBe("<TextView/>");
  });
});

describe("buildResFiles binary resources (rasters + fonts)", () => {
  // res dir with a raster drawable + a font file, both referenced by the layout.
  const tree = {
    "/p/res/drawable/photo.png": "PNGBYTES",
    "/p/res/drawable/banner.webp": "WEBPBYTES",
    "/p/res/drawable/unused_raster.png": "NOPE",
    "/p/res/font/pretendard_bold.ttf": "TTFBYTES",
    "/p/res/font/unused_font.otf": "NOPE",
  };
  const listFiles = async (dir: string) =>
    Object.keys(tree).filter((p) => p.startsWith(dir + "/"));
  const readFile = async () => { throw new Error("text reader must not touch binaries"); };
  // Stub base64 reader: echoes a deterministic token so we can assert the data-URL shape.
  const readBinary = async (p: string) => {
    if (!(p in tree)) throw new Error("ENOENT " + p);
    return "B64<" + tree[p as keyof typeof tree] + ">";
  };
  const layoutXml = `<LinearLayout>
    <ImageView android:src="@drawable/photo" android:background="@drawable/banner"/>
    <TextView android:fontFamily="@font/pretendard_bold"/></LinearLayout>`;

  it("emits data-URL entries with correct keys/mime for referenced rasters + fonts", async () => {
    const files = await buildResFiles(
      "/p/res/layout/host.xml", layoutXml, { listFiles, readFile, readBinary });
    expect(files["/p/res/drawable/photo.png"]).toBe("data:image/png;base64,B64<PNGBYTES>");
    expect(files["/p/res/drawable/banner.webp"]).toBe("data:image/webp;base64,B64<WEBPBYTES>");
    expect(files["/p/res/font/pretendard_bold.ttf"]).toBe("data:font/ttf;base64,B64<TTFBYTES>");
    // unreferenced binaries are not read
    expect(files["/p/res/drawable/unused_raster.png"]).toBeUndefined();
    expect(files["/p/res/font/unused_font.otf"]).toBeUndefined();
  });

  it("skips binaries entirely when no readBinary is injected", async () => {
    const files = await buildResFiles(
      "/p/res/layout/host.xml", layoutXml, { listFiles, readFile });
    expect(files["/p/res/drawable/photo.png"]).toBeUndefined();
    expect(files["/p/res/font/pretendard_bold.ttf"]).toBeUndefined();
  });
});
