import { invoke } from "@tauri-apps/api/core";

/** Read a text file (≤4MB) by absolute path. */
export const readFile = (path: string): Promise<string> => invoke("read_file", { path });

/** Read a binary file (≤8MB) by absolute path, returned as RAW base64 (no `data:` prefix). */
export const readFileBase64 = (path: string): Promise<string> => invoke("read_file_base64", { path });

/** Overwrite a file with new content. */
export const writeFile = (path: string, content: string): Promise<void> =>
  invoke("write_file", { path, content });
