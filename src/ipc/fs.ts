import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { FsNode } from "../types";

/** Read a project folder into a nested tree (gitignore-ish, capped). */
export const readTree = (root: string): Promise<FsNode> => invoke("read_tree", { root });

/** Flat, gitignore-aware list of file paths (relative to root) for ⌘P. */
export const listFiles = (root: string): Promise<string[]> => invoke("list_files", { root });

/** Native folder picker → absolute path, or null if cancelled. */
export async function pickFolder(): Promise<string | null> {
  const res = await open({ directory: true, multiple: false });
  return typeof res === "string" ? res : null;
}
