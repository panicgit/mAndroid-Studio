use regex::Regex;
use std::sync::LazyLock;

/// A clickable build diagnostic (file:line:col + message). Field names match the
/// frontend `BuildDiagnostic`.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildDiagnostic {
    pub path: String,
    pub line: u32,
    pub col: u32,
    pub msg: String,
}

static ANSI: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\x1b\[[0-9;]*m").unwrap());

// Kotlin compiler: `e: file:///abs/File.kt:12:5 message`  (also w:, i:)
static KOTLIN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[ewi]: (?:file://)?(/[^:]+\.kts?):(\d+):(\d+)?\s*(.*)$").unwrap());
// javac: `/abs/File.java:42: error: message`
static JAVAC: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(/[^:]+\.java):(\d+): (?:error|warning): (.*)$").unwrap());

pub fn strip_ansi(s: &str) -> String {
    ANSI.replace_all(s, "").to_string()
}

/// Parse a Kotlin/javac diagnostic line into a clickable target, if it is one.
pub fn parse_diagnostic(raw: &str) -> Option<BuildDiagnostic> {
    let line = strip_ansi(raw);
    if let Some(c) = KOTLIN.captures(&line) {
        return Some(BuildDiagnostic {
            path: c[1].to_string(),
            line: c[2].parse().ok()?,
            col: c.get(3).and_then(|m| m.as_str().parse().ok()).unwrap_or(0),
            msg: c[4].trim().to_string(),
        });
    }
    if let Some(c) = JAVAC.captures(&line) {
        return Some(BuildDiagnostic {
            path: c[1].to_string(),
            line: c[2].parse().ok()?,
            col: 0,
            msg: c[3].trim().to_string(),
        });
    }
    None
}

/// Visual class for a build line: "ok" | "err" | "dim" | None.
pub fn classify(raw: &str) -> Option<&'static str> {
    let l = strip_ansi(raw);
    if l.contains("BUILD SUCCESSFUL") {
        Some("ok")
    } else if l.contains("BUILD FAILED") || l.contains("FAILURE:") || l.starts_with("e:") || l.contains("FAILED") {
        Some("err")
    } else if l.starts_with("> Task") || l.contains("actionable task") || l.starts_with("w:") {
        Some("dim")
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kotlin_modern() {
        let d = parse_diagnostic(
            "e: file:///Users/me/app/src/main/java/com/example/cafepos/ui/OrderViewModel.kt:30:48 Unresolved reference: sumOf",
        )
        .unwrap();
        assert_eq!(d.line, 30);
        assert_eq!(d.col, 48);
        assert!(d.path.ends_with("OrderViewModel.kt"));
        assert!(d.path.starts_with('/'));
        assert!(d.msg.contains("Unresolved reference"));
    }

    #[test]
    fn javac_line_only() {
        let d = parse_diagnostic("/Users/me/app/src/main/java/App.java:42: error: cannot find symbol").unwrap();
        assert_eq!(d.line, 42);
        assert_eq!(d.col, 0);
        assert!(d.path.ends_with("App.java"));
        assert_eq!(d.msg, "cannot find symbol");
    }

    #[test]
    fn non_diagnostic_lines() {
        assert!(parse_diagnostic("> Task :app:assembleDebug").is_none());
        assert!(parse_diagnostic("BUILD SUCCESSFUL in 6s").is_none());
    }

    #[test]
    fn classify_lines() {
        assert_eq!(classify("BUILD SUCCESSFUL in 6s"), Some("ok"));
        assert_eq!(classify("BUILD FAILED in 3s"), Some("err"));
        assert_eq!(classify("> Task :app:compileDebugKotlin"), Some("dim"));
        assert_eq!(classify("> Task :app:compileDebugKotlin FAILED"), Some("err"));
        assert_eq!(classify("some random output"), None);
    }
}
