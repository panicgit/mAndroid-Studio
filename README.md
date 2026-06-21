# mAndroid Studio

> An ultra-lightweight companion IDE for Android development — it keeps only the reasons you keep Android Studio open, and drops the 2–4 GB JVM.

*(Codename: **DAS — Dumb Android Studio**. The Rust crate and npm package are named `das`.)*

mAndroid Studio is **not** a replacement for Android Studio. In an AI-assisted workflow — where an agent (e.g. Claude Code) writes most of the code — it provides just the handful of things you still keep a heavyweight IDE running for: build, edit, search, logcat, device install, and git. At a fraction of the memory.

## Features

1. **Gradle build** — trigger builds with streamed output and clickable error navigation
2. **Lightweight editing** — multi-tab, in-file find/replace, search-to-open (Kotlin / Java / XML / Gradle)
3. **File-tree** — browse the project structure
4. **Fast search** — fuzzy filename + full content
5. **logcat viewer** — streaming, filtering, high-volume safe
6. **Run/install** — build and install the app to a connected device
7. **Git** — status and diff
8. **adb file browser** — explore files on a connected device

**Out of scope (for now):** code indexing, IntelliSense/LSP, refactoring, debugger, layout editor, profiler, AVD management. Adding these would break the "lightweight" promise.

## Why

Android Studio's 2–4 GB+ JVM is the entire reason this exists. The idle target is **~90–150 MB**, and even under heavy logcat streaming memory stays bounded (**~150–300 MB**) via Rust-side batching, ring buffers, and viewport virtualization.

The core principle: **the frontend only renders already-processed data.** All parsing, filtering, and buffering happens in Rust before crossing the IPC boundary — that's the lever that keeps memory low.

## Tech stack

| Layer | Choice |
|---|---|
| Shell / runtime | **Tauri 2** (Rust + system WebView — no bundled Chromium) |
| Frontend | **React + TypeScript + Vite** |
| Editor | **CodeMirror 6** (`@uiw/react-codemirror`) |
| Backend | **Rust** — owns the `adb` / `gradlew` / `ripgrep` processes |
| Search | **ripgrep** (content) + fuzzy matching (filenames) |
| Git | **`git2`** (libgit2) |

## Requirements

- **Android SDK platform-tools** (`adb`) — detected from `ANDROID_HOME` / `ANDROID_SDK_ROOT` / `~/Library/Android/sdk`. Not bundled.
- **JDK 17+** and Gradle for the Android projects you build (JDK resolved via `/usr/libexec/java_home`).
- **ripgrep** — bundled as a sidecar.

## Development

```bash
npm install
npm run tauri dev      # run the app in dev mode
npm run typecheck      # TypeScript type check
npm run tauri build    # produce a release bundle
```

## Platform support

macOS first (WKWebView); Windows planned (WebView2). Linux is not targeted.

## License

[MIT](LICENSE)
