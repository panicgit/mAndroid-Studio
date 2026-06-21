use regex::Regex;
use std::sync::LazyLock;

/// A single parsed logcat line. Field names match the frontend `LogLine` type
/// (serialized as-is): id, ts, pid, tid, level, tag, msg.
#[derive(Debug, Clone, serde::Serialize)]
pub struct LogLine {
    pub id: u64,
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    pub level: String,
    pub tag: String,
    pub msg: String,
}

// threadtime format:  MM-DD HH:MM:SS.mmm  PID  TID  L TAG: message
static RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?):\s?(.*)$")
        .unwrap()
});

/// Parse one threadtime logcat line. Non-matching lines (buffer markers,
/// stack-trace continuations) inherit `last_level` so a level filter won't hide
/// them, and the raw text is preserved in `msg`.
pub fn parse_line(raw: &str, id: u64, last_level: &str) -> LogLine {
    if let Some(c) = RE.captures(raw) {
        LogLine {
            id,
            ts: c[1].to_string(),
            pid: c[2].parse().unwrap_or(0),
            tid: c[3].parse().unwrap_or(0),
            level: c[4].to_string(),
            tag: c[5].trim().to_string(),
            msg: c[6].to_string(),
        }
    } else {
        LogLine {
            id,
            ts: String::new(),
            pid: 0,
            tid: 0,
            level: last_level.to_string(),
            tag: String::new(),
            msg: raw.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_standard_line() {
        let l = parse_line("04-01 16:00:00.278  1234  5678 D MyTag: hello world", 7, "I");
        assert_eq!(l.id, 7);
        assert_eq!(l.pid, 1234);
        assert_eq!(l.tid, 5678);
        assert_eq!(l.level, "D");
        assert_eq!(l.tag, "MyTag");
        assert_eq!(l.msg, "hello world");
    }

    #[test]
    fn empty_message_and_tag_trim() {
        let l = parse_line("04-01 16:00:00.001     1     1 I ActivityManager: ", 0, "I");
        assert_eq!(l.tag, "ActivityManager");
        assert_eq!(l.msg, "");
        assert_eq!(l.level, "I");
    }

    #[test]
    fn nonmatching_inherits_last_level() {
        let l = parse_line("--------- beginning of main", 1, "E");
        assert_eq!(l.level, "E");
        assert_eq!(l.tag, "");
        assert_eq!(l.msg, "--------- beginning of main");
    }

    #[test]
    fn error_line_parsed() {
        let l = parse_line(
            "06-09 10:50:01.123   900   950 E AndroidRuntime: FATAL EXCEPTION: main",
            2,
            "I",
        );
        assert_eq!(l.level, "E");
        assert_eq!(l.tag, "AndroidRuntime");
        assert!(l.msg.contains("FATAL"));
    }
}
