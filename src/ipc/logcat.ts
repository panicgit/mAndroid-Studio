import { invoke, Channel } from "@tauri-apps/api/core";
import type { LogLine } from "../types";

/** Start streaming `adb logcat` for `serial` (omit for default device).
 *  Parsed lines arrive in batches on `onBatch`. Resolves when the stream ends. */
export function startLogcat(
  serial: string | undefined,
  filterspec: string | undefined,
  onBatch: Channel<LogLine[]>,
): Promise<void> {
  return invoke("start_logcat", { serial, filterspec, onBatch });
}

/** Stop the active logcat stream (kills the adb child). */
export function stopLogcat(): Promise<void> {
  return invoke("stop_logcat");
}
