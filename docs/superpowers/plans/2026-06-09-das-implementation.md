# DAS (Dumb Android Studio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Android Studio를 대체하는 초경량 보조 IDE를 만든다 — 간단 빌드 / 가벼운 편집 / 파일트리 / 검색 / logcat + 디바이스 실행 / Git / adb 파일탐색을, idle ~90–150MB / logcat 고부하 시 ~150–300MB 상한 안에서.

**Architecture:** Rust 코어가 모든 무거운 작업(프로세스 스폰·소유, 파싱, 필터, 링버퍼, 파일와칭)을 담당하고 React/TS 프론트는 가공된 데이터를 렌더링만 한다. 고볼륨 스트리밍(logcat/gradle)은 `tauri::ipc::Channel`로, 일반 요청은 `invoke`로. logcat 패널은 인터페이스 뒤에 격리해(메모리 escape hatch) 필요 시 네이티브 렌더러로 교체 가능하게 한다.

**Tech Stack:** Tauri 2.11 · React 18 + TS + Vite · Zustand · CodeMirror 6 · TanStack Virtual · Rust(`git2`, `nucleo`, `ignore`, `regex`, `notify`) · ripgrep 사이드카.

전체 스펙은 `../../../TECH_SPEC.md` 참조.

---

## 마일스톤 로드맵

| M | 이름 | 산출물 | 게이트(통과 기준) |
|---|---|---|---|
| **M0** | Scaffold & Skeleton | Tauri+React 앱 실행, 3-pane 셸, 플러그인/권한, 폴더구조, git init | 앱이 뜨고 빈 idle RSS 측정 baseline 기록 |
| **M1** | logcat 핫패스 ⚠️ | env 감지 → device 목록 → logcat 스트리밍(파서·링버퍼·Channel·가상화·생명주기) | **메모리 게이트**: 수천 줄/초 5분간 WebView RSS < 300MB 유지 |
| **M2** | 파일트리 + 검색 | fs 트리·watch, ripgrep 내용검색, nucleo 파일명 점프 | 트리 갱신, 검색 결과 표시, Cmd+P 동작 |
| **M3** | 에디터 (CM6) | 멀티탭, 문법강조, 찾기/바꾸기, 트리/검색결과에서 열기·저장 | 파일 열고 편집·저장, file:line 점프 |
| **M4** | 빌드 (gradle) | gradlew 실행·스트리밍, 에러 파서·점프, 상태/시간 | 빌드 출력 라이브, 에러 클릭→에디터 점프 |
| **M5** | 추가기능 | 디바이스 실행, git status/diff, adb 파일탐색 | 3개 추가기능 동작 |
| **M6** | 패키징 | macOS 서명/공증/업데이터 → Windows | 서명된 .dmg, 업데이트 채널, Windows 빌드 |

**순서 근거:** M1을 스캐폴드 직후에 둔다. logcat 메모리 가설이 이 프로젝트의 성패를 가르므로, 가장 위험한 것을 가장 먼저 검증한다. M1 게이트를 통과하지 못하면 M2~ 진행 전에 escape hatch(네이티브 logcat 패널)로 전환을 검토한다.

---

## File Structure

```
das/
├── TECH_SPEC.md
├── package.json
├── vite.config.ts
├── index.html
├── src/                              # React 프론트엔드 (렌더링 전용)
│   ├── main.tsx
│   ├── App.tsx                       # 3-pane 레이아웃 + 패널 라우팅
│   ├── ipc/
│   │   ├── types.ts                  # Rust와 미러링되는 공유 계약(§Shared Contracts)
│   │   ├── env.ts  device.ts  logcat.ts  build.ts  fs.ts  search.ts  git.ts
│   ├── store/
│   │   ├── useAppStore.ts            # 프로젝트 경로, 활성 패널, env
│   │   ├── useLogcatStore.ts         # 필터 상태(레벨/텍스트/디바이스)
│   │   └── useEditorStore.ts         # 열린 탭, dirty 상태
│   ├── components/
│   │   ├── FileTree.tsx
│   │   ├── EditorTabs.tsx  Editor.tsx
│   │   ├── logcat/
│   │   │   ├── LogcatPane.tsx        # LogcatPaneProps 인터페이스 구현 (escape hatch 경계)
│   │   │   └── LogcatVirtualList.tsx # TanStack Virtual
│   │   ├── BuildConsole.tsx  SearchPanel.tsx  FileJump.tsx
│   │   ├── GitPanel.tsx  DeviceFiles.tsx
│   │   └── Toolbar.tsx  DeviceSelector.tsx
│   └── styles/tokens.css
├── src-tauri/
│   ├── Cargo.toml  tauri.conf.json  build.rs  Entitlements.plist
│   ├── capabilities/default.json
│   ├── binaries/                     # 사이드카: rg-<target-triple>
│   └── src/
│       ├── main.rs  lib.rs
│       ├── state.rs                  # AppState: 자식 프로세스 핸들 맵
│       ├── env_detect.rs             # SDK/adb/JDK/프로젝트 감지
│       ├── device.rs                 # adb devices, install, am start, 파일 ops
│       ├── logcat.rs                 # 스폰·링버퍼·Channel 배치
│       ├── logcat_parse.rs           # threadtime 파서 (+tests)
│       ├── build.rs                  # gradlew 러너
│       ├── build_parse.rs            # 에러 파서 (+tests)
│       ├── fs_tree.rs                # 트리 읽기 + watch
│       ├── search.rs                 # ripgrep 사이드카 + nucleo
│       └── git.rs                    # git2 status/diff
└── docs/superpowers/plans/2026-06-09-das-implementation.md
```

