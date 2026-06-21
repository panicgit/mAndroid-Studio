import { invoke } from "@tauri-apps/api/core";

/** Read a text file (≤4MB) by absolute path. */
export const readFile = (path: string): Promise<string> => invoke("read_file", { path });

/** Overwrite a file with new content. */
export const writeFile = (path: string, content: string): Promise<void> =>
  invoke("write_file", { path, content });
