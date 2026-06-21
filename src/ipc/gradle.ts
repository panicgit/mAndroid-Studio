import { invoke, Channel } from "@tauri-apps/api/core";
import type { BuildEvent, ModuleVariants } from "../types";

/** Run `./gradlew <task> --console=plain` in projectRoot, streaming output lines. */
export function runGradle(
  projectRoot: string,
  task: string,
  javaHome: string | null,
  onEvent: Channel<BuildEvent>,
): Promise<void> {
  return invoke("run_gradle", { projectRoot, task, javaHome, onEvent });
}

/** Kill the running gradle build. */
export const stopGradle = (): Promise<void> => invoke("stop_gradle");

/** List build variants per Android application module (flavor × buildType). */
export const listBuildVariants = (projectRoot: string): Promise<ModuleVariants[]> =>
  invoke("list_build_variants", { projectRoot });
