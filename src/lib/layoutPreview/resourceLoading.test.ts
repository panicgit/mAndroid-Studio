import { describe, it, expect } from "vitest";
import { buildResourceTable } from "./resources";
import { deriveResDir, buildResFiles } from "./projectResources";

const DIMENS = `<resources>
  <dimen name="gap_small">5dp</dimen>
  <dimen name="gap_medium">8dp</dimen>
  <dimen name="gap_large">16dp</dimen>
  <dimen name="icon_size">63dp</dimen>
  <dimen name="text_lg">20sp</dimen>
</resources>`;

const LAYOUT_ABS = "/proj/app/src/main/res/layout/activity_main.xml";

describe("real-project resource loading", () => {
  it("derives the res dir from a real absolute layout path", () => {
    expect(deriveResDir(LAYOUT_ABS)).toBe("/proj/app/src/main/res");
  });
  it("buildResFiles globs values/*.xml and the referenced drawables", async () => {
    const io = {
      listFiles: async (_dir: string) => [
        "/proj/app/src/main/res/values/dimens.xml",
        "/proj/app/src/main/res/values/colors.xml",
        "/proj/app/src/main/res/drawable/ic_back.xml",
        "/proj/app/src/main/res/drawable/unused.xml",
      ],
      readFile: async (p: string) => (p.endsWith("dimens.xml") ? DIMENS : "<x/>"),
    };
    const xml = `<View android:src="@drawable/ic_back"/>`;
    const files = await buildResFiles(LAYOUT_ABS, xml, io);
    expect(files["/proj/app/src/main/res/values/dimens.xml"]).toBe(DIMENS);
    expect("/proj/app/src/main/res/drawable/ic_back.xml" in files).toBe(true);
    expect("/proj/app/src/main/res/drawable/unused.xml" in files).toBe(false); // not referenced
  });
  it("buildResourceTable resolves @dimen/NAME to dp from the dimens", () => {
    const res = buildResourceTable(
      { "/proj/app/src/main/res/values/dimens.xml": DIMENS }, 2.75, 1);
    expect(res.dimen("icon_size")).toBe(63);
    expect(res.dimen("gap_medium")).toBe(8);
    expect(res.dimen("text_lg")).toBe(20);
    expect(res.dimen("missing")).toBeNull();
  });
});
