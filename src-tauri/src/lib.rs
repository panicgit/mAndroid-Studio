mod build_parse;
mod device;
mod env_detect;
mod fs_tree;
mod git;
mod gradle;
mod logcat;
mod logcat_parse;
mod search;
mod state;
mod variants;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AppState::default())
        .invoke_handler(tauri::generate_handler![
            env_detect::detect_env,
            device::list_devices,
            logcat::start_logcat,
            state::stop_logcat,
            fs_tree::read_tree,
            fs_tree::list_files,
            fs_tree::read_file,
            fs_tree::write_file,
            search::search_content,
            search::find_in_path,
            gradle::run_gradle,
            variants::list_build_variants,
            state::stop_gradle,
            git::git_status,
            git::git_diff,
            device::launch_app,
            device::deploy_variant,
            device::adb_ls,
            device::adb_pull,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Kill any spawned children (adb logcat, …) so we don't orphan them.
                state::kill_all(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
