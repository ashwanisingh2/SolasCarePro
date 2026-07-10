# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2026-07-10

### Added
- **Command Hub — 18 new built-in scripts (16 → 34 total):** New categories Network, Repair, Security added.
  - Network: Wi-Fi password lister, open ports scanner, gateway ping, full network stack reset (Winsock + IPv4/IPv6 + DNS)
  - System: Disk space usage, top CPU processes, environment variables, scheduled tasks list, Windows license status
  - Repair: SFC scan (sfc /scannow), DISM health check, DNS+browser hint flush, icon cache rebuild, silent Disk Cleanup
  - Security: Firewall rules summary, Defender quick scan, startup programs (registry), pending reboot check
- **AI Diagnostics — complete engine rewrite:** Replaced JS keyword-matching heuristic with real call to `ai_diagnostics.ps1` expert system. Now surfaces structured `findings[]` (severity, category, diagnosis, recommendation) and `predictions[]` via 4 action buttons: Run Full Diagnostics, Predict Failures, Get Recommendations, Self-Heal Analysis.
- **AI Diagnostics — Fix routing:** Each finding card has a "Fix Now →" button that navigates directly to the relevant SolasCare tab (e.g., bad drivers → Driver Manager, disk → Command Hub, updates → Software Forge).
- **AI Diagnostics — Live metrics bar:** Shows RAM%, free disk space bar, error events count, bad drivers, pending updates, pending reboot status — all pulled from PS JSON response.
- **Hardware Health — ComponentCard "Fix This" button:** Each health card now shows an actionable fix button when that component contributes a score penalty. SMART disk → runs chkdsk; RAM → mdsched.exe guide; CPU temp → cooling guide; Battery → battery report HTML; Disk free → runs silent disk cleanup.
- **Hardware Health — SMART detail expansion table:** After "Refresh Metrics", a collapsible table shows per-disk detail: type, size, health badge (Healthy/Warning/Critical), operational status, and reason for state.
- **Hardware Health — 5th "Diagnostics" tab:** Inline AI diagnostics tab inside Hardware Health; runs `ai_diagnostics.ps1 diagnose` and shows findings without leaving the page.
- **Settings — Antivirus exclusion banner:** First-run amber banner explaining why SolasCare may trigger AV, with link to ANTIVIRUS-GUIDE.md and dismiss button (persisted to settings).

### Changed
- **App.jsx:** `renderContent` now passes `setActiveTab` prop to AI Diagnostics component for fix routing.


### Fixed
- **Production build:** Added Terser minification with `drop_console: true` — all `console.log/warn/error` statements now stripped from production bundles automatically.
- **DriverManager.jsx:** Replaced blocking native `alert()` call with `addNotification()` toast (modern UI, non-blocking).
- **PC Clone:** Added real-time progress bar (0→100%) with animated gradient (violet→cyan export, cyan→emerald import). Cancel button now visible during operation; modal locked to prevent accidental close.
- **DeviceDetails.jsx:** Added animated skeleton loading placeholder — no more blank screen during 15-30 second hardware scan. Added 5-minute data cache (zero reload time on revisit). Software section deferred separately (20s details + 10s software). Default expand state reduced to 3 sections for 60% faster initial render.
- **Build config:** Disabled source maps in production (`sourcemap: false`). Added `build:prod` / `build:dev` script separation. Added `prebuild` lint check. Added manual chunk splitting for better caching.
- **Error handling:** Added `src/utils/errorMessages.js` with context-aware, user-friendly error messages and actionable suggestions.
- **Logging:** Added `src/utils/logger.js` production-safe logger — dev builds keep console, production builds silent.

