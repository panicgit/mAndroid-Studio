# DAS (Dumb Android Studio) — Technical Specification

> **Status:** Confirmed (2026-06-09). Source-of-truth for the build.
> **Decision basis:** Multi-agent research + adversarial memory review (verdict: CONFIRM Tauri 2, conditionally — see §7).

## 0. Purpose & Non-Goals

DAS는 Android Studio를 **대체하지 않는다**. AI 에이전트(Claude Code 등)가 코딩을 담당하는 워크플로우에서, Android Studio를 상시 띄워두는 이유(간단 빌드 / 가벼운 편집 / 파일트리 / 검색 / logcat)만 떼어낸 **초경량 보조 IDE**다.

**최우선 요구사항: 매우 낮은 메모리.** Android Studio의 2~4GB+ JVM이 DAS가 존재하는 유일한 이유다. 모든 설계 결정은 이 기준이 다른 모든 것을 이긴다.

**In scope (8 features)**
1. 간단한 Gradle 빌드 트리거 + 출력/에러 스트리밍
2. 가벼운 코드 편집(보통 수준: 멀티탭, 파일 내 찾기/바꾸기, 검색→열기) — Kotlin/Java/XML/Gradle
3. 프로젝트 파일트리 탐색
4. 빠른 검색(파일명 퍼지 + 내용)
5. logcat 뷰어(스트리밍, 필터링, 고볼륨)
6. 디바이스에 앱 실행/설치
7. Git 상태/diff 보기
8. adb 디바이스 파일 탐색

**Out of scope (지금은)**
- 코드 인덱싱, IntelliSense/LSP, 리팩터링, 디버거, 레이아웃 에디터, 프로파일러, AVD 관리, Gradle Tooling API(JVM 클라이언트). 이런 게 들어오면 "가벼움"이 무너진다.

## 1. 최종 스택

| 레이어 | 선택 | 핵심 근거 |
|---|---|---|
| 셸/런타임 | **Tauri 2.11.x** (Rust + 시스템 WebView) | Chromium 미번들. 빈 앱 idle ~73MB. manki로 검증된 툴체인 |
| 프론트 | **React 18 + TypeScript + Vite** | manki와 동일 → AI 에이전트 코드 생성 정확도/속도 최상 |
| 상태관리 | **Zustand** | manki와 동일, 경량 |
| 에디터 | **CodeMirror 6** (`@uiw/react-codemirror`) | core ~150–300KB (Monaco ~5MB+워커당 ~25MB). **Tauri를 택한 결정적 이유** |
| logcat 가상화 | **TanStack Virtual** | 뷰포트만 렌더 |
| 백엔드 | **Rust** | adb/gradlew/rg 프로세스 소유, 파싱·필터·버퍼링을 IPC 건너기 전에 수행 |
| 검색(내용) | **ripgrep**(번들 사이드카) `rg --json` | gitignore/필터/순회/스트리밍 공짜 |
| 검색(파일명) | **`nucleo`** 크레이트 (Helix팀) + `ignore` | fzf 호환, skim 대비 ~6배 |
| 파일와칭 | **`tauri-plugin-fs`** `watch` (notify 크레이트) | debounce 내장 |
| Git | **`git2`** 크레이트 (libgit2) + CM6 `@codemirror/merge` | 네이티브·경량, diff 렌더는 에디터 재사용 |
| 스트리밍 IPC | **`tauri::ipc::Channel`** | 이벤트 시스템 금지(고볼륨에서 크래시·순서꼬임) |

## 2. 아키텍처 원칙

```
┌─────────────── React/TS (렌더링만) ───────────────────────┐
│ FileTree │ EditorTabs(CM6) │ LogcatPane │ BuildConsole │ Git │ DeviceFiles │
└───────────────────────────┬───────────────────────────────┘
              invoke(요청/응답)  ·  ipc::Channel(스트리밍)
┌───────────────────────────┴───────────────────────────────┐
│ Rust 코어: 프로세스 소유 · 파싱 · 필터 · 링버퍼 · 파일와칭     │
│ adb │ gradlew │ ripgrep │ git2 │ notify │ nucleo │ ignore    │
└─────────────────────────────────────────────────────────────┘
```

**철칙:** 프론트는 "이미 가공된 데이터를 그리기만" 한다. 파싱·필터링·버퍼링은 전부 Rust. 이것이 메모리를 잡는 핵심 레버.

## 3. 기능별 구현 요약

