// Android Studio "Android" view — a logical projection of the physical project
// tree (FsNode) onto Gradle modules + virtual groups (manifests / kotlin+java /
// res / assets), mirroring how Android Studio's "Android" pane reorganizes a
// Gradle project. This is a pure transform over the tree already read by Rust's
// `read_tree`; nothing here touches the filesystem.
//
// Faithful behaviors reproduced:
//  - Top level = Gradle modules (dirs containing build.gradle[.kts]).
//  - Per-module virtual groups, in AS order: manifests, kotlin+java, assets, res.
//  - kotlin+java merges src/<set>/java + src/<set>/kotlin and *compacts empty
//    middle packages* into dotted nodes (com.example.app, data.model).
//  - Non-main source sets (test, androidTest, flavors) are suffixed " (set)".
//  - res groups entries by base resource type (drawable, values, …); qualifier
//    folders (values-night, drawable-hdpi) and non-main sets are shown as a
//    " (qualifier)" suffix on each file.
//  - A trailing "Gradle Scripts" node collects build/settings/properties files.
//
// When no Gradle module is found the transform returns null and the caller is
// expected to fall back to the physical ("Project") tree.

import type { FsNode } from "../types";

export type AndroidFileKind = "kotlin" | "java" | "xml" | "manifest" | "gradle" | "properties" | "other";

export type AndroidNodeKind = "module" | "group" | "package" | "resType" | "dir" | "file";

export interface AndroidNode {
  kind: AndroidNodeKind;
  label: string;
  path?: string;            // absolute path for real files/dirs; absent for virtual groups
  fileKind?: AndroidFileKind;
  children?: AndroidNode[];
}

// Dirs we never descend into when scanning for modules (cheap + avoids noise).
const SKIP_DIRS = new Set([
  "build", ".gradle", ".git", ".idea", ".omc", "node_modules", "dist", "target",
  ".dart_tool", ".kotlin", "out",
]);
// When hunting for modules we also don't recurse through these (a module never
// nests another module inside its own source/output dirs).
const NO_RECURSE = new Set([...SKIP_DIRS, "src", "res", "assets"]);

const isGradleBuild = (n: FsNode) =>
  n.type === "file" && (n.name === "build.gradle" || n.name === "build.gradle.kts");

const byName = (a: AndroidNode, b: AndroidNode) => a.label.localeCompare(b.label);
const fsByName = (a: FsNode, b: FsNode) => a.name.localeCompare(b.name);

export function fileKindOf(name: string): AndroidFileKind {
  if (name === "AndroidManifest.xml") return "manifest";
  if (/\.kt$/.test(name)) return "kotlin";
  if (/\.java$/.test(name)) return "java";
  if (/\.kts$/.test(name) || /\.gradle$/.test(name)) return "gradle";
  if (/\.(properties|toml)$/.test(name)) return "properties";
  if (/\.xml$/.test(name)) return "xml";
  return "other";
}

const fileNode = (n: FsNode): AndroidNode => ({
  kind: "file", label: n.name, path: n.path, fileKind: fileKindOf(n.name),
});

// Generic physical subtree → AndroidNode (used for assets and module fallback).
function rawTree(n: FsNode): AndroidNode {
  if (n.type === "file") return fileNode(n);
  return {
    kind: "dir", label: n.name, path: n.path,
    children: (n.children || []).slice().sort(fsByName).map(rawTree),
  };
}

// Merge several lists of FsNode children into one, combining same-named dirs
// recursively (so src/main/java and src/main/kotlin fold into one package tree).
function mergeChildren(sets: FsNode[][]): FsNode[] {
  const map = new Map<string, FsNode>();
  const order: string[] = [];
  for (const set of sets) {
    for (const n of set) {
      const ex = map.get(n.name);
      if (!ex) {
        order.push(n.name);
        map.set(n.name, { ...n, children: n.children ? [...n.children] : n.children });
      } else if (ex.type === "dir" && n.type === "dir") {
        ex.children = mergeChildren([ex.children || [], n.children || []]);
      }
      // file/file or type mismatch → keep the first seen
    }
  }
  return order.map((nm) => map.get(nm) as FsNode);
}