각 파일은 하나의 책임만 진다. 파서는 IPC/프로세스와 분리되어 순수 함수로 단위테스트 가능하게 둔다(`logcat_parse.rs`, `build_parse.rs`).

---

## Shared Contracts (먼저 고정 — 이후 모든 태스크가 이 타입을 사용)

**`src/ipc/types.ts`** (Rust `serde::Serialize` 구조체와 1:1 미러링; camelCase는 Rust에서 `#[serde(rename_all = "camelCase")]`로 맞춘다)

```typescript
export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogLine {
  seq: number;       // 단조 증가 시퀀스(순서 보장·키)
  ts: string;        // "MM-DD HH:MM:SS.mmm"
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  message: string;
  raw: string;       // 원본 한 줄(파싱 실패/연속줄도 보존)
  matched: boolean;  // threadtime 정규식 매치 여부(false면 연속줄/마커)
}

export interface DeviceInfo {
  serial: string;
  state: string;     // "device" | "offline" | "unauthorized" | ...
  model?: string;
}

export interface AndroidEnv {
  sdkPath: string | null;
  adbPath: string | null;     // $SDK/platform-tools/adb
  jdkPath: string | null;
  jdkVersion: number | null;  // major (e.g. 17)
  source: "ANDROID_HOME" | "ANDROID_SDK_ROOT" | "default" | "login-shell" | "manual" | "none";
}

export interface ProjectInfo {
  root: string;
  isGradle: boolean;          // settings.gradle(.kts) 존재
  hasWrapper: boolean;        // gradlew 존재
  isAndroid: boolean;         // app/ 모듈 + AndroidManifest.xml
}

export type BuildEventKind = "stdout" | "stderr" | "status";
export interface BuildEvent {
  kind: BuildEventKind;
  line?: string;                       // stdout/stderr
  status?: "success" | "failed";       // kind=status
  durationMs?: number;                 // kind=status
  exitCode?: number;                   // kind=status
}
export type Severity = "error" | "warning" | "info";
export interface BuildDiagnostic {
  file: string;   // 절대경로
  line: number;
  col: number | null;
  severity: Severity;
  message: string;
}

export interface FsNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FsNode[];   // 디렉터리는 lazy: 펼칠 때 채움
}

export interface SearchMatch {
  file: string;
  line: number;
  col: number;
  text: string;
}

export interface GitFileStatus {
  path: string;
  status: "modified" | "added" | "deleted" | "renamed" | "untracked" | "conflicted";
}
```

**Rust 대응(`logcat_parse.rs` 내 정의 예시):**

```rust
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub seq: u64,
    pub ts: String,
    pub pid: u32,
    pub tid: u32,
    pub level: char,
    pub tag: String,
    pub message: String,
    pub raw: String,
    pub matched: bool,
}
```

---

## M0 — Scaffold & Skeleton

**Files:**
- Create: 전체 프로젝트 골격 (`package.json`, `src-tauri/**`, `src/**`)

- [ ] **Step 1: Tauri + React + TS 스캐폴드 생성**

빈 `das/` 디렉터리(이미 `.omc`만 있음)에서:

```bash
cd /path/to/das
npm create tauri-app@latest . -- --template react-ts --manager npm
# 프롬프트: app name=das, identifier=io.github.panicgit.mandroidstudio (또는 적절한 역도메인)
npm install
```

Expected: `src-tauri/`, `src/`, `package.json` 생성. 식별자는 `tauri.conf.json`의 `identifier`에 반영.

- [ ] **Step 2: 앱이 뜨는지 확인 + idle 메모리 baseline 측정**

```bash
npm run tauri dev
```
Expected: 데스크톱 창이 뜨고 기본 React 페이지 표시. 창이 뜬 상태에서 별도 터미널:
```bash
# WebView + 메인 프로세스 RSS 측정(baseline 기록용)
ps -axm -o rss,comm | grep -i -E "das|WebKit|WebContent" | awk '{s+=$1} END {print s/1024 " MB"}'
```
Expected: 합계가 대략 한 자리~낮은 세 자리 MB(빈 앱 baseline). **이 수치를 `docs/` 메모로 기록** — M1 게이트의 비교 기준.

- [ ] **Step 3: 공식 플러그인 추가 (shell/fs/dialog/updater/opener)**

```bash
npm run tauri add shell
npm run tauri add fs
npm run tauri add dialog
npm run tauri add updater
npm run tauri add opener
```
Expected: `Cargo.toml`에 `tauri-plugin-*` 추가, `src-tauri/capabilities/default.json`에 권한 항목 추가, JS 패키지 설치.

- [ ] **Step 4: Rust 크레이트 추가**

