use crate::env_detect::resolve_adb;

/// A connected device/emulator. Field names match the frontend `DeviceInfo`
/// type (`type` is serialized from `kind`).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub label: String,
    pub android: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub state: String,
}

/// Parse `adb devices -l` stdout into (serial, state, model) triples.
pub fn parse_devices(stdout: &str) -> Vec<(String, String, String)> {
    stdout
        .lines()
        .skip(1) // header: "List of devices attached"
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            let serial = it.next()?.to_string();
            let state = it.next()?.to_string();
            let model = l
                .split_whitespace()
                .find_map(|t| t.strip_prefix("model:").map(|s| s.to_string()))
                .unwrap_or_default();
            Some((serial, state, model))
        })
        .collect()
}

/// Make sure an adb server is running before we query it.
///
/// On a cold start (no server yet) the very first `adb devices` races the
/// daemon boot and returns an empty list with "cannot connect to daemon:
/// Connection refused" — which is why the device list silently came up empty
/// unless the user had recently run adb in a terminal. `start-server` blocks
/// until the server is up; we give it detached stdio so the forked daemon never
/// inherits (and never blocks on) our captured pipes.
async fn ensure_adb_server(adb: &str) {
    let _ = tokio::process::Command::new(adb)
        .arg("start-server")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await;
}

#[tauri::command]
pub async fn list_devices() -> Result<Vec<DeviceInfo>, String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    eprintln!("[das] list_devices: adb={adb}");
    ensure_adb_server(&adb).await;
    let out = tokio::process::Command::new(&adb)
        .args(["devices", "-l"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let parsed = parse_devices(&String::from_utf8_lossy(&out.stdout));

    let mut devices = Vec::new();
    for (serial, state, model) in parsed {
        let android = if state == "device" {
            tokio::process::Command::new(&adb)
                .args(["-s", &serial, "shell", "getprop", "ro.build.version.release"])
                .output()
                .await
                .ok()
                .map(|o| format!("Android {}", String::from_utf8_lossy(&o.stdout).trim()))
                .unwrap_or_default()
        } else {
            String::new()
        };
        let kind = if serial.starts_with("emulator-") {
            "emulator"
        } else {
            "phone"
        };
        let label = if model.is_empty() {
            serial.clone()
        } else {
            model
        };
        devices.push(DeviceInfo {
            id: serial,
            label,
            android,
            kind: kind.to_string(),
            state,
        });
    }
    eprintln!("[das] list_devices -> {} devices", devices.len());
    Ok(devices)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdbFile {
    pub name: String,
    pub perm: String,
    pub owner: String,
    pub size: String,
    pub date: String,
    pub dir: bool,
}

fn app_id_re() -> &'static regex::Regex {
    use std::sync::LazyLock;
    static RE: LazyLock<regex::Regex> =
        LazyLock::new(|| regex::Regex::new(r#"applicationId\s*[=(]?\s*"([^"]+)""#).unwrap());
    &RE
}

/// Base applicationId declared in a module dir's build.gradle[.kts] (no flavor
/// suffix). Best-effort fallback when no built APK metadata is available.
fn read_app_id_at(dir: &std::path::Path) -> Option<String> {
    for f in ["build.gradle.kts", "build.gradle"] {
        if let Ok(s) = std::fs::read_to_string(dir.join(f)) {
            if let Some(c) = app_id_re().captures(&s) {
                return Some(c[1].to_string());
            }
        }
    }
    None
}

/// Project-level fallback: the conventional `app/` module, then the root.
fn read_app_id(root: &str) -> Option<String> {
    let root = std::path::Path::new(root);
    read_app_id_at(&root.join("app")).or_else(|| read_app_id_at(root))
}

/// `:core:impl` → `core/impl`; `:app` → `app`; `""` → `""`.
fn module_rel_dir(gradle_path: &str) -> String {
    gradle_path.trim_start_matches(':').replace(':', "/")
}

/// Accurate applicationId (including any flavor/buildType suffix) for `variant`,
/// read from the APK's `output-metadata.json` that AGP writes on every build:
/// `<module>/build/outputs/apk/<flavor>/<buildType>/output-metadata.json`.
fn app_id_from_outputs(module_dir: &std::path::Path, variant: &str) -> Option<String> {
    fn walk(dir: &std::path::Path, depth: usize, variant: &str) -> Option<String> {
        if depth > 3 {
            return None;
        }
        for e in std::fs::read_dir(dir).ok()?.flatten() {
            let p = e.path();
            if p.is_dir() {
                if let Some(id) = walk(&p, depth + 1, variant) {
                    return Some(id);
                }
            } else if p.file_name().is_some_and(|n| n == "output-metadata.json") {
                if let Ok(s) = std::fs::read_to_string(&p) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        let vn = v.get("variantName").and_then(|x| x.as_str());
                        let id = v.get("applicationId").and_then(|x| x.as_str());
                        if let (Some(vn), Some(id)) = (vn, id) {
                            if vn == variant {
                                return Some(id.to_string());
                            }
                        }
                    }
                }
            }
        }
        None
    }
    walk(&module_dir.join("build/outputs/apk"), 0, variant)
}

/// Resolve (applicationId, apk path) for `variant` under a module dir from AGP's
/// output-metadata.json. Returns None until the variant has been assembled.
fn resolve_apk(module_dir: &std::path::Path, variant: &str) -> Option<(String, std::path::PathBuf)> {
    fn walk(dir: &std::path::Path, depth: usize, variant: &str) -> Option<(String, std::path::PathBuf)> {
        if depth > 3 {
            return None;
        }
        for e in std::fs::read_dir(dir).ok()?.flatten() {
            let p = e.path();
            if p.is_dir() {
                if let Some(r) = walk(&p, depth + 1, variant) {
                    return Some(r);
                }
            } else if p.file_name().is_some_and(|n| n == "output-metadata.json") {
                if let Ok(s) = std::fs::read_to_string(&p) {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s) {
                        if v.get("variantName").and_then(|x| x.as_str()) == Some(variant) {
                            let id = v.get("applicationId").and_then(|x| x.as_str())?.to_string();
                            let file = v
                                .get("elements")
                                .and_then(|e| e.get(0))
                                .and_then(|e| e.get("outputFile"))
                                .and_then(|x| x.as_str())?;
                            return Some((id, p.parent()?.join(file)));
                        }
                    }
                }
            }
        }
        None
    }
    walk(&module_dir.join("build/outputs/apk"), 0, variant)
}

