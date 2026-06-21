use std::path::{Path, PathBuf};

/// Detected Android tooling environment. Field names match the frontend
/// `AndroidEnv` type (camelCase).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidEnv {
    pub sdk_path: Option<String>,
    pub adb_path: Option<String>,
    pub jdk_path: Option<String>,
    pub jdk_version: Option<u32>,
    pub source: String,
}

fn adb_in(sdk: &Path) -> Option<PathBuf> {
    let p = sdk.join("platform-tools").join("adb");
    if p.exists() {
        Some(p)
    } else {
        None
    }
}

/// Locate the SDK + adb via env vars, then the macOS default location.
fn sdk_and_adb() -> (Option<PathBuf>, Option<PathBuf>, &'static str) {
    for (var, src) in [
        ("ANDROID_HOME", "ANDROID_HOME"),
        ("ANDROID_SDK_ROOT", "ANDROID_SDK_ROOT"),
    ] {
        if let Ok(v) = std::env::var(var) {
            let p = PathBuf::from(&v);
            if let Some(adb) = adb_in(&p) {
                return (Some(p), Some(adb), src);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let d = PathBuf::from(home).join("Library/Android/sdk");
        if let Some(adb) = adb_in(&d) {
            return (Some(d), Some(adb), "default");
        }
    }
    (None, None, "none")
}

/// Resolve an adb executable: SDK platform-tools, then PATH, then login shell
/// (GUI apps do not inherit ~/.zshrc, so probe a login shell as a fallback).
pub fn resolve_adb() -> Option<String> {
    if let (_, Some(adb), _) = sdk_and_adb() {
        return Some(adb.display().to_string());
    }
    if let Ok(out) = std::process::Command::new("which").arg("adb").output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    if let Ok(out) = std::process::Command::new("zsh")
        .args(["-lc", "command -v adb"])
        .output()
    {
        let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !s.is_empty() {
            return Some(s);
        }
    }
    None
}

fn detect_jdk() -> (Option<String>, Option<u32>) {
    let path = std::process::Command::new("/usr/libexec/java_home")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    let version = std::process::Command::new("/usr/libexec/java_home")
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            s.split('.').next().and_then(|v| v.trim().parse::<u32>().ok())
        });
    (path, version)
}

#[tauri::command]
pub fn detect_env() -> AndroidEnv {
    let (sdk, adb, src) = sdk_and_adb();
    let adb_path = adb.map(|p| p.display().to_string()).or_else(resolve_adb);
    let (jdk_path, jdk_version) = detect_jdk();
    AndroidEnv {
        sdk_path: sdk.map(|p| p.display().to_string()),
        adb_path,
        jdk_path,
        jdk_version,
        source: src.to_string(),
    }
}
