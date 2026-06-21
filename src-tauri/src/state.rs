use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tokio::process::Child;

/// Tracks long-running child processes (adb logcat, gradlew, …) so they can be
/// killed on window close — Tauri does NOT manage child lifecycle for us.
#[derive(Default)]
pub struct AppState {
    pub children: Mutex<HashMap<String, Child>>,
}

/// Register a child under `key`, killing any previous child with the same key.
pub fn register_child(app: &tauri::AppHandle, key: &str, child: Child) {
    let st = app.state::<AppState>();
    let mut m = st.children.lock().unwrap();
    if let Some(mut old) = m.insert(key.to_string(), child) {
        let _ = old.start_kill();
    }
}

/// Kill every tracked child (called on window close / app exit).
pub fn kill_all(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    let mut m = st.children.lock().unwrap();
    for (_, mut c) in m.drain() {
        let _ = c.start_kill();
    }
}

#[tauri::command]
pub fn stop_logcat(app: tauri::AppHandle) {
    let st = app.state::<AppState>();
    let mut m = st.children.lock().unwrap();
    if let Some(mut c) = m.remove("logcat") {
        let _ = c.start_kill();
    }
}

#[tauri::command]
pub fn stop_gradle(app: tauri::AppHandle) {
    let st = app.state::<AppState>();
    let mut m = st.children.lock().unwrap();
    if let Some(mut c) = m.remove("gradle") {
        let _ = c.start_kill();
    }
}