```bash
cd src-tauri
cargo add git2 nucleo ignore regex
cargo add serde --features derive
cd ..
```
Expected: `Cargo.toml`에 의존성 추가. `cargo build`가 통과(시간 소요 — `run_in_background` 권장).

- [ ] **Step 5: 프론트 라이브러리 추가**

```bash
npm install zustand @tanstack/react-virtual \
  @uiw/react-codemirror @codemirror/lang-java @codemirror/lang-xml \
  @codemirror/legacy-modes @codemirror/search @codemirror/merge \
  @codemirror/state @codemirror/view
```
Expected: `package.json`에 추가. `@codemirror/state`를 명시 설치해 중복 인스턴스 에러("Unrecognized extension value") 예방 — 추가로 `package.json`에 dedupe 보장.

- [ ] **Step 6: 3-pane 레이아웃 셸 작성**

`src/App.tsx` — 좌(사이드바: 파일트리/검색/git 탭) · 중(에디터 탭) · 하(패널: logcat/build 탭) 골격. 실제 패널은 placeholder div. CSS는 `src/styles/tokens.css`에 CSS 변수(manki 스타일 참고).

```tsx
// src/App.tsx (골격)
import { useAppStore } from "./store/useAppStore";
export default function App() {
  const bottomTab = useAppStore((s) => s.bottomTab);
  return (
    <div className="das-grid">
      <aside className="das-sidebar">{/* FileTree | SearchPanel | GitPanel */}</aside>
      <main className="das-editor">{/* EditorTabs */}</main>
      <section className="das-bottom">
        <nav>{/* logcat | build 탭 전환 */}</nav>
        <div className="das-bottom-body">{bottomTab === "logcat" ? "logcat" : "build"}</div>
      </section>
    </div>
  );
}
```

`src/store/useAppStore.ts` — Zustand 스토어 골격(projectRoot, env, bottomTab, activeSidebar).

- [ ] **Step 7: git 저장소 초기화 + 첫 커밋**

```bash
cd /path/to/das
git init
printf "node_modules/\nsrc-tauri/target/\ndist/\n.DS_Store\nsrc-tauri/binaries/\n" > .gitignore
git add -A
git commit -m "chore: scaffold DAS (Tauri 2 + React/TS) with plugins and 3-pane shell"
```
Expected: 첫 커밋 생성. (`.omc/`는 별도 — 필요 시 무시 목록에 추가.)

> **M0 게이트:** `npm run tauri dev`로 3-pane 셸이 뜨고, idle baseline RSS가 기록됨.

---

## M1 — logcat 핫패스 ⚠️ (메모리 가설 검증)

> 이 마일스톤이 프로젝트의 핵심 리스크. 게이트(고부하 RSS 상한)를 통과해야 나머지 진행. parser는 순수 함수로 TDD.

### Task 1.1: 환경 감지 (env_detect.rs)

**Files:**
- Create: `src-tauri/src/env_detect.rs`, `src/ipc/env.ts`
- Modify: `src-tauri/src/lib.rs` (모듈 등록 + command 등록)

- [ ] **Step 1: SDK/adb 감지 + 프로젝트 감지 (실패 테스트)**

```rust
// src-tauri/src/env_detect.rs
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AndroidEnv {
    pub sdk_path: Option<String>,
    pub adb_path: Option<String>,
    pub jdk_path: Option<String>,
    pub jdk_version: Option<u32>,
    pub source: String,
}

fn adb_under(sdk: &Path) -> Option<PathBuf> {
    let p = sdk.join("platform-tools").join("adb");
    p.exists().then_some(p)
}

/// 감지 순서: ANDROID_HOME -> ANDROID_SDK_ROOT -> ~/Library/Android/sdk -> 로그인셸 프로브
pub fn detect_sdk() -> (Option<PathBuf>, &'static str) {
    for (var, src) in [("ANDROID_HOME", "ANDROID_HOME"), ("ANDROID_SDK_ROOT", "ANDROID_SDK_ROOT")] {
        if let Ok(v) = std::env::var(var) {
            let p = PathBuf::from(&v);
            if p.exists() { return (Some(p), src); }
        }
    }
    if let Some(home) = dirs_home() {
        let def = home.join("Library/Android/sdk");
        if def.exists() { return (Some(def), "default"); }
    }
    // 로그인셸 프로브(GUI 앱은 ~/.zshrc 미상속)
    if let Some(p) = login_shell_var("ANDROID_HOME").or_else(|| login_shell_var("ANDROID_SDK_ROOT")) {
        let pb = PathBuf::from(p);
        if pb.exists() { return (Some(pb), "login-shell"); }
    }
    (None, "none")
}

fn dirs_home() -> Option<PathBuf> { std::env::var_os("HOME").map(PathBuf::from) }

fn login_shell_var(name: &str) -> Option<String> {
    let out = std::process::Command::new("zsh")
        .args(["-l", "-c", &format!("echo ${name}")]).output().ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!s.is_empty()).then_some(s)
}
```

테스트(`#[cfg(test)]`): `adb_under`가 존재하지 않는 경로에 `None`을 반환하는지 등 순수 로직 검증.