// Compact a package dir: walk down while there is exactly one sub-dir and no
// files (an "empty middle package"), joining segment names with dots.
function collapsePackage(dir: FsNode): AndroidNode {
  const parts = [dir.name];
  let cur = dir;
  for (;;) {
    const kids = cur.children || [];
    const dirs = kids.filter((k) => k.type === "dir");
    const files = kids.filter((k) => k.type === "file");
    if (files.length === 0 && dirs.length === 1) {
      cur = dirs[0];
      parts.push(cur.name);
    } else break;
  }
  const kids = cur.children || [];
  const subPkgs = kids.filter((k) => k.type === "dir").sort(fsByName).map(collapsePackage);
  const classes = kids.filter((k) => k.type === "file").sort(fsByName).map(fileNode);
  return { kind: "package", label: parts.join("."), path: cur.path, children: [...subPkgs, ...classes] };
}

const childDir = (n: FsNode | undefined, name: string): FsNode | undefined =>
  n && (n.children || []).find((c) => c.type === "dir" && c.name === name);

const childFile = (n: FsNode | undefined, name: string): FsNode | undefined =>
  n && (n.children || []).find((c) => c.type === "file" && c.name === name);

// Order source sets with `main` first, then the rest alphabetically.
function orderedSourceSets(srcDir: FsNode | undefined): FsNode[] {
  const sets = srcDir ? (srcDir.children || []).filter((c) => c.type === "dir") : [];
  return sets.slice().sort((a, b) =>
    a.name === "main" ? -1 : b.name === "main" ? 1 : a.name.localeCompare(b.name));
}

// kotlin+java packages for one source set (java + kotlin roots merged).
function packagesForSet(set: FsNode): AndroidNode[] {
  const roots = (set.children || []).filter(
    (c) => c.type === "dir" && (c.name === "java" || c.name === "kotlin"),
  );
  if (!roots.length) return [];
  const merged = mergeChildren(roots.map((r) => r.children || []));
  const pkgs = merged.filter((n) => n.type === "dir").sort(fsByName).map(collapsePackage);
  const loose = merged.filter((n) => n.type === "file").sort(fsByName).map(fileNode);
  return [...pkgs, ...loose];
}

// res entries grouped by base resource type across every source set.
function resGroup(sets: FsNode[]): AndroidNode[] {
  const byType = new Map<string, AndroidNode[]>();
  for (const set of sets) {
    const variant = set.name === "main" ? "" : set.name;
    // a set may carry `res`, `res-…` (rare) — take any dir starting with "res".
    const resDirs = (set.children || []).filter((c) => c.type === "dir" && c.name.split("-")[0] === "res");
    for (const resDir of resDirs) {
      for (const folder of (resDir.children || []).filter((c) => c.type === "dir")) {
        const base = folder.name.split("-")[0];
        const qualifier = folder.name.slice(base.length + 1); // "" | "night" | "hdpi" | …
        const arr = byType.get(base) || [];
        for (const f of (folder.children || []).filter((c) => c.type === "file")) {
          const suffix = [qualifier, variant].filter(Boolean).join(", ");
          arr.push({
            kind: "file", label: f.name + (suffix ? ` (${suffix})` : ""),
            path: f.path, fileKind: fileKindOf(f.name),
          });
        }
        byType.set(base, arr);
      }
    }
  }
  return [...byType.keys()].sort().map((base) => ({
    kind: "resType" as const, label: base,
    children: (byType.get(base) as AndroidNode[]).sort(byName),
  }));
}

