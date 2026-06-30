use std::path::Path;

/// A file-tree node. Field names match the frontend `TreeNode`/design shape:
/// name, type ("dir"|"file"), path (absolute), children (dirs only).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsNode {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FsNode>>,
}

// Directories we never descend into (big/noisy). dotfiles are skipped separately.
const EXCLUDE: &[&str] = &[
    ".git", "node_modules", "target", "build", ".gradle", "dist", ".idea",
    ".dart_tool", "Pods", ".next", "out", ".cxx", ".kotlin",
];

fn read_node(path: &Path, depth: usize, max_depth: usize, count: &mut usize, cap: usize) -> Option<FsNode> {
    let name = path.file_name()?.to_string_lossy().to_string();
    if path.is_dir() {
        let mut children = Vec::new();
        if depth < max_depth {
            if let Ok(rd) = std::fs::read_dir(path) {
                let mut ents: Vec<_> = rd.flatten().collect();
                // dirs first, then alphabetical
                ents.sort_by(|a, b| {
                    let ad = a.path().is_dir();
                    let bd = b.path().is_dir();
                    bd.cmp(&ad).then_with(|| a.file_name().cmp(&b.file_name()))
                });
                for e in ents {
                    if *count >= cap {
                        break;
                    }
                    let nm = e.file_name().to_string_lossy().to_string();
                    if nm.starts_with('.') || EXCLUDE.contains(&nm.as_str()) {
                        continue;
                    }
                    *count += 1;
                    if let Some(child) = read_node(&e.path(), depth + 1, max_depth, count, cap) {
                        children.push(child);
                    }
                }
            }
        }
        Some(FsNode {
            name,
            kind: "dir".into(),
            path: path.display().to_string(),
            children: Some(children),
        })
    } else {
        Some(FsNode {
            name,
            kind: "file".into(),
            path: path.display().to_string(),
            children: None,
        })
    }
}

/// Read a project folder into a nested tree (dirs-first, gitignore-ish excludes,
/// depth/entry capped for safety).
#[tauri::command(async)]
pub fn read_tree(root: String) -> Result<FsNode, String> {
    let p = Path::new(&root);
    if !p.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let mut count = 0usize;
    read_node(p, 0, 14, &mut count, 15000).ok_or_else(|| "failed to read tree".into())
}

/// Flat list of file paths (relative to root), .gitignore-aware, for fuzzy
/// file-open (⌘P). Capped.
#[tauri::command(async)]
pub fn list_files(root: String) -> Result<Vec<String>, String> {
    let rootp = Path::new(&root);
    if !rootp.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let mut out = Vec::new();
    for dent in ignore::WalkBuilder::new(rootp).standard_filters(true).build().flatten() {
        if dent.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Ok(rel) = dent.path().strip_prefix(rootp) {
                out.push(rel.to_string_lossy().to_string());
            }
            if out.len() >= 50000 {
                break;
            }
        }
    }
    Ok(out)
}

/// Read a text file (capped at 4 MB).
// `(async)` runs this blocking std::fs read on a worker thread instead of the
// main thread, so opening a (cold/uncached) file never freezes the UI.
#[tauri::command(async)]
pub fn read_file(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 4_000_000 {
        return Err("file too large (>4MB)".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Read a binary file and return its RAW base64 (no `data:` prefix). Capped at 8 MB
/// so fonts/rasters can be embedded as data-URLs in the layout preview. `(async)` keeps
/// the blocking read off the main thread, matching `read_file`.
#[tauri::command(async)]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 8_000_000 {
        return Err("file too large (>8MB)".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(base64_encode(&bytes))
}

/// Minimal standard-alphabet base64 encoder (with padding). Inlined to avoid a new dep.
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { TABLE[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { TABLE[(n & 63) as usize] as char } else { '=' });
    }
    out
}

/// Overwrite a file with new content.
#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::base64_encode;

    #[test]
    fn base64_matches_rfc4648_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foob"), "Zm9vYg==");
        assert_eq!(base64_encode(b"fooba"), "Zm9vYmE=");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
        assert_eq!(base64_encode(&[0xff, 0xff, 0xff]), "////");
    }
}
