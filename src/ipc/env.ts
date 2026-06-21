import { invoke } from "@tauri-apps/api/core";
import type { AndroidEnv } from "../types";

/** Detect Android SDK / adb / JDK paths. */
export const detectEnv = (): Promise<AndroidEnv> => invoke("detect_env");