| 기능 | 구현 방식 |
|---|---|
| **logcat** ⚠️핫패스 | Rust가 `adb logcat -v threadtime` 스폰 → threadtime 정규식 파싱 → device-side 필터(`*:E`, `--pid`)로 소스에서 양 줄이기 → 링버퍼(상한 ~3만줄, 오래된 것 drop) → **16~50ms 배치**로 `ipc::Channel` 전송. 프론트는 TanStack Virtual로 뷰포트만 렌더. 레벨/텍스트 필터는 클라이언트. **줄당 이벤트 emit 절대 금지(#8177 크래시).** |
| **빌드** | `./gradlew assembleDebug --console=plain`. stdout/stderr 인터리브 → Kotlin `e:/w:` · javac `File.java:NN:` 파싱(ANSI 제거 후) → 클릭 시 에디터 `file:line:col` 점프. `BUILD SUCCESSFUL/FAILED in Ns` + exit code로 상태/시간. |
| **편집(보통)** | CM6 + `lang-java`·`lang-xml`(1급 Lezer) + `legacy-modes`(kotlin/groovy) + `@codemirror/search`. 탭마다 독립 `EditorView`. 대용량은 `Text.of(split)`로 로드(`dispatch()` 금지). |
| **파일트리** | `tauri-plugin-fs` `watch`(debounce). 이벤트 시 해당 디렉터리만 재읽기. `.gitignore`·`build/` 제외(`ignore` 크레이트). |
| **검색** | ripgrep 사이드카 `--json`(내용). `nucleo`(파일명 퍼지) + `ignore` 트리워크. |
| **디바이스 실행** | `./gradlew installDebug` → `adb shell am start -n <pkg>/<activity>`. 디바이스 선택 `adb devices -l` → `adb -s <serial>`. |
| **Git 상태/diff** | `git2`로 status/diff 생성 → CM6 `@codemirror/merge`로 렌더. |
| **adb 파일탐색** | `adb shell ls -la` 트리 + `adb pull`/`adb push`. |

## 4. 중요한 실용 결정

1. **adb는 번들하지 않고 "감지해서 사용".** DAS 사용자는 SDK가 설치된 개발자다. adb 사이드카는 백그라운드 서버·동반파일·**macOS 공증 실패**(#11992, #14579)·라이선스/버전관리 문제를 부른다. 감지 순서: `ANDROID_HOME → ANDROID_SDK_ROOT → ~/Library/Android/sdk`. **사이드카는 ripgrep 하나만** 번들.
2. **GUI 앱은 셸 프로필 환경변수(`~/.zshrc`)를 상속하지 않는다.** 반드시 기본 경로 폴백 + 로그인셸 프로브(`zsh -l -c 'echo $ANDROID_HOME'`) + 수동 지정 UI + 영속화.
3. **JDK는 `/usr/libexec/java_home`로 해결.** AGP는 JDK 17+ 필요 — 낮으면 명확한 에러 표시.
4. **프로세스 생명주기는 직접 관리.** Tauri는 자식 프로세스를 안 죽인다. 모든 child 핸들을 managed state에 추적, `CloseRequested`에 `kill()`. 안 그러면 adb 데몬·gradle JVM이 DAS보다 메모리를 더 먹는다.

## 5. 메모리 목표

| 상태 | 목표 | 비고 |
|---|---|---|
| Idle (트리+에디터+콘솔) | **~90–150MB** | Android Studio 대비 15–30배↓ |
| logcat 고부하 (완화책 적용) | **~150–300MB (상한 고정)** | 링버퍼+배치+Channel+가상화 *전부 필수* |
| 완화책 누락 시 | 900MB+ 폭증 가능 (사례 #238 ~914MB) | day 1부터 적용, M1에서 게이트 검증 |

## 6. 플랫폼 전략

**macOS 우선 → Windows 추가.** Tauri가 둘 다 지원(macOS=WKWebView, Win=WebView2). Windows 추가 비용: ① 사이드카(rg) 타깃별 바이너리 ② 서명. Linux(WebKitGTK)는 메모리 변수가 커서 비대상.

## 7. 핵심 리스크 & 대응 (적대적 검증 반영)

| 리스크 | 대응 |
|---|---|
| 🔴 **logcat가 WebView 메모리 폭증** | 진짜 위협은 idle이 아니라 **고부하 스트리밍**: Tauri JS-브리지 역직렬화 + React setState(~188/s) + VDOM diff(#1279). → Rust 배치/필터 + `ipc::Channel` + 링버퍼 + 가상화 **+ 탈출구**: logcat 패널을 **인터페이스 뒤에 격리**해, 프로토타입이 고부하에서 부풀면 그 패널만 **네이티브(egui/NSTextView)로 교체** 가능하게 설계(나머지는 Tauri 유지). |
| 고아 프로세스 | child 핸들 추적 + `CloseRequested`에 `kill()` |
| Gradle 출력 깨짐 | `--console=plain` 필수(애니메이션 출력이 stdout 스트리밍을 깸 #3508) |
| PID 필터가 앱 재시작 시 끊김 | PID 변경 감지 → 재해결·재스폰 |
| 공증 + 사이드카 | rg 사이드카 hardened runtime로 개별 서명, CI 파이프라인 일찍 검증 |
| Updater 개인키 분실 = 복구 불가 | day 1부터 CI secret/vault에 보관 |

**적대적 검증이 뒤집히는 조건(이때만 egui 네이티브로 전환):** (a) 80–100MB 미만 하드 메모리 상한이 강제될 때, (b) 코드 편집이 빠지거나 read-only/plain-textarea로 다운그레이드될 때(에디터 생태계 이점 소멸), (c) 고볼륨 logcat가 지배적 상시 용례인데 완전 완화책에도 Tauri 프로토타입이 부풀 때. **iced는 idle이 Tauri와 동률이라 전환 무의미, Flutter는 최중량으로 영구 제외.**

## 8. 버전 핀 (2026-06)

- `Tauri 2.11.x` · `tauri-plugin-shell 2.x` · `tauri-plugin-fs 2.x` · `tauri-plugin-dialog 2.x` · `tauri-plugin-updater 2.x`
- `codemirror 6.0.2` 라인 · `@uiw/react-codemirror 4.25.x` · `@codemirror/lang-java` · `@codemirror/lang-xml` · `@codemirror/legacy-modes` · `@codemirror/search` · `@codemirror/merge`
- `@tanstack/react-virtual` (latest) · `zustand` (latest)
- Rust: `git2`, `nucleo`, `ignore`, `regex`, `serde` (notify는 fs 플러그인 내장)
- ripgrep: 타깃 트리플 접미사 사이드카 (`rg-aarch64-apple-darwin` 등; 트리플은 `rustc --print host-tuple`)
