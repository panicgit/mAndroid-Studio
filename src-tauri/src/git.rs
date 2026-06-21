use git2::{DiffFormat, DiffOptions, Repository, Status, StatusOptions};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    pub path: String,
    pub status: String, // "M" | "A" | "D" | "R" | "?"
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub branch: String,
    pub ahead: u32,
    pub behind: u32,
    pub staged: Vec<GitFile>,
    pub changed: Vec<GitFile>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffLine {
    pub t: String, // " " | "+" | "-"
    pub l: String,
}
#[derive(Debug, Clone, serde::Serialize)]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}
#[derive(Debug, Clone, serde::Serialize)]
pub struct Diff {
    pub hunks: Vec<DiffHunk>,
}

/// Working-tree git status grouped into staged (index) and changed (worktree).
#[tauri::command]
pub fn git_status(root: String) -> Result<GitInfo, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let branch = repo
        .head()
        .ok()
        .and_then(|h| h.shorthand().map(String::from))
        .unwrap_or_else(|| "HEAD".into());

    let (mut ahead, mut behind) = (0u32, 0u32);
    if let Ok(head) = repo.head() {
        if let (Some(local), Some(name)) = (head.target(), head.name()) {
            if let Ok(up_name) = repo.branch_upstream_name(name) {
                if let Some(up_str) = up_name.as_str() {
                    if let Ok(up_oid) = repo.refname_to_id(up_str) {
                        if let Ok((a, b)) = repo.graph_ahead_behind(local, up_oid) {
                            ahead = a as u32;
                            behind = b as u32;
                        }
                    }
                }
            }
        }
    }

    let mut opts = StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(|e| e.to_string())?;

    let mut staged = Vec::new();
    let mut changed = Vec::new();
    for e in statuses.iter() {
        let path = e.path().unwrap_or("").to_string();
        if path.is_empty() {
            continue;
        }
        let s = e.status();
        if s.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        ) {
            let st = if s.contains(Status::INDEX_NEW) {
                "A"
            } else if s.contains(Status::INDEX_DELETED) {
                "D"
            } else if s.contains(Status::INDEX_RENAMED) {
                "R"
            } else {
                "M"
            };
            staged.push(GitFile { path: path.clone(), status: st.into() });
        }
        if s.intersects(
            Status::WT_NEW | Status::WT_MODIFIED | Status::WT_DELETED | Status::WT_TYPECHANGE | Status::WT_RENAMED,
        ) {
            let st = if s.contains(Status::WT_NEW) {
                "?"
            } else if s.contains(Status::WT_DELETED) {
                "D"
            } else {
                "M"
            };
            changed.push(GitFile { path, status: st.into() });
        }
    }
    Ok(GitInfo { branch, ahead, behind, staged, changed })
}

/// Unified diff (HEAD → working tree, incl. index) for a single file, grouped
/// into hunks for the diff viewer.
#[tauri::command]
pub fn git_diff(root: String, path: String) -> Result<Diff, String> {
    let repo = Repository::open(&root).map_err(|e| e.to_string())?;
    let mut opts = DiffOptions::new();
    opts.pathspec(&path).include_untracked(true).recurse_untracked_dirs(true).context_lines(3);
    let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
    let diff = repo
        .diff_tree_to_workdir_with_index(head_tree.as_ref(), Some(&mut opts))
        .map_err(|e| e.to_string())?;

    let mut hunks: Vec<DiffHunk> = Vec::new();
    diff.print(DiffFormat::Patch, |_delta, _hunk, line| {
        let origin = line.origin();
        let content = String::from_utf8_lossy(line.content())
            .trim_end_matches('\n')
            .to_string();
        match origin {
            'H' => hunks.push(DiffHunk { header: content, lines: Vec::new() }),
            '+' | '-' | ' ' => {
                if hunks.is_empty() {
                    hunks.push(DiffHunk { header: String::new(), lines: Vec::new() });
                }
                if let Some(last) = hunks.last_mut() {
                    last.lines.push(DiffLine { t: origin.to_string(), l: content });
                }
            }
            _ => {} // 'F' file header, etc.
        }
        true
    })
    .map_err(|e| e.to_string())?;

    Ok(Diff { hunks })
}