```rust
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn adb_under_missing_returns_none() {
        assert!(adb_under(Path::new("/nope/definitely/not")).is_none());
    }
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd src-tauri && cargo test env_detect` → Expected: 컴파일 후 통과(순수 로직). 모듈 미등록이면 컴파일 실패 → `lib.rs`에 `mod env_detect;` 추가.

- [ ] **Step 3: JDK 감지 + 프로젝트 감지 구현**

```rust
pub fn detect_jdk() -> (Option<String>, Option<u32>) {
    // macOS: /usr/libexec/java_home
    let out = std::process::Command::new("/usr/libexec/java_home").output().ok();
    let path = out.filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|s| !s.is_empty());
    let version = std::process::Command::new("/usr/libexec/java_home")
        .arg("--version").output().ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.split('.').next().and_then(|v| v.trim().parse().ok()));
    (path, version)
}

pub fn detect_project(root: &Path) -> super::ProjectInfo {
    let has = |n: &str| root.join(n).exists();
    let is_gradle = has("settings.gradle") || has("settings.gradle.kts");
    let has_wrapper = has("gradlew");
    let is_android = root.join("app/src/main/AndroidManifest.xml").exists()
        || std::fs::read_dir(root).ok().map_or(false, |rd| rd.flatten().any(|e|
            e.path().join("src/main/AndroidManifest.xml").exists()));
    super::ProjectInfo { root: root.display().to_string(), is_gradle, has_wrapper, is_android }
}

#[tauri::command]
pub fn detect_env(project_root: Option<String>) -> AndroidEnv {
    let (sdk, source) = detect_sdk();
    let adb = sdk.as_deref().and_then(adb_under);
    let (jdk_path, jdk_version) = detect_jdk();
    AndroidEnv {
        sdk_path: sdk.map(|p| p.display().to_string()),
        adb_path: adb.map(|p| p.display().to_string()),
        jdk_path, jdk_version, source: source.to_string(),
    }
}
```

`#[tauri::command] set_manual_sdk(path)`로 수동 지정 + 영속화(`tauri-plugin-store` 또는 간단 파일)도 추가.

- [ ] **Step 4: command 등록 + 프론트 바인딩**

`lib.rs`의 `invoke_handler`에 `detect_env`, `set_manual_sdk` 추가. `src/ipc/env.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";
import type { AndroidEnv } from "./types";
export const detectEnv = (projectRoot?: string) =>
  invoke<AndroidEnv>("detect_env", { projectRoot });
```

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(env): detect Android SDK/adb/JDK with login-shell fallback and project detection"
```

### Task 1.2: threadtime 파서 (logcat_parse.rs) — TDD

**Files:**
- Create: `src-tauri/src/logcat_parse.rs`

- [ ] **Step 1: 실패 테스트 작성**

```rust
// src-tauri/src/logcat_parse.rs (테스트)
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_standard_threadtime_line() {
        let l = parse_line("04-01 16:00:00.278  1234  5678 D MyTag: hello world", 0).unwrap();
        assert_eq!(l.pid, 1234); assert_eq!(l.tid, 5678);
        assert_eq!(l.level, 'D'); assert_eq!(l.tag, "MyTag");
        assert_eq!(l.message, "hello world"); assert!(l.matched);
    }
    #[test]
    fn nonmatching_line_kept_as_raw() {
        let l = parse_line("--------- beginning of main", 1);
        assert!(l.matched == false || l.raw.contains("beginning"));
    }
    #[test]
    fn tag_with_spaces_and_empty_message() {
        let l = parse_line("04-01 16:00:00.001  1  1 I ActivityManager: ", 2).unwrap();
        assert_eq!(l.tag, "ActivityManager"); assert_eq!(l.message, "");
    }
}
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `cd src-tauri && cargo test logcat_parse` → Expected: FAIL ("parse_line not found").

- [ ] **Step 3: 파서 구현**

```rust
use std::sync::LazyLock;
use regex::Regex;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub seq: u64, pub ts: String, pub pid: u32, pub tid: u32,
    pub level: char, pub tag: String, pub message: String,
    pub raw: String, pub matched: bool,
}

static RE: LazyLock<Regex> = LazyLock::new(|| {
    // MM-DD HH:MM:SS.mmm  PID  TID  L TAG: message
    Regex::new(r"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?):\s?(.*)$").unwrap()
});

pub fn parse_line(raw: &str, seq: u64) -> Option<LogLine> {
    match RE.captures(raw) {
        Some(c) => Some(LogLine {
            seq, ts: c[1].to_string(),
            pid: c[2].parse().ok()?, tid: c[3].parse().ok()?,
            level: c[4].chars().next()?, tag: c[5].trim().to_string(),
            message: c[6].to_string(), raw: raw.to_string(), matched: true,
        }),
        None => Some(LogLine { // 연속줄/마커: raw 보존
            seq, ts: String::new(), pid: 0, tid: 0, level: ' ',
            tag: String::new(), message: raw.to_string(),
            raw: raw.to_string(), matched: false,
        }),
    }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd src-tauri && cargo test logcat_parse` → Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add -A && git commit -m "feat(logcat): threadtime parser with raw-preserving fallback (TDD)"