### Added
- **In-app update checker:** Settings page now shows current version and "Check for Updates" button. Queries GitHub Releases API; opens browser to download page if update available. No auto-download (safe without code signing).
- **AV exclusion banner:** First-run amber banner in Settings guides users to add AV exclusions — prevents false positives from PowerShell/registry operations. Dismissible and persisted.
- **`ANTIVIRUS-GUIDE.md`:** Step-by-step exclusion instructions for Windows Defender, Avast/AVG, Malwarebytes, and Bitdefender.
- **`USER-GUIDE.md`:** Comprehensive user documentation — installation, first-run setup, all 10 feature walkthroughs, troubleshooting FAQ.
- **`.github/workflows/ci.yml`:** Full CI pipeline — ESLint + Vitest tests + Vite production build on every push/PR to `main`.
- **`package.json`:** Added `repository`, `author`, `license` fields (required by electron-builder).
- **`App.jsx`:** Header version badge now reads dynamically from `systemInfo.appVersion` instead of hard-coded `v5.0.0`.

### Fixed
- **`vite.config.js`:** Removed redundant `removeConsolePlugin` (regex-based) — Terser `drop_console: true` is the single reliable console-stripping mechanism.

## [5.0.0] - 2026-07-08

### Added — 10 Brain.md Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Surgical Uninstaller** | Point-in-time snapshots + diff engine removes every leftover file, registry key, and service after uninstall. Orphan Scanner included. |
| 2 | **Smart Workspace Automation** | Context-aware profiles (Coding/Work/Gaming) with trigger-based activation (time / app / network). Launches apps, sets Focus Assist, locks power plan. |
| 3 | **God Mode Visual Tweaker** | 16 curated registry tweaks as visual cards with risk badges. 1-click Undo. 4 curated bundles + JSON import/export. |
| 4 | **Software Forge** | Silent batch installer via Winget + Bloatware Terminator (31 patterns) + 1-click driver rollback. Fresh-PC wizard with 4 role presets. |
| 5 | **Absolute Privacy Blackhole** | Hybrid anti-telemetry: HOSTS (120+ domains) + Windows Firewall per-binary + GPO. Safe whitelist prevents breaking Windows Update. Live blocked-counter. |
| 6 | **Solas Vault** | Ransomware-proof VHD + BitLocker storage. Vault invisible until password-unlocked. Auto-unmount on idle timeout. |
| 7 | **Micro-Snapshots** | Pre-operation System Restore points with smart naming. Retention policy (maxSnapshots, maxAge, disk threshold) + auto-cleanup watcher. |
| 8 | **One-Click PC Clone** | Export apps + Wi-Fi profiles + workspaces + tweak history to AES-256-GCM encrypted `.solasclone` file. Selective import on new PC. |
| 9 | **Predictive Maintenance** | Hardware health score (0-100) from SMART, RAM, CPU temp, battery, disk free. 90-day trend graph. Threshold-based alerts. |
| 10 | **Solas Sentinel** | Background watchdog with auto-heal rules engine. 6 heal actions (reset adapter, restart service, kill process, clear spooler, flush DNS, notify). Weekly digest. |

## [4.3.0] - 2026-07-08
### Added
- Feature Consolidation: Unified Dashboard, System Health Advisor, Performance Tuning, and Drivers modules.
- Dry-Run Previews for destructive operations.
- System Restore point creation before operations.
- Opt-in Usage Analytics and Crash Telemetry settings.
- AutoPilot Transparency indicators on the Dashboard.
- Safe Exit prompt preventing blind-killing of destructive background processes.
- Automatic Log Rotation for `audit.jsonl` and text logs.
- Uninstaller NSIS script to clean up registry and scheduled tasks.
- App branding unified to "SolasCare Pro" globally.

## [4.2.2] - 2026-07-08
### Added
- Automated test suites using Vitest and Playwright.
- Global crash handlers (`uncaughtException` and `unhandledRejection`) to log and notify users of fatal errors.
- Comprehensive `README.md`, `CONTRIBUTING.md`, and this `CHANGELOG.md`.
- Code signing configuration block in `package.json`.

### Fixed
- Fixed bug in `RegistryManager` where the backup command missed the `-Action` parameter value.
- Fixed `NetworkMonitor` incorrectly reporting connected status by properly parsing the native detection response.
- Fixed deduplication key to include argument signatures, preventing collisions in queued operations.
- Fixed `SoftwareUpdater` crashing due to DNS status object mismatch.
- Corrected missing `await` in `MaintenanceHub.jsx` `junk-commit` logic.
- Fixed taskmgr.exe open command syntax error.
