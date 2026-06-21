import { invoke } from "@tauri-apps/api/core";
import type { SearchResult, FindOptions } from "../types";

/** Content search via ripgrep (`rg --json`), grouped by file. */
export const searchContent = (root: string, query: string): Promise<SearchResult[]> =>
  invoke("search_content", { root, query });

/** Find in Path — ripgrep with case/word/regex/file-mask/scope options. */
export const findInPath = (root: string, query: string, options: FindOptions): Promise<SearchResult[]> =>
  invoke("find_in_path", { root, query, options });
