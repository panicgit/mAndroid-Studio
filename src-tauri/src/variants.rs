// Build-variant detection — the data behind das's "Build Variant" selector,
// mirroring Android Studio's Build Variants panel. For each Android application
// module we compute the cross product of product flavors × build types
// (e.g. dev/qa/prd × debug/release → devDebug, devRelease, …) so the toolbar can
// run a *fully-qualified* task like `:app:installDevDebug`. Without this the
// frontend fell back to a bare `installDebug`, which Gradle rejects as ambiguous
// in any project that declares product flavors.
//
// Detection is a deliberately small, offline DSL parse (no Gradle invocation):
//  - Walk the tree for `build.gradle[.kts]` files applying `com.android.application`.
//  - Inside each module's `android { … }` block, read the *direct* child block
//    names of `productFlavors { … }` and `buildTypes { … }` using brace-aware
//    scanning that ignores braces inside strings and comments. This is what makes
//    it robust against the common traps: `signingConfigs { debug { … } }` (whose
//    debug/release blocks must NOT be treated as build types) and a module that
//    declares `buildTypes { … }` more than once (we take the first inside android).
//  - Build types are always unioned with the AGP defaults debug + release.
//
// Limitation: a single flavor dimension is assumed (the overwhelmingly common
// case). Multi-dimension flavor combos are not enumerated.

use std::path::Path;

/// The installable/assemblable variants of one application module.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleVariants {
    /// Gradle task path prefix, e.g. ":app" (empty for an app at the root).
    pub gradle_path: String,
    /// Bare module name for display, e.g. "app".
    pub name: String,
    /// Variant names in lowerCamel, e.g. ["devDebug", "devRelease", …].
    pub variants: Vec<String>,
}

const SKIP_DIRS: &[&str] = &[
    "build", ".gradle", ".git", ".idea", ".omc", "node_modules", "dist", "target",
    ".dart_tool", ".kotlin", "out", "src", "res", "assets",
];

/// Return the body of the first block named `name` (matched as a whole word and
/// immediately followed by `{`) within `s`, or None. The scan skips occurrences
/// of `name` inside strings and // … / /* … */ comments, so a commented-out
/// `productFlavors { … }` (common in real build.gradle files) is not mistaken
/// for a real declaration.
fn find_block<'a>(s: &'a str, name: &str) -> Option<&'a str> {
    let b = s.as_bytes();
    let nb = name.as_bytes();
    let mut i = 0usize;
    let mut quote: u8 = 0;
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        if c == b'/' && i + 1 < b.len() && b[i + 1] == b'/' {
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if c == b'/' && i + 1 < b.len() && b[i + 1] == b'*' {
            i += 2;
            while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                i += 1;
            }
            i += 2;
            continue;
        }
        if c == b'"' || c == b'\'' {
            quote = c;
            i += 1;
            continue;
        }
        // Code context: try to match `name` as a whole word followed by `{`.
        if c == nb[0] && b[i..].starts_with(nb) {
            let prev_ok = i == 0 || !is_ident(b[i - 1]);
            let after = i + nb.len();
            if prev_ok {
                let mut j = after;
                while j < b.len() && (b[j] as char).is_whitespace() {
                    j += 1;
                }
                if j < b.len() && b[j] == b'{' {
                    if let Some(body) = block_body(s, j) {
                        return Some(body);
                    }
                }
            }
            i = after; // skip past this identifier either way
            continue;
        }
        i += 1;
    }
    None
}

fn is_ident(c: u8) -> bool {
    c == b'_' || (c as char).is_ascii_alphanumeric()
}

