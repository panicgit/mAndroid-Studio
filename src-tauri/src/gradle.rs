use std::path::Path;
use std::process::Stdio;
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::build_parse::{classify, parse_diagnostic, BuildDiagnostic};
use crate::state;

/// One line of build output, shaped for the frontend BuildConsole:
/// { t, cls?, error? } — `error` makes the line clickable (jump to file:line).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildEvent {
    pub t: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cls: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<BuildDiagnostic>,
}

fn emit(ch: &Channel<BuildEvent>, raw: &str) {
    let line = crate::build_parse::strip_ansi(raw);
    let diag = parse_diagnostic(&line);
    let cls = if diag.is_some() {
        Some("err".to_string())
    } else {
        classify(&line).map(|s| s.to_string())
    };
    let _ = ch.send(BuildEvent { t: line, cls, error: diag });
}

/// Run `./gradlew <task> --console=plain` in `project_root`, streaming each
/// (interleaved stdout/stderr) line to the frontend. `--console=plain` is
/// required — animated console output breaks line-based streaming.
#[tauri::command]
pub async fn run_gradle(
    app: tauri::AppHandle,
    project_root: String,
    task: String,
    java_home: Option<String>,
    on_event: Channel<BuildEvent>,
) -> Result<(), String> {
    let gradlew = Path::new(&project_root).join("gradlew");
    if !gradlew.exists() {
        return Err("gradlew not found in project root".into());
    }
    // Invoke via `sh` so a missing exec bit on gradlew is not a problem.
    let mut cmd = Command::new("sh");
    cmd.arg(gradlew.to_string_lossy().to_string())
        .arg(&task)
        .arg("--console=plain")
        .current_dir(&project_root);
    if let Some(jh) = &java_home {
        if !jh.is_empty() {
            cmd.env("JAVA_HOME", jh);
        }
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    state::register_child(&app, "gradle", child);

    let mut so = BufReader::new(stdout).lines();
    let mut se = BufReader::new(stderr).lines();
    let mut so_done = false;
    let mut se_done = false;
    loop {
        tokio::select! {
            l = so.next_line(), if !so_done => match l {
                Ok(Some(line)) => emit(&on_event, &line),
                _ => so_done = true,
            },
            l = se.next_line(), if !se_done => match l {
                Ok(Some(line)) => emit(&on_event, &line),
                _ => se_done = true,
            },
            else => break,
        }
        if so_done && se_done {
            break;
        }
    }
    Ok(())
}
