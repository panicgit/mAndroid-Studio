import { invoke } from "@tauri-apps/api/core";
import type { DeviceInfo, AdbFile } from "../types";

/** List connected devices/emulators (`adb devices -l` + getprop). */
export const listDevices = (): Promise<DeviceInfo[]> => invoke("list_devices");

/**
 * Launch the installed app's default activity on a device. Returns the package id.
 * `module` (gradle path, e.g. ":app") + `variant` ("devDebug") let the backend
 * resolve the exact package from the built APK metadata; both optional.
 */
export const launchApp = (
  serial: string,
  projectRoot: string,
  module?: string,
  variant?: string,
): Promise<string> =>
  invoke("launch_app", { serial, projectRoot, module: module ?? null, variant: variant ?? null });

/**
 * Build-aware deploy: install the assembled APK for `variant` (under gradle
 * `module`, e.g. ":app") onto ONE device and launch it. Returns the package id.
 * Used by Run so deployment targets only the selected device(s).
 */
export const deployVariant = (
  serial: string,
  projectRoot: string,
  module: string,
  variant: string,
): Promise<string> =>
  invoke("deploy_variant", { serial, projectRoot, module: module || null, variant });

/** List a directory on the device (`adb shell ls -lAh`). */
export const adbLs = (serial: string, path: string): Promise<AdbFile[]> =>
  invoke("adb_ls", { serial, path });

/** Pull a file from device to a local path. */
export const adbPull = (serial: string, remote: string, local: string): Promise<void> =>
  invoke("adb_pull", { serial, remote, local });