/// Given the index of an opening `{` in `s`, return the slice between it and its
/// matching `}`. Skips braces inside "…"/'…' strings and // … and /* … */ comments.
fn block_body(s: &str, open: usize) -> Option<&str> {
    let b = s.as_bytes();
    let mut depth = 0i32;
    let mut i = open;
    let mut quote: u8 = 0;
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        match c {
            b'/' if i + 1 < b.len() && b[i + 1] == b'/' => {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => {
                i += 2;
                while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                    i += 1;
                }
                i += 2;
            }
            b'"' | b'\'' => {
                quote = c;
                i += 1;
            }
            b'{' => {
                depth += 1;
                i += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[open + 1..i]);
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

/// Names of the direct child blocks of `body` (a `{…}` interior). Handles both
/// the Groovy form `dev { … }` and the Kotlin-DSL forms
/// `create("dev") { … }` / `register("dev")` / `getByName("debug") { … }`.
fn direct_block_names(body: &str) -> Vec<String> {
    let b = body.as_bytes();
    let mut out: Vec<String> = Vec::new();
    let mut depth = 0i32;
    let mut i = 0usize;
    let mut seg_start = 0usize; // start of the current depth-0 statement
    let mut quote: u8 = 0;
    while i < b.len() {
        let c = b[i];
        if quote != 0 {
            if c == b'\\' {
                i += 2;
                continue;
            }
            if c == quote {
                quote = 0;
            }
            i += 1;
            continue;
        }
        match c {
            b'/' if i + 1 < b.len() && b[i + 1] == b'/' => {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => {
                i += 2;
                while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                    i += 1;
                }
                i += 2;
            }
            b'"' | b'\'' => {
                quote = c;
                i += 1;
            }
            b'{' => {
                if depth == 0 {
                    if let Some(name) = block_name(&body[seg_start..i]) {
                        out.push(name);
                    }
                }
                depth += 1;
                i += 1;
            }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    seg_start = i + 1;
                }
                i += 1;
            }
            b';' if depth == 0 => {
                seg_start = i + 1;
                i += 1;
            }
            _ => i += 1,
        }
    }
    out
}

/// Extract a flavor/buildType name from the text preceding a `{` (a block header).
fn block_name(header: &str) -> Option<String> {
    let h = header.trim();
    if h.is_empty() {
        return None;
    }
    // Kotlin DSL: create("dev") / register("dev") / maybeCreate("dev") / getByName("debug")
    for kw in ["create", "register", "maybeCreate", "getByName"] {
        if let Some(p) = h.rfind(kw) {
            let rest = &h[p + kw.len()..];
            if let Some(q1) = rest.find('"') {
                if let Some(q2) = rest[q1 + 1..].find('"') {
                    let name = &rest[q1 + 1..q1 + 1 + q2];
                    if !name.is_empty() {
                        return Some(name.to_string());
                    }
                }
            }
        }
    }
    // Groovy: the trailing identifier (e.g. `prd`, `qa`).
    let bytes = h.as_bytes();
    let mut end = bytes.len();
    // trim trailing whitespace already done; take trailing ident run
    let mut start = end;
    while start > 0 && is_ident(bytes[start - 1]) {
        start -= 1;
    }
    if start == end {
        return None;
    }
    // Reject leading-digit identifiers and DSL keywords that aren't blocks.
    let ident = &h[start..end];
    if ident.as_bytes()[0].is_ascii_digit() {
        return None;
    }
    // A header like `flavorDimensions "x"` has no trailing ident before `{`,
    // so we only get here for real block names.
    let _ = &mut end;
    Some(ident.to_string())
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

/// Compute variant names for one module's build.gradle content.
pub fn variants_for_module(content: &str) -> Vec<String> {
    let android = find_block(content, "android").unwrap_or(content);
    let flavors = find_block(android, "productFlavors")
        .map(direct_block_names)
        .unwrap_or_default();
    let mut build_types = find_block(android, "buildTypes")
        .map(direct_block_names)
        .unwrap_or_default();
    // AGP always provides debug + release.
    for d in ["debug", "release"] {
        if !build_types.iter().any(|b| b == d) {
            build_types.push(d.to_string());
        }
    }
    // Stable, AS-like ordering: debug before release before any custom types.
    build_types.sort_by_key(|b| match b.as_str() {
        "debug" => 0,
        "release" => 1,
        _ => 2,
    });
    if flavors.is_empty() {
        build_types
    } else {
        let mut out = Vec::new();
        for f in &flavors {
            for bt in &build_types {
                out.push(format!("{}{}", f, capitalize(bt)));
            }
        }
        out
    }
}

fn is_application_module(content: &str) -> bool {
    content.contains("com.android.application")
}

/// Walk `dir` (skipping build/output/vcs dirs) collecting application modules.
fn scan(dir: &Path, root: &Path, depth: usize, out: &mut Vec<ModuleVariants>) {
    if depth > 6 {
        return;
    }
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    let mut has_app_build = false;
    let mut content: Option<String> = None;
    let mut subdirs: Vec<std::path::PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if !SKIP_DIRS.contains(&name.as_str()) && !name.starts_with('.') {
                subdirs.push(path);
            }
        } else if name == "build.gradle" || name == "build.gradle.kts" {
            if let Ok(s) = std::fs::read_to_string(&path) {
                if is_application_module(&s) {
                    has_app_build = true;
                    content = Some(s);
                }
            }
        }
    }
    if has_app_build {
        if let Some(s) = content {
            let rel = dir.strip_prefix(root).unwrap_or(dir);
            let rel_str = rel.to_string_lossy().replace('\\', "/");
            let gradle_path = if rel_str.is_empty() {
                String::new()
            } else {
                format!(":{}", rel_str.replace('/', ":"))
            };
            let name = dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "app".to_string());
            out.push(ModuleVariants {
                gradle_path,
                name,
                variants: variants_for_module(&s),
            });
        }
    }
    // An application module never nests another application module in its own
    // source/output dirs (those are already skipped), but plain subprojects can
    // sit alongside, so keep walking.
    for sub in subdirs {
        scan(&sub, root, depth + 1, out);
    }
}

