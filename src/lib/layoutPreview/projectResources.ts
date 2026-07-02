// Pure project-resource collection for the layout preview. NO @tauri-apps imports.
// The real Tauri readers are injected (see editor.tsx); tests inject fakes.

export interface ResReaders {
  listFiles: (dir: string) => Promise<string[]>; // absolute paths under dir
  readFile: (path: string) => Promise<string>;
  // Read a binary file as RAW base64 (no `data:` prefix). Optional: when absent,
  // binary drawables/fonts are simply skipped (tests can omit it).
  readBinary?: (path: string) => Promise<string>;
}

export interface Refs { drawables: Set<string>; layouts: Set<string>; fonts: Set<string> }

// Scan a layout XML for @drawable/NAME (src/background/anywhere), @layout/NAME
// (from <include layout="@layout/NAME">) and @font/NAME (fontFamily). Cheap regex
// scan — no DOM needed.
export function extractRefs(xml: string): Refs {
  const drawables = new Set<string>();
  const layouts = new Set<string>();
  const fonts = new Set<string>();
  for (const m of xml.matchAll(/@drawable\/([A-Za-z0-9_]+)/g)) drawables.add(m[1]);
  for (const m of xml.matchAll(/@layout\/([A-Za-z0-9_]+)/g)) layouts.add(m[1]);
  for (const m of xml.matchAll(/@font\/([A-Za-z0-9_]+)/g)) fonts.add(m[1]);
  return { drawables, layouts, fonts };
}

// MIME for a referenced binary resource extension (rasters + fonts).
function binaryMime(ext: string): string | null {
  switch (ext.toLowerCase()) {
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "ttf": return "font/ttf";
    case "otf": return "font/otf";
    default: return null;
  }
}

// "/…/res/layout[-qual]/file.xml" → "/…/res"; null if not a layout resource path.
export function deriveResDir(absPath: string): string | null {
  const m = /^(.*\/res)\/layout[^/]*\/[^/]+\.xml$/.exec(absPath);
  return m ? m[1] : null;
}

// Build a files map (absolute path → content) for the open layout's project:
// every res/values*/*.xml, plus the drawables and included layouts the XML references.
export async function buildResFiles(
  layoutPath: string, layoutXml: string, io: ResReaders,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const resDir = deriveResDir(layoutPath);
  if (!resDir) return out;

  let paths: string[];
  try { paths = await io.listFiles(resDir); } catch { return out; }

  const refs = extractRefs(layoutXml);
  const wanted: string[] = [];
  // Binary resources (rasters/fonts) → read as base64, stored as `data:<mime>;base64,…`.
  const binaries: Array<{ path: string; mime: string }> = [];
  for (const p of paths) {
    if (/\/res\/values[^/]*\/[^/]+\.xml$/.test(p)) { wanted.push(p); continue; }
    const dm = /\/res\/drawable[^/]*\/([^/]+)\.xml$/.exec(p);
    if (dm && refs.drawables.has(dm[1])) { wanted.push(p); continue; }
    const lm = /\/res\/layout[^/]*\/([^/]+)\.xml$/.exec(p);
    if (lm && refs.layouts.has(lm[1])) { wanted.push(p); continue; }
    const rm = /\/res\/drawable[^/]*\/([^/]+)\.(png|webp|jpg|jpeg)$/i.exec(p);
    if (rm && refs.drawables.has(rm[1])) {
      const mime = binaryMime(rm[2]);
      if (mime) binaries.push({ path: p, mime });
      continue;
    }
    const fm = /\/res\/font[^/]*\/([^/]+)\.(ttf|otf)$/i.exec(p);
    if (fm && refs.fonts.has(fm[1])) {
      const mime = binaryMime(fm[2]);
      if (mime) binaries.push({ path: p, mime });
      continue;
    }
  }
  await Promise.all([
    ...wanted.map(async (p) => {
      try { out[p] = await io.readFile(p); } catch { /* skip unreadable */ }
    }),
    ...(io.readBinary
      ? binaries.map(async ({ path, mime }) => {
          try { out[path] = `data:${mime};base64,${await io.readBinary!(path)}`; }
          catch { /* skip unreadable */ }
        })
      : []),
  ]);
  return out;
}