```

### Task 1.3: 디바이스 목록 (device.rs)

**Files:** Create `src-tauri/src/device.rs`, `src/ipc/device.ts`

- [ ] **Step 1: `adb devices -l` 파서 + command**

```rust
// src-tauri/src/device.rs
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo { pub serial: String, pub state: String, pub model: Option<String> }

pub fn parse_devices(stdout: &str) -> Vec<DeviceInfo> {
    stdout.lines().skip(1) // "List of devices attached" 헤더 스킵
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| {
            let mut it = l.split_whitespace();
            let serial = it.next()?.to_string();
            let state = it.next()?.to_string();
            let model = l.split_whitespace().find_map(|t| t.strip_prefix("model:").map(String::from));
            Some(DeviceInfo { serial, state, model })
        }).collect()
}

#[tauri::command]
pub async fn list_devices(adb: String) -> Result<Vec<DeviceInfo>, String> {
    let out = tokio::process::Command::new(&adb).args(["devices", "-l"])
        .output().await.map_err(|e| e.to_string())?;
    Ok(parse_devices(&String::from_utf8_lossy(&out.stdout)))
}
```
테스트: `parse_devices`에 샘플 출력 2줄 넣어 serial/state/model 추출 검증.

- [ ] **Step 2: 테스트 + 커밋**

Run: `cargo test device` → PASS. 그 후 `git commit -m "feat(device): adb devices -l parser and list command"`.

### Task 1.4: logcat 스트리밍 — 링버퍼 + 배치 + Channel (logcat.rs)

**Files:** Create `src-tauri/src/logcat.rs`, `src/ipc/logcat.ts`

- [ ] **Step 1: 스폰 + Rust측 배치 플러시를 Channel로**

```rust
// src-tauri/src/logcat.rs
use tauri::ipc::Channel;
use tauri_plugin_shell::{ShellExt, process::CommandEvent};
use std::sync::atomic::{AtomicU64, Ordering};
use crate::logcat_parse::{parse_line, LogLine};

static SEQ: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
pub async fn start_logcat(
    app: tauri::AppHandle,
    adb: String,
    serial: Option<String>,
    filterspec: Option<String>,     // 예: "*:D" 또는 "MyTag:V *:S"
    on_batch: Channel<Vec<LogLine>>, // 프론트로 배치 전송
) -> Result<(), String> {
    let mut args: Vec<String> = vec![];
    if let Some(s) = &serial { args.push("-s".into()); args.push(s.clone()); }
    args.push("logcat".into());
    args.push("-v".into()); args.push("threadtime".into());
    if let Some(f) = filterspec { args.extend(f.split_whitespace().map(String::from)); }

    let (mut rx, child) = app.shell().command(&adb).args(args).spawn().map_err(|e| e.to_string())?;
    // 자식 핸들을 managed state에 보관 → 종료 시 kill (Task 1.6)
    crate::state::register_child(&app, "logcat", child);

    let mut batch: Vec<LogLine> = Vec::with_capacity(256);
    let mut ticker = tokio::time::interval(std::time::Duration::from_millis(33)); // ~30fps 플러시
    loop {
        tokio::select! {
            ev = rx.recv() => match ev {
                Some(CommandEvent::Stdout(bytes)) => {
                    let s = String::from_utf8_lossy(&bytes);
                    for line in s.lines() {
                        let seq = SEQ.fetch_add(1, Ordering::Relaxed);
                        if let Some(l) = parse_line(line, seq) { batch.push(l); }
                    }
                    if batch.len() >= 512 { let _ = on_batch.send(std::mem::take(&mut batch)); }
                }
                Some(CommandEvent::Terminated(_)) | None => {
                    if !batch.is_empty() { let _ = on_batch.send(std::mem::take(&mut batch)); }
                    break;
                }
                _ => {}
            },
            _ = ticker.tick() => {
                if !batch.is_empty() { let _ = on_batch.send(std::mem::take(&mut batch)); }
            }
        }
    }
    Ok(())
}
```

핵심: ① 줄당 emit 안 함 — 512줄 또는 33ms마다 **배치** 1회 전송. ② `Channel`(이벤트 시스템 아님). ③ `adb logcat -c`(버퍼 클리어)는 별도 one-shot command로.

- [ ] **Step 2: 프론트 — 링버퍼 + 가상 리스트 (escape hatch 경계)**

`src/components/logcat/LogcatPane.tsx` — **인터페이스를 먼저 정의**해 나중에 네이티브 렌더러로 교체 가능하게:

```tsx
// LogcatPane.tsx — 이 props 인터페이스가 escape hatch 경계
export interface LogcatPaneProps {
  lines: LogLine[];          // 링버퍼 윈도우(상한 적용된 배열)
  filterText: string;
  minLevel: LogLevel;
}
export function LogcatPane(props: LogcatPaneProps) {
  return <LogcatVirtualList {...props} />; // 추후 NativeLogcatPane으로 스왑 가능
}
```

`useLogcatStore.ts` — **상한 링버퍼**(예: 3만 줄, 초과 시 앞에서 drop), Channel onmessage에서 배치 append:

```typescript
import { Channel } from "@tauri-apps/api/core";
import { invoke } from "@tauri-apps/api/core";

