import { invoke } from "@tauri-apps/api/core";
import type { GitInfo, Diff } from "../types";

/** Working-tree status (branch, ahead/behind, staged, changed). */
export const gitStatus = (root: string): Promise<GitInfo> => invoke("git_status", { root });

/** Unified diff (HEAD → working tree) for one file. */
export const gitDiff = (root: string, path: string): Promise<Diff> =>
  invoke("git_diff", { root, path });