function buildModule(moduleDir: FsNode, label: string): AndroidNode {
  const src = childDir(moduleDir, "src");
  const sets = orderedSourceSets(src);
  const groups: AndroidNode[] = [];

  // manifests
  const manifests: AndroidNode[] = [];
  for (const set of sets) {
    const mf = childFile(set, "AndroidManifest.xml");
    if (mf) {
      manifests.push({
        kind: "file",
        label: "AndroidManifest.xml" + (set.name !== "main" ? ` (${set.name})` : ""),
        path: mf.path, fileKind: "manifest",
      });
    }
  }
  if (manifests.length) groups.push({ kind: "group", label: "manifests", children: manifests });

  // kotlin+java
  const kj: AndroidNode[] = [];
  for (const set of sets) {
    const pkgs = packagesForSet(set);
    if (set.name !== "main") {
      for (const p of pkgs) kj.push({ ...p, label: `${p.label} (${set.name})` });
    } else {
      kj.push(...pkgs);
    }
  }
  if (kj.length) groups.push({ kind: "group", label: "kotlin+java", children: kj });

  // assets (raw subtree)
  const assets: AndroidNode[] = [];
  for (const set of sets) {
    const a = childDir(set, "assets");
    if (a) for (const c of (a.children || []).slice().sort(fsByName)) assets.push(rawTree(c));
  }
  if (assets.length) groups.push({ kind: "group", label: "assets", children: assets });

  // res
  const res = resGroup(sets);
  if (res.length) groups.push({ kind: "group", label: "res", children: res });

  // No recognizable Android source layout → show the module's raw contents so the
  // tree stays usable for plain JVM/util modules.
  if (!groups.length) {
    return {
      kind: "module", label, path: moduleDir.path,
      children: (moduleDir.children || []).slice().sort(fsByName).map(rawTree),
    };
  }
  return { kind: "module", label, path: moduleDir.path, children: groups };
}

interface FoundModule { dir: FsNode; label: string; }

function findModules(root: FsNode): FoundModule[] {
  const out: FoundModule[] = [];
  // The root build.gradle is usually the umbrella project (no sources of its
  // own) — Android Studio keeps that under "Gradle Scripts", not as a module.
  // Only treat the root as a module when it actually holds a `src/` tree.
  if ((root.children || []).some(isGradleBuild) && childDir(root, "src")) {
    out.push({ dir: root, label: root.name || "app" });
  }
  const walk = (node: FsNode, rel: string) => {
    const kids = node.children || [];
    if (kids.some(isGradleBuild)) out.push({ dir: node, label: rel.split("/").join(".") });
    for (const c of kids) {
      if (c.type === "dir" && !NO_RECURSE.has(c.name)) walk(c, rel ? `${rel}/${c.name}` : c.name);
    }
  };
  for (const c of (root.children || [])) {
    if (c.type === "dir" && !NO_RECURSE.has(c.name)) walk(c, c.name);
  }
  return out;
}

// Gradle Scripts: top-level + per-module build/config files, AS-style.
function gradleScripts(root: FsNode, modules: FoundModule[]): AndroidNode | null {
  const scriptRe = /^(settings\.gradle(\.kts)?|build\.gradle(\.kts)?|gradle\.properties|gradle-wrapper\.properties|libs\.versions\.toml|.*\.gradle(\.kts)?)$/;
  const items: AndroidNode[] = [];
  const seen = new Set<string>();
  const pushFile = (f: FsNode, suffix?: string) => {
    if (seen.has(f.path)) return;
    seen.add(f.path);
    items.push({
      kind: "file", label: f.name + (suffix ? ` (${suffix})` : ""),
      path: f.path, fileKind: fileKindOf(f.name),
    });
  };
  for (const c of (root.children || [])) {
    if (c.type === "file" && scriptRe.test(c.name)) pushFile(c);
  }
  // gradle/libs.versions.toml lives one level down
  const gradleDir = childDir(root, "gradle");
  if (gradleDir) for (const c of (gradleDir.children || [])) {
    if (c.type === "file" && /\.(toml|properties)$/.test(c.name)) pushFile(c);
  }
  for (const m of modules) {
    if (m.dir === root) continue;
    for (const c of (m.dir.children || [])) {
      if (c.type === "file" && isGradleBuild(c)) pushFile(c, `:${m.label}`);
    }
  }
  if (!items.length) return null;
  return { kind: "group", label: "Gradle Scripts", children: items };
}

/** Project tree → Android-view nodes, or null when it isn't a Gradle project. */
export function buildAndroidView(root: FsNode | null | undefined): AndroidNode[] | null {
  if (!root) return null;
  const modules = findModules(root);
  if (!modules.length) return null;
  const moduleNodes = modules.map((m) => buildModule(m.dir, m.label)).sort(byName);
  const scripts = gradleScripts(root, modules);
  return scripts ? [...moduleNodes, scripts] : moduleNodes;
}