const CAP = 30_000;
export async function startLogcat(adb: string, serial?: string, filterspec?: string) {
  const onBatch = new Channel<LogLine[]>();
  onBatch.onmessage = (batch) => useLogcatStore.getState().appendBatch(batch);
  await invoke("start_logcat", { adb, serial, filterspec, onBatch });
}
// store.appendBatch: ring buffer (slice 앞부분 drop), 화면엔 TanStack Virtual로 윈도우만 렌더
```

`LogcatVirtualList.tsx` — TanStack Virtual `useVirtualizer`로 뷰포트 행만 렌더. 레벨 색상은 가벼운 클래스. 텍스트/레벨 필터는 파생 배열(메모이즈)로 클라이언트 처리.

- [ ] **Step 3: 동작 확인 (실디바이스/에뮬레이터)**

Run: `npm run tauri dev` → env 감지된 adb로 디바이스 선택 → logcat 시작. Expected: 로그가 흐르고, 스크롤·필터 동작, 줄 순서 보존(seq).

- [ ] **Step 4: 커밋**

```bash
git add -A && git commit -m "feat(logcat): batched Channel streaming + ring buffer + virtualized pane behind swap interface"
```

### Task 1.5: device-side 필터 & PID 추적

- [ ] **Step 1:** 레벨/태그 필터를 spawn 인자(`filterspec`)로 전달(소스에서 양 감소). `--pid=$(adb shell pidof -s <pkg>)`는 패키지→PID 해석 후 재스폰. PID 변경(앱 크래시/재시작) 감지 시 재해석·재스폰. 자유 텍스트/정규식은 클라이언트 필터(키 입력마다 스트림 재시작 금지).
- [ ] **Step 2: 커밋** `feat(logcat): device-side level/tag/pid filtering with pid re-resolve`

### Task 1.6: 프로세스 생명주기 (state.rs)

**Files:** Create `src-tauri/src/state.rs`; Modify `lib.rs`

- [ ] **Step 1:** managed state에 자식 프로세스 핸들 맵 보관. `WindowEvent::CloseRequested`와 앱 종료 시 모든 child `kill()`. `stop_logcat` command로 수동 중단.

```rust
// state.rs (요지)
use std::collections::HashMap; use std::sync::Mutex;
use tauri_plugin_shell::process::CommandChild;
#[derive(Default)] pub struct AppState { pub children: Mutex<HashMap<String, CommandChild>> }
pub fn register_child(app: &tauri::AppHandle, key: &str, child: CommandChild) {
    let st = app.state::<AppState>();
    if let Some(old) = st.children.lock().unwrap().insert(key.into(), child) { let _ = old.kill(); }
}
pub fn kill_all(app: &tauri::AppHandle) {
    let st = app.state::<AppState>();
    for (_, c) in st.children.lock().unwrap().drain() { let _ = c.kill(); }
}
```

`lib.rs`: `.manage(AppState::default())` + `on_window_event`에서 `CloseRequested`시 `kill_all`.

- [ ] **Step 2: 검증** 앱 종료 후 `pgrep -fl "adb logcat"`로 고아 프로세스 없음 확인. **커밋** `feat(state): track child processes and kill on window close`.

### Task 1.7: 🔴 메모리 게이트 (이 마일스톤의 통과 기준)

- [ ] **Step 1: 고부하 부하 생성**

에뮬레이터에서 로그 폭주 유발(예: 스팸 로그 앱) 또는:
```bash
# 디바이스에서 빠른 로그 생성(예시)
adb shell "for i in $(seq 1 100000); do log -t DASBENCH \"line $i payload xxxxxxxxxxxxxxxx\"; done" &
```

- [ ] **Step 2: 5분간 RSS 모니터링**

```bash
while true; do
  ps -axm -o rss,comm | grep -i -E "das|WebContent|WebKit" | awk '{s+=$1} END {print strftime("%H:%M:%S"), s/1024 " MB"}';
  sleep 5;
