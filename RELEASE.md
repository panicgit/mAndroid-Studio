# DAS — Release & Packaging (M6)

## Build (unsigned, local)
```bash
npm run tauri build
```
Produces `src-tauri/target/release/bundle/macos/DAS.app` and `.../dmg/DAS_<ver>_<arch>.dmg`.
Unsigned builds run locally but Gatekeeper will warn other users.

## macOS signing + notarization
Requires an Apple Developer account (Developer ID Application certificate — only the
account holder can create it).

1. Install the **Developer ID Application** cert into the login keychain.
2. Set env vars, then build:
   ```bash
   export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
   # Notarization — either an app-specific password…
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="app-specific-password"
   export APPLE_TEAM_ID="TEAMID"
   # …or an App Store Connect API key (APPLE_API_KEY / APPLE_API_ISSUER / APPLE_API_KEY_PATH)
   npm run tauri build
   ```
   Tauri signs with the hardened runtime (using `src-tauri/Entitlements.plist`,
   which enables `com.apple.security.cs.allow-jit` for WKWebView) and auto-notarizes.
3. ⚠️ **Sidecars**: if/when ripgrep is bundled as a sidecar (see "Distribution gaps"),
   each sidecar binary must be signed individually with the hardened runtime, or
   notarization fails (tauri-apps/tauri #11992, #14579).

## Auto-update (tauri-plugin-updater)
Not yet wired (dev builds don't need it). To enable:
1. `npm run tauri add updater`
2. Generate a signing keypair: `npm run tauri signer generate -- -w ~/.tauri/das.key`
   - **Store the private key + password as CI secrets. If lost, you can never push
     updates to installed users.**
3. Add to `tauri.conf.json`:
   ```json
   "plugins": { "updater": { "endpoints": ["https://github.com/<org>/das/releases/latest/download/latest.json"], "pubkey": "<public key from step 2>" } }
   ```
4. On release, publish the `.app.tar.gz` + signature + a `latest.json` manifest
   (the `tauri-action` GitHub Action generates these automatically).

## GitHub Action (release)
Use `tauri-apps/tauri-action` in `.github/workflows/release.yml`, passing the Apple
signing/notarization secrets and the updater private key as repo secrets. It builds,
signs, notarizes, and uploads the bundle + `latest.json` to a GitHub Release.

## Windows (later)
- Tauri uses WebView2 (ship the Evergreen bootstrapper or fixed runtime).
- Code-sign with a Windows cert.
- `ripgrep`/`adb` are resolved from PATH in dev; for a Windows distributable, decide
  whether to bundle `rg` per-target-triple (`rg-x86_64-pc-windows-msvc.exe`) and
  whether to require a user-installed `adb`.

## Distribution gaps (currently dev-only)
- **ripgrep / adb** are resolved from the system PATH (works on this dev machine).
  For a shippable build, bundle `rg` as a target-triple sidecar (`externalBin`) and
  either bundle or require `adb` (DAS users are Android devs and already have the SDK,
  so detecting the installed `adb` is the lighter choice — see TECH_SPEC §4).