/// List the build variants of every Android application module under `project_root`.
#[tauri::command]
pub fn list_build_variants(project_root: String) -> Result<Vec<ModuleVariants>, String> {
    let root = Path::new(&project_root);
    if !root.is_dir() {
        return Err("project root is not a directory".into());
    }
    let mut out = Vec::new();
    scan(root, root, 0, &mut out);
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors the shape of a typical flavored app module's build.gradle: a signingConfigs block whose
    // own children are named debug/release (the trap), product flavors prd/qa/dev,
    // and a real buildTypes block — plus an unrelated trailing buildTypes block.
    const FLAVORED_APP_GRADLE: &str = r#"
plugins { id 'com.android.application' }
android {
    compileSdk 34
    signingConfigs {
        debug { storeFile file("d.keystore") }
        release { storeFile file("r.keystore") }
    }
    flavorDimensions "flavors"
    productFlavors {
        prd { dimension "flavors"; applicationId "com.example.app" }
        qa  { dimension "flavors"; applicationIdSuffix ".qa" }
        dev { dimension "flavors"; applicationIdSuffix ".dev" }
    }
    buildTypes {
        debug { debuggable true }
        release { minifyEnabled true }
    }
}
android { // a second, unrelated block must not change the answer
    buildTypes { debug { } release { } }
}
"#;

    #[test]
    fn flavored_app_cross_product() {
        let v = variants_for_module(FLAVORED_APP_GRADLE);
        assert_eq!(
            v,
            vec![
                "prdDebug", "prdRelease",
                "qaDebug", "qaRelease",
                "devDebug", "devRelease",
            ]
        );
    }

    #[test]
    fn signing_configs_not_treated_as_build_types() {
        // The flavors block direct children are exactly the flavor names.
        let android = find_block(FLAVORED_APP_GRADLE, "android").unwrap();
        let flavors = direct_block_names(find_block(android, "productFlavors").unwrap());
        assert_eq!(flavors, vec!["prd", "qa", "dev"]);
    }

    #[test]
    fn no_flavors_yields_build_types_only() {
        let content = r#"
android {
    buildTypes {
        debug { }
        staging { initWith debug }
        release { }
    }
}
"#;
        let v = variants_for_module(content);
        assert_eq!(v, vec!["debug", "release", "staging"]);
    }

    #[test]
    fn defaults_added_when_build_types_absent() {
        let content = "android { defaultConfig { applicationId \"x\" } }";
        let v = variants_for_module(content);
        assert_eq!(v, vec!["debug", "release"]);
    }

    #[test]
    fn kotlin_dsl_create_and_get_by_name() {
        let content = r#"
android {
    productFlavors {
        create("dev") { dimension = "env" }
        create("prod") { dimension = "env" }
    }
    buildTypes {
        getByName("debug") { }
        getByName("release") { }
    }
}
"#;
        let v = variants_for_module(content);
        assert_eq!(v, vec!["devDebug", "devRelease", "prodDebug", "prodRelease"]);
    }

    #[test]
    fn braces_in_strings_and_comments_ignored() {
        let content = r#"
android {
    // productFlavors { fake { } }
    buildTypes {
        debug { buildConfigField "String", "X", "\"a{b}c\"" }
        release { }
    }
}
"#;
        let v = variants_for_module(content);
        assert_eq!(v, vec!["debug", "release"]);
    }
}