done
```
**통과 기준:** WebView+메인 RSS 합계가 **5분 지속 고부하에서 ~300MB 미만으로 상한 유지**(우상향 발산 없음). 링버퍼 상한이 동작해 줄 수가 CAP에서 고정되는지 확인.

- [ ] **Step 3: 판정 + 기록**
  - **통과** → M2 진행. 결과를 `docs/`에 기록.
  - **실패(발산/300MB 초과)** → escape hatch 발동 검토: `LogcatPane`을 네이티브 렌더러(egui 윈도우 또는 NSTextView 브리지)로 교체하는 스파이크를 먼저 수행. TECH_SPEC §7의 전환 조건 참조.

> **M1 게이트:** logcat가 고부하에서 메모리 상한을 지키고 고아 프로세스가 없다.

---

## M2 — 파일트리 + 검색

### Task 2.1: fs 트리 읽기 + watch (fs_tree.rs)
- [ ] `ignore` 크레이트로 `.gitignore`·`build/`·`.git/` 제외하며 lazy 트리 읽기 command(`read_dir(path) -> Vec<FsNode>`, 디렉터리는 children 미포함, 펼칠 때 재요청).
- [ ] `tauri-plugin-fs`의 `watch`(debounce)로 프로젝트 루트 감시 → 이벤트 시 해당 디렉터리만 무효화. 프론트 `FileTree.tsx`는 펼침 상태 유지하며 갱신.

```typescript
// src/ipc/fs.ts
import { invoke } from "@tauri-apps/api/core";
import type { FsNode } from "./types";
export const readDir = (path: string) => invoke<FsNode[]>("read_dir", { path });
```
- [ ] **커밋** `feat(fs): gitignore-aware lazy tree + debounced watch`

### Task 2.2: 내용 검색 — ripgrep 사이드카 (search.rs)
- [ ] `rg` 바이너리를 타깃 트리플 접미사로 `src-tauri/binaries/`에 배치, `tauri.conf.json`의 `externalBin` 등록, `capabilities/default.json`에 `shell:allow-execute`(sidecar). 트리플: `rustc --print host-tuple`.
- [ ] `rg --json <pattern> <root>`를 사이드카로 실행, JSON 라인 파싱 → `SearchMatch[]` 스트리밍(`Channel`). 결과 클릭 → 에디터 `file:line:col` 열기(M3 연동).
- [ ] 폴백: 번들 rg 부재 시 시스템 `rg`/`grep`.
- [ ] **커밋** `feat(search): ripgrep sidecar content search with --json streaming`

### Task 2.3: 파일명 퍼지 점프 — nucleo (search.rs)
- [ ] `ignore` 워크로 파일 목록 1회 구축 → `nucleo` 매처로 키 입력마다 재랭킹. `FileJump.tsx`(Cmd+P) UI.
- [ ] **커밋** `feat(search): nucleo fuzzy filename jump (Cmd+P)`

> **M2 게이트:** 트리가 파일 변경에 갱신되고, 내용 검색 결과가 뜨고, Cmd+P 파일 점프가 동작.

---

## M3 — 에디터 (CodeMirror 6, 보통 수준)

### Task 3.1: CM6 래퍼 + 언어 (Editor.tsx)
- [ ] `@uiw/react-codemirror`로 `Editor.tsx`. 확장자별 확장 선택: `.java`→lang-java, `.xml`→lang-xml, `.kt`/`.kts`→`StreamLanguage.define(kotlin)`, `.gradle`→groovy legacy. `@codemirror/search`(찾기/바꾸기) 포함.
- [ ] 대용량 로드는 초기 `EditorState.create({ doc: Text.of(text.split("\n")) })` 경로(`dispatch()` 금지).

```tsx
// Editor.tsx (요지)
import CodeMirror from "@uiw/react-codemirror";
import { java } from "@codemirror/lang-java";
import { xml } from "@codemirror/lang-xml";
import { StreamLanguage } from "@codemirror/language";
import { kotlin } from "@codemirror/legacy-modes/mode/clike"; // kotlin은 clike/kotlin 모드 확인
import { search } from "@codemirror/search";
function extFor(path: string) { /* 확장자 → extensions[] */ }
```
> 구현 시 `@codemirror/legacy-modes`의 정확한 Kotlin/Groovy export 경로를 실제 패키지에서 확인하고, 실제 Gradle 파일로 강조 품질 스모크 테스트(TECH_SPEC 리스크).

### Task 3.2: 멀티탭 + 저장 (EditorTabs.tsx, useEditorStore.ts)
- [ ] 탭마다 독립 `EditorView` 상태. `useEditorStore`로 열린 탭/활성탭/dirty 추적. 저장은 `tauri-plugin-fs` writeTextFile. 트리/검색 결과/빌드 에러에서 `openFile(path, line?, col?)`로 열기·점프.
- [ ] **커밋** `feat(editor): CM6 multi-tab editing with save and goto-line`

> **M3 게이트:** 파일 열고 편집·저장, 검색 결과 클릭 시 해당 위치로 점프.

---

## M4 — 빌드 (gradle)

### Task 4.1: gradle 에러 파서 (build_parse.rs) — TDD
- [ ] **실패 테스트:** Kotlin `e:`/`w:`, javac `File.java:NN:`, ANSI 제거 케이스.

```rust
#[cfg(test)]
mod tests {
  use super::*;
  #[test] fn kotlin_modern() {
    let d = parse_diagnostic("e: file:///a/B.kt:12:5 Unresolved reference: foo").unwrap();
    assert_eq!(d.line, 12); assert_eq!(d.col, Some(5)); assert!(matches!(d.severity, Severity::Error));
  }
  #[test] fn javac_line_only() {
    let d = parse_diagnostic("/a/C.java:42: error: cannot find symbol").unwrap();
    assert_eq!(d.line, 42); assert_eq!(d.col, None);
  }
}
```
- [ ] **구현:** ANSI strip(`\[[;\d]*m`) 후 정규식 2종(Kotlin modern/legacy, javac) + `BUILD SUCCESSFUL/FAILED in Ns` 추출.
- [ ] `cargo test build_parse` → PASS. **커밋** `feat(build): gradle/kotlin/javac diagnostic parser (TDD)`

### Task 4.2: gradlew 러너 (build.rs)
- [ ] `./gradlew <task> --console=plain`을 프로젝트 루트 cwd로 스폰(JAVA_HOME=detect_jdk 설정). stdout/stderr 인터리브 → `BuildEvent` Channel. gradlew 실행권한 없으면 `sh ./gradlew` 폴백. 종료 코드+상태/시간 표시. child는 state.rs로 추적·종료.
- [ ] `BuildConsole.tsx`: 라이브 출력 + 에러 목록(클릭→에디터 점프) + 경과 타이머.
- [ ] **커밋** `feat(build): gradlew runner with live streaming, clickable diagnostics, status/duration`

> **M4 게이트:** 빌드 출력이 라이브로 흐르고, 에러를 클릭하면 에디터가 해당 위치로 점프.

---

## M5 — 추가기능

### Task 5.1: 디바이스 실행
- [ ] `./gradlew installDebug`(또는 `adb install -r <apk>`) 후 `adb shell am start -n <pkg>/<launchActivity>`. 런처 액티비티는 `AndroidManifest.xml`/`dumpsys`로 해석. `DeviceSelector.tsx`로 타깃 선택.
- [ ] **커밋** `feat(device): build+install+launch on selected device`

### Task 5.2: Git 상태/diff (git.rs)
- [ ] `git2`로 status(`GitFileStatus[]`) + 파일별 diff(working vs HEAD) 생성. `GitPanel.tsx`에서 변경 파일 목록, 선택 시 CM6 `@codemirror/merge`(`unifiedMergeView` 또는 `MergeView`)로 diff 표시.
- [ ] **커밋** `feat(git): status list and diff view via git2 + CM6 merge`

### Task 5.3: adb 파일탐색 (device.rs)
- [ ] `adb -s <serial> shell ls -la <path>` 파싱 → 트리. `adb pull`/`adb push`(저장 위치는 dialog 플러그인). `DeviceFiles.tsx`.
- [ ] **커밋** `feat(device): adb filesystem browser with pull/push`

> **M5 게이트:** 디바이스 실행·git diff·adb 파일탐색 3개 동작.

---

## M6 — 패키징 & 배포

### Task 6.1: macOS 서명/공증
- [ ] Developer ID Application 인증서 준비. `tauri.conf.json` 서명 설정 + `Entitlements.plist`(`com.apple.security.cs.allow-jit`). 공증 env(`APPLE_ID`+app-specific `APPLE_PASSWORD` 또는 ASC API key). **사이드카 rg는 hardened runtime로 개별 서명**(공증 실패 #11992/#14579 주의 — 일찍 검증).
- [ ] `npm run tauri build` → 서명·공증된 `.dmg` 산출 확인. **커밋**.

### Task 6.2: 자동 업데이트
- [ ] `tauri signer generate`로 updater 키페어 생성 → **개인키를 CI secret/vault에 보관**(분실=복구불가). `tauri.conf.json` updater 엔드포인트(GitHub Releases). GitHub Action으로 업데이트 JSON 발행.
- [ ] **커밋** `chore(release): macOS signing/notarization + updater pipeline`

### Task 6.3: Windows
- [ ] WebView2 확인. rg 사이드카 Windows 트리플 바이너리 추가. 코드서명. `npm run tauri build`(Windows 러너).
- [ ] **커밋** `chore(release): Windows (WebView2) build and signing`

> **M6 게이트:** 서명·공증된 macOS 빌드 + 업데이트 채널 + Windows 빌드.

---

## Self-Review — 스펙 커버리지

| 스펙 요구 | 구현 태스크 |
|---|---|
| 간단 빌드 | M4 (Task 4.1, 4.2) |
| 가벼운 편집(보통) | M3 (Task 3.1, 3.2) |
| 파일트리 | M2 (Task 2.1) |
| 검색(내용+파일명) | M2 (Task 2.2, 2.3) |
| logcat | M1 (Task 1.2–1.7) |
| 디바이스 실행 | M5 (Task 5.1) |
| Git 상태/diff | M5 (Task 5.2) |
| adb 파일탐색 | M5 (Task 5.3) |
| 낮은 메모리(최우선) | M1 게이트(Task 1.7) + 링버퍼/배치/Channel/가상화 전반 |
| env 감지(SDK/adb/JDK) | M1 (Task 1.1) |
| 프로세스 생명주기 | M1 (Task 1.6) |
| 메모리 escape hatch | M1 (Task 1.4 인터페이스 경계, Task 1.7 판정) |
| macOS+Windows | M6 (Task 6.1–6.3) |

**타입 일관성:** Shared Contracts(§)의 `LogLine`/`DeviceInfo`/`AndroidEnv`/`BuildEvent`/`BuildDiagnostic`/`FsNode`/`SearchMatch`/`GitFileStatus`를 Rust(`#[serde(rename_all="camelCase")]`)와 TS에서 동일 명칭으로 사용.

**참고 — 후속 마일스톤 상세화:** M0/M1은 실코드·실명령 수준. M2~M6은 핵심 코드 + 수용 기준 수준이며, 각 마일스톤 착수 시 해당 태스크를 bite-sized 스텝(실패 테스트→실행→구현→통과→커밋)으로 확장한다. 특히 `legacy-modes`의 Kotlin/Groovy export 경로, `@codemirror/merge` API, `tauri-plugin-fs` watch 시그니처는 착수 시점에 실제 패키지로 재확인(버전 드리프트 방지).