/// Install the assembled APK for `variant` onto a *single* device (`serial`) and
/// launch it. Run uses this to deploy only to the user-selected target device(s),
/// unlike Gradle's `install` task which installs to every connected device.
#[tauri::command]
pub async fn deploy_variant(
    serial: String,
    project_root: String,
    module: Option<String>,
    variant: String,
) -> Result<String, String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    let root = std::path::Path::new(&project_root);
    let module_dir = match &module {
        Some(m) if !m.is_empty() => root.join(module_rel_dir(m)),
        _ => root.to_path_buf(),
    };
    let (pkg, apk) = resolve_apk(&module_dir, &variant)
        .ok_or_else(|| format!("'{variant}' APK not found — build it first"))?;

    let install = tokio::process::Command::new(&adb)
        .args(["-s", &serial, "install", "-r"])
        .arg(&apk)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&install.stdout);
    if !install.status.success() || stdout.contains("Failure") {
        let err = String::from_utf8_lossy(&install.stderr);
        let msg = if err.trim().is_empty() { stdout.trim() } else { err.trim() };
        return Err(msg.to_string());
    }

    let launch = tokio::process::Command::new(&adb)
        .args(["-s", &serial, "shell", "monkey", "-p", &pkg, "-c", "android.intent.category.LAUNCHER", "1"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !launch.status.success() {
        return Err(String::from_utf8_lossy(&launch.stderr).trim().to_string());
    }
    Ok(pkg)
}

/// Launch the app's default LAUNCHER activity (assumes it is already installed).
/// When `module`/`variant` are given the package is resolved precisely from the
/// built APK metadata (handles per-flavor applicationIdSuffix and multi-app-module
/// projects that have no `app/` module); otherwise it falls back to scanning
/// `app/`/root build.gradle for a bare applicationId.
#[tauri::command]
pub async fn launch_app(
    serial: String,
    project_root: String,
    module: Option<String>,
    variant: Option<String>,
) -> Result<String, String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    let root = std::path::Path::new(&project_root);
    let module_dir = match &module {
        Some(m) if !m.is_empty() => root.join(module_rel_dir(m)),
        _ => root.to_path_buf(),
    };
    let pkg = variant
        .as_deref()
        .and_then(|v| app_id_from_outputs(&module_dir, v))
        .or_else(|| read_app_id_at(&module_dir))
        .or_else(|| read_app_id(&project_root))
        .ok_or_else(|| "applicationId not found (no built APK metadata or build.gradle applicationId)".to_string())?;
    let out = tokio::process::Command::new(&adb)
        .args(["-s", &serial, "shell", "monkey", "-p", &pkg, "-c", "android.intent.category.LAUNCHER", "1"])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(pkg)
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

/// List a directory on the device (`adb shell ls -lAh`).
#[tauri::command]
pub async fn adb_ls(serial: String, path: String) -> Result<Vec<AdbFile>, String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    let out = tokio::process::Command::new(&adb)
        .args(["-s", &serial, "shell", "ls", "-lAh", &path])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut files = Vec::new();
    for line in text.lines() {
        let line = line.trim_end();
        if line.is_empty() || line.starts_with("total") {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 8 {
            continue;
        }
        let perm = parts[0].to_string();
        let dir = perm.starts_with('d');
        let owner = parts[2].to_string();
        let size = parts[4].to_string();
        let date = format!("{} {}", parts[5], parts[6]);
        let name = parts[7..].join(" ");
        if name == "." || name == ".." {
            continue;
        }
        files.push(AdbFile { name, perm, owner, size, date, dir });
    }
    Ok(files)
}

/// Pull a file from device to a local path.
#[tauri::command]
pub async fn adb_pull(serial: String, remote: String, local: String) -> Result<(), String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    let out = tokio::process::Command::new(&adb)
        .args(["-s", &serial, "pull", &remote, &local])
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_devices_l() {
        let s = "List of devices attached\n2210095380             device usb:34865152X product:A800 model:A800 device:A800 transport_id:15\nemulator-5554          offline\n";
        let d = parse_devices(s);
        assert_eq!(d.len(), 2);
        assert_eq!(d[0].0, "2210095380");
        assert_eq!(d[0].1, "device");
        assert_eq!(d[0].2, "A800");
        assert_eq!(d[1].0, "emulator-5554");
        assert_eq!(d[1].1, "offline");
        assert_eq!(d[1].2, "");
    }
}
