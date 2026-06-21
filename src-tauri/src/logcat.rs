use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::ipc::Channel;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use crate::env_detect::resolve_adb;
use crate::logcat_parse::{parse_line, LogLine};
use crate::state;

static SEQ: AtomicU64 = AtomicU64::new(0);

// Flush the batch to the frontend at most ~30x/sec or when it hits this size,
// whichever comes first. Batching (vs one IPC message per line) is what keeps
// the WebView responsive and memory bounded under high-volume logcat.
const BATCH_MAX: usize = 512;
const FLUSH_MS: u64 = 33;

/// Spawn `adb [-s serial] logcat -v threadtime [filterspec]`, parse each line in
/// Rust, and stream batches to the frontend over a Channel. Runs until the child
/// exits (stopped via `stop_logcat`, which closes stdout → EOF).
#[tauri::command]
pub async fn start_logcat(
    app: tauri::AppHandle,
    serial: Option<String>,
    filterspec: Option<String>,
    on_batch: Channel<Vec<LogLine>>,
) -> Result<(), String> {
    let adb = resolve_adb().ok_or_else(|| "adb not found".to_string())?;
    eprintln!("[das] start_logcat: serial={serial:?} adb={adb}");

    let mut cmd = Command::new(&adb);
    if let Some(s) = &serial {
        cmd.arg("-s").arg(s);
    }
    cmd.arg("logcat").arg("-v").arg("threadtime");
    // Show only the last N buffered lines on connect (avoid a huge full-buffer dump burst).
    cmd.arg("-T").arg("250");
    if let Some(f) = &filterspec {
        for a in f.split_whitespace() {
            cmd.arg(a);
        }
    }
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);

    let mut child = cmd.spawn().map_err(|e| {
        eprintln!("[das] logcat spawn failed: {e}");
        e.to_string()
    })?;
    eprintln!("[das] logcat child spawned (serial={serial:?})");
    let stdout = child.stdout.take().ok_or_else(|| "no stdout".to_string())?;
    // Hand ownership to the shared registry so it can be killed on close/replace.
    state::register_child(&app, "logcat", child);

    let mut lines = BufReader::new(stdout).lines();
    let mut batch: Vec<LogLine> = Vec::with_capacity(BATCH_MAX);
    let mut last_level = String::from("I");
    let mut ticker = tokio::time::interval(std::time::Duration::from_millis(FLUSH_MS));

    loop {
        tokio::select! {
            next = lines.next_line() => {
                match next {
                    Ok(Some(line)) => {
                        let id = SEQ.fetch_add(1, Ordering::Relaxed);
                        let ll = parse_line(&line, id, &last_level);
                        last_level = ll.level.clone();
                        batch.push(ll);
                        if batch.len() >= BATCH_MAX
                            && on_batch.send(std::mem::take(&mut batch)).is_err()
                        {
                            break;
                        }
                    }
                    // EOF (stopped) or read error → flush remainder and stop.
                    _ => {
                        if !batch.is_empty() {
                            let _ = on_batch.send(std::mem::take(&mut batch));
                        }
                        break;
                    }
                }
            }
            _ = ticker.tick() => {
                if !batch.is_empty() && on_batch.send(std::mem::take(&mut batch)).is_err() {
                    break;
                }
            }
        }
    }
    Ok(())
}
