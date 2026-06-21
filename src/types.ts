// Shared IPC contracts — mirror the Rust serde structs (camelCase).

export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogLine {
  id: number;
  ts: string;
  pid: number;
  tid: number;
  level: LogLevel | string;
  tag: string;
  msg: string;
}

export interface DeviceInfo {
  id: string;
  label: string;
  android: string;
  type: string; // "phone" | "emulator"
  state: string; // "device" | "offline" | "unauthorized" | ...
}

export interface AndroidEnv {
  sdkPath: string | null;
  adbPath: string | null;
  jdkPath: string | null;
  jdkVersion: number | null;
  source: string;
}

export interface FsNode {
  name: string;
  type: "dir" | "file";
  path: string; // absolute
  git?: "M" | "A" | "D";
  children?: FsNode[];
}

export interface SearchHit {
  line: number;
  text: string;
  col: number;
  len?: number; // byte length of the first submatch (for precise highlighting)
}

export interface FindOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  fileMask: string; // comma-separated globs, e.g. "*.kt,*.xml"
  subdir?: string; // optional path under root to scope to
}

export interface SearchResult {
  path: string; // relative to project root
  hits: SearchHit[];
}

export interface BuildDiagnostic {
  path: string; // absolute
  line: number;
  col: number;
  msg: string;
}

export interface BuildEvent {
  t: string;
  cls?: string; // "ok" | "err" | "dim"
  error?: BuildDiagnostic;
}

// Build variants of one Android application module (AS "Build Variants" panel).
export interface ModuleVariants {
  gradlePath: string; // ":app"; "" for an app at the project root
  name: string;       // "app"
  variants: string[]; // ["devDebug", "devRelease", …] (lowerCamel)
}

// A concrete build-variant selection: module + variant.
export interface VariantSelection {
  module: string;  // gradlePath, e.g. ":app"
  variant: string; // "devDebug"
}

export interface GitFile {
  path: string;
  status: string; // "M" | "A" | "D" | "R" | "?"
}

export interface GitInfo {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFile[];
  changed: GitFile[];
}

export interface DiffLine {
  t: string; // " " | "+" | "-"
  l: string;
}
export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}
export interface Diff {
  hunks: DiffHunk[];
}

export interface AdbFile {
  name: string;
  perm: string;
  owner: string;
  size: string;
  date: string;
  dir: boolean;
}
