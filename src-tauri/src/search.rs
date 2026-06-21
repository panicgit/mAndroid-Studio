use std::collections::BTreeMap;

/// One matched line within a file.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub line: u32,
    pub text: String,
    pub col: u32,
    /// Byte length of the first submatch (for precise UI highlighting).
    pub len: u32,
}

/// Matches grouped by file (path relative to root).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub path: String,
    pub hits: Vec<SearchHit>,
}

/// Options for `find_in_path` — mirrors Android Studio's "Find in Path" toggles.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FindOptions {
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub whole_word: bool,
    #[serde(default)]
    pub regex: bool,
    /// Comma-separated globs, e.g. "*.kt,*.xml". Empty = all files.
    #[serde(default)]
    pub file_mask: String,
    /// Optional path under `root` to scope the search to. Empty = whole project.
    #[serde(default)]
    pub subdir: String,
}

fn resolve_rg() -> String {
    if let Ok(out) = std::process::Command::new("which").arg("rg").output() {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !s.is_empty() {
                return s;
            }
        }
    }
    "rg".into() // fall back to PATH (bundled sidecar comes in packaging)
}

/// Parse ripgrep `--json` stdout into per-file results (paths relative to `root`),
/// capping the number of distinct files at `file_cap`.
fn parse_rg_json(stdout: &[u8], root: &str, file_cap: usize) -> Vec<SearchResult> {
    let mut map: BTreeMap<String, Vec<SearchHit>> = BTreeMap::new();
    let mut order: Vec<String> = Vec::new();
    for line in String::from_utf8_lossy(stdout).lines() {
        let v: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if v.get("type").and_then(|t| t.as_str()) != Some("match") {
            continue;
        }
        let data = &v["data"];
        let abs = data["path"]["text"].as_str().unwrap_or("").to_string();
        let line_no = data["line_number"].as_u64().unwrap_or(0) as u32;
        let text = data["lines"]["text"]
            .as_str()
            .unwrap_or("")
            .trim_end_matches('\n')
            .to_string();
        let sub0 = data["submatches"].get(0);
        let col = sub0.and_then(|s| s["start"].as_u64()).unwrap_or(0) as u32;
        let end = sub0.and_then(|s| s["end"].as_u64()).unwrap_or(col as u64) as u32;
        let rel = std::path::Path::new(&abs)
            .strip_prefix(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(abs);
        if !map.contains_key(&rel) {
            if order.len() >= file_cap {
                continue;
            }
            order.push(rel.clone());
        }
        map.entry(rel).or_default().push(SearchHit {
            line: line_no,
            text,
            col,
            len: end.saturating_sub(col),
        });
    }
    order
        .into_iter()
        .filter_map(|p| map.remove(&p).map(|hits| SearchResult { path: p, hits }))
        .collect()
}

/// Content search via ripgrep `--json`. Smart-case, capped per file and overall.
/// Used by the always-on side Search panel.
#[tauri::command]
pub async fn search_content(root: String, query: String) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let rg = resolve_rg();
    let out = tokio::process::Command::new(&rg)
        .args(["--json", "-S", "--max-count", "50", "--"])
        .arg(&query)
        .arg(&root)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(parse_rg_json(&out.stdout, &root, 200))
}

/// Find in Path — ripgrep with Android-Studio-style options (case, whole word,
/// regex, file mask, scope). Returns per-file hits with precise match offsets.
#[tauri::command]
pub async fn find_in_path(
    root: String,
    query: String,
    options: FindOptions,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(vec![]);
    }
    let rg = resolve_rg();
    let mut cmd = tokio::process::Command::new(&rg);
    cmd.arg("--json").arg("--max-count").arg("100");
    // case
    if options.case_sensitive {
        cmd.arg("-s");
    } else {
        cmd.arg("-i");
    }
    // whole word
    if options.whole_word {
        cmd.arg("-w");
    }
    // regex vs literal
    if !options.regex {
        cmd.arg("-F");
    }
    // file masks (globs)
    for g in options
        .file_mask
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    {
        cmd.arg("-g").arg(g);
    }
    cmd.arg("--").arg(&query);
    // scope: optional subdir under root
    let target = if options.subdir.trim().is_empty() {
        root.clone()
    } else {
        std::path::Path::new(&root)
            .join(options.subdir.trim())
            .to_string_lossy()
            .to_string()
    };
    cmd.arg(&target);

    let out = cmd.output().await.map_err(|e| e.to_string())?;
    Ok(parse_rg_json(&out.stdout, &root, 500))
}
