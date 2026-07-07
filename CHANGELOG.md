# Changelog

All notable changes to the **Solas Care Pro** system care suite are documented in this file.

---

## [3.1.0] - 2026-07-07

### Added
- **Enterprise Driver Manager Module**: Complete rewrite of `DriverManager.jsx` as a 9-tab enterprise-grade UI (Dashboard, Devices, Scan, Backup, Install, Verify, Windows Update, Reports, Remote) — 1596 lines replacing the previous 425-line basic version.
- **8 New PowerShell Scripts** for the full driver lifecycle: `driver_health_scan.ps1` (56 CM_PROB codes, 12 issue types, event log + SetupAPI parsing), `driver_backup.ps1` (Export-WindowsDriver + SHA256 manifest + verify/restore/delete), `driver_install.ps1` (pnputil add/delete/rollback/enum), `driver_verify.ps1` (Authenticode + WHQL + PE arch + catalog + OS build compat), `driver_wu_search.ps1` (native Microsoft.Update.Session COM), `driver_report.ps1` (HTML/JSON/CSV), `driver_remote.ps1` (WinRM test/scan/install/backup).
- **8 New Command Keys** in `commandExecutor.js`: `driver-health-scan`, `driver-backup`, `driver-install`, `driver-verify`, `driver-wu-search`, `driver-report`, `driver-remote`, `reboot-system`.
- **Auto System Restore Points** before any install, uninstall, rollback, or backup-restore operation (spec TASK 10 compliance).
- **Audit Logging** to `%APPDATA%\SolasCare\logs\audit.jsonl` with 10 MB rotation — JSONL format with timestamp, user, action, target, result, script.
- **Reboot-Required Banner** that triggers a real `shutdown.exe /r /t 30` (cancellable via `shutdown /a`) when any driver operation returns `rebootRequired:true`.
- **Balanced-Brace JSON Extractor** (`extractLastJson` helper in `DriverManager.jsx`) that correctly parses PowerShell stdout containing nested objects (replaces broken non-greedy regex).

### Fixed
- **JSON extraction regex** was non-greedy `/===RESULT===\s*(\{[\s\S]*?\})/` and broke on `install-folder`/`list-store` payloads containing nested objects. Replaced with a brace-depth-tracking walker.
- **Reboot banner "Reboot Now" button** was calling `flush-dns` + showing an alert (UI lie). Now calls new `reboot-system` command running real `shutdown.exe /r /t 30`.
- **`driver_backup.ps1` dead dism line**: Removed `dism.exe /Online /Export-DefaultAppAssociations` call that created a useless `appassoc.xml` file alongside real driver backups.
- **F7 Duplicate UI**: `PrivacyCleaner` + `LargeFileFinder` were mounted in BOTH `MaintenanceHub.jsx` AND `PowerFeatures.jsx`. Removed from `MaintenanceHub.jsx`.
- **2 Pre-existing PowerShell parse bugs**: `registry_hive_repair.ps1` and `safe_mode_repair.ps1` had `param()` blocks placed AFTER the `_common.ps1` dot-source — PowerShell 7 parser rejected them. Moved `param()` to top.
- **PerformanceMode.jsx UI lie**: Profile declared `backgroundApps:false` but never called `disable-background-apps`. Now actually calls it.
- **RepairDashboard.jsx duplicate command reference**: Replaced deleted `repair-system-restore` with `create-restore-point` (the canonical key).
- **iobit_one_click_care.ps1 ↔ pc-slow recipe step drift**: Both now mirror 7 identical steps in the same order (Restore → Temp → DNS → Winsock → TCP/IP → TRIM → SFC).

### Changed
- **`scan_drivers.ps1` upgraded**: Now returns full DeviceInfo schema (DeviceName, PnpDeviceId, HardwareId, AllHardwareIds, VendorId, DeviceId, Manufacturer, DriverVersion, DriverDate, DriverProvider, DriverInfName, DriverClass, DriverClassGuid, DigitalSigner, IsDigitallySigned, IsWhqlCertified, Status, ProblemCode, ProblemIssue, Category, IsPresent, LastInstalled) instead of the previous 8-field minimal shape.
- **`iobit_one_click_care.ps1` renamed to `one_click_care.ps1`** to remove misleading third-party vendor reference. Updated `schedule_care.ps1` reference accordingly.
- **`AIDiagnostics.jsx` renamed in UI** from "AI Diagnostics" to "Smart Diagnostics" (file/IPC key unchanged — backend contract preserved). Brain icon replaced with Stethoscope; info badge added clarifying rule-based engine.
- **`_common.ps1` extended** with `Write-AuditLog` (JSONL sink) and `New-SolasRestorePoint` (WMI + Checkpoint-Computer fallback) helpers shared across all 44 PowerShell scripts.
- **README.md updated** with full Driver Manager module documentation, tab reference table, and safety features list.

### Removed
- **7 Orphan React Components** (imported via `React.lazy` in `App.jsx` but never rendered): `AutoPilot.jsx`, `FixMyProblem.jsx`, `QuickFix.jsx`, `OneClickCare.jsx`, `WindowsHealth.jsx`, `HardwareInfo.jsx`, `Diagnostics.jsx`.
- **14 Orphan PowerShell Scripts** with zero command-key references: `activation_check.ps1`, `disk_benchmark.ps1`, `disk_health.ps1`, `enable_restore.ps1`, `error_log_analyzer.ps1`, `hardware_info.ps1`, `hardware_sensors.ps1`, `health_score.ps1`, `installed_software.ps1`, `repair_user_profile.ps1`, `reregister_dll.ps1`, `unschedule_care.ps1`, `windows_info.ps1`, `windows_update_history.ps1`.
- **71 Orphan/Duplicate Command Keys** from `commandExecutor.js`, including exact duplicate `repair-system-restore` (= `create-restore-point`).
- **`iobit_one_click_care.ps1`** (renamed to `one_click_care.ps1` — old file deleted).

### Stats
- React components: 27 → 20
- PowerShell scripts: 51 → 44 (all parse OK on PowerShell 7.4.7)
- `commandExecutor.js`: 1893 → 1380 lines
- Net code change: +2,068 / −6,197 = **−4,129 lines**

---

## [3.0.0] - 2026-06-25

### Added
- **AI Diagnostics Module** (`AIDiagnostics.jsx` + `ai_diagnostics.ps1`): Rule-based expert system with 4 tabs — Diagnose, Recommendations, Predictive Failure, Self-Healing. Surfaces WMI metric thresholds as findings with severity, recommends Smart Repair recipes for self-heal.
- **Report Center** (`ReportCenter.jsx`): Browse and open generated HTML/JSON reports from `%APPDATA%\SolasCare\reports\`.
- **Disk Benchmark** script: Sequential + random read/write speed test via `winsat disk` + `fsutil file createnew` patterns.
- **Health Score Engine** (`health_score.ps1`): Holistic 0–100 score across 6 categories (RAM, Disk, Updates, Drivers, Errors, SMART).
- **Hardware Sensors Reader**: WMI-based temperature, fan speed, voltage queries via `OpenHardwareMonitor`-compatible providers where available.
- **Error Log Analyzer** (`error_log_analyzer.ps1`): Aggregates System + Application event log errors over configurable window, returns top-N error patterns.
- **Installed Software Inventory** (`installed_software.ps1`): WMI + registry hybrid scan for installed programs with versions and uninstall strings.

### Fixed
- **Browser detection false positives**: `detect-browsers` was misclassifying Edge variants as Chrome. Now checks `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths` for binary path accuracy.
- **App icon missing in built .exe**: Added `icon.png` to `electron-builder` config and `asarUnpack` for proper resource extraction.
- **Duplicate UI entries**: Removed orphan sidebar entries pointing to non-rendered components.

---

## [2.5.0] - 2026-06-18

### Added
- **Smart Repair Center** (`SmartRepair.jsx`): 7 repair recipes (`pc-slow`, `internet-issues`, `blue-screen`, `windows-update-stuck`, `disk-issues`, `system-corruption`, `freshen-windows`) — each runs an ordered sequence of allow-listed commands with progress streaming and per-step success/failure tracking.
- **8 Missing Repair Tools** as individual command keys: `sfc-custom-scan` (per-file SFC), `dism-custom-source` (DISM with ISO/WIM source + LimitAccess), `registry-hive-repair` (per-hive SYSTEM/SOFTWARE/SAM/SECURITY repair), `driver-verifier` (BSOD diagnosis stress test), `safe-mode-repair` (boot config for safe mode), `parse-cbs-log`, `parse-dism-log`, `repair-summary-report`.
- **Service Manager startup type UI**: Extended `ServiceManager.jsx` to show + edit `StartupType` (Automatic/Manual/Disabled/DelayedStart) via `service_repair.ps1`.
- **Conflict Detection** primitive (`check-repair-conflicts`): Returns `{conflict, activeCommands}` so the UI can warn before parallel destructive ops.
- **Pre-Repair Health Check** (`pre_repair_health_check.ps1`): Gate function that verifies disk space, battery, network, pending reboot, restore point availability, recent BSODs — returns `canProceed` boolean with blockers/warnings lists.

### Fixed
- **Recipe step abort on first failure**: Recipes now continue executing remaining steps after a step fails, surfacing all failures in the result object.
- **Confirm dialog race condition**: `ConfirmModal` was closing on outside-click while a confirm was in flight, leaking the Promise. Now uses an internal counter to track pending confirms.

---

## [2.1.0] - 2026-06-10

### Added
- **Shared Utilities Module** (`scripts/_common.ps1`): JSON output helpers (`ConvertTo-JsonArray`, `Write-JsonError`, `Write-JsonResult`), process timeout wrapper (`Invoke-WithTimeout`), retry helper (`Invoke-WithRetry`), admin assertion (`Assert-Admin`), stopwatch timer (`Start-Timer`/`Get-TimerElapsedSec`), and cached network adapter lookup (`Get-EnabledAdapters`). Dot-sourced by every script — single source of truth for I/O conventions.
- **IPC Hardening**: All `runSystemCommand` args now pass through `buildArgs` validators that reject shell metacharacters, path traversal (`..`), oversized inputs, and unknown enum values. PnP device IDs validated against `^[A-Za-z0-9\\&_.\-{}]+$`.
- **Real Diagnostics**: Replaced mock WMI counters with live `Win32_PerfFormattedData_*` queries. Dashboard now shows true CPU load, memory pressure, disk queue depth, and per-adapter throughput.
- **UX Upgrades**: Added Framer Motion transitions to all tab switches, Recharts for trend visualizations, and Skeleton loaders for async tab content.

### Fixed
- **Security: arbitrary PowerShell injection** via unsanitized `runSystemCommand` string args. Now all args go through `buildArgs` whitelists.
- **IPC: race condition** when multiple commands ran in parallel and shared a single stdout buffer. Each child process now has its own stream channel.
- **Data integrity**: `audit.log` was being truncated on each app launch. Now append-only.
- **Crash on missing WMI namespace** (Windows 7 fallback): All `Get-CimInstance` calls now have `Get-WmiObject` fallbacks.

---

## [2.0.0] - 2026-06-02

### Added
- **System Tray Integration**: Added custom System Tray support in Electron main process (`main.js`) with restore double-clicks and right-click exit support.
- **Dynamic Compatibility Banner**: Injected a diagnostic alert banner when running under legacy Windows (< 10) to inform users of disabled modern dependencies (like Winget).
- **Silent Restore Point Enabler**: Integrated `scripts/enable_restore.ps1` script to enable Windows System Protection automatically with 10% shadow storage resizing.
- **WMI-based Storage Device Query**: Integrated `scripts/get_drives_info.ps1` to query storage drive volumes, physical media types (HDD vs SSD), and simulated fragmentation levels.
- **Dual-mode Network Watchdog**: Integrated `scripts/network_optimize.ps1` to measure live download traffic and execute Winsock/IP table drops.

### Fixed
- **UAC Privilege Elevation (Issue 1)**: Re-implemented Electron UAC elevation loop-prevention checks via a local timestamped flag at `%TEMP%/solas_relaunch.flag`. Shows a clear native modal explaining privileges before launching UAC.
- **PowerShell Execution Policy Block (Issue 2)**: Added startup checks for execution policies. Automatically applies `-Scope Process -ExecutionPolicy Bypass` and offers automatic cmd.exe execution fallbacks for critical commands if PowerShell is blocked.
- **Winget DNS Self-Healing (Issue 3)**: Modified update flows to atomically back up DNS adapter indices to `%TEMP%/solas_dns_backup.json` using WMI, test Google connection on port 53, set Google DNS using WMI (netsh fallback), enforce a 5-minute timeout, and restore original adapter settings automatically on completion.
- **Task Scheduler SYSTEM Context (Issue 4)**: Configured scheduler registrations to use the `SYSTEM` security account with `Highest` privileges and verify the presence of `<RunLevel>HighestAvailable</RunLevel>` inside task configuration files using `schtasks /Query /XML`.
- **SFC UI Freeze (Issue 5)**: Migrated SFC scan routines to child process spawns with stdout streaming. Dynamically parses stdout progress strings (`Verification X% complete`) to feed React state and updates remaining time estimates. Exposes an asynchronous "Minimize to Tray" wrapper.
- **SSD TRIM Target Checks (Issue 6)**: Added physical media checking to disable TRIM selections for mechanical HDDs. Verifies TRIM behavior status via `fsutil behavior query DisableDeleteNotify` and automatically enables TRIM if disabled.
- **Driver Recovery Safeguards (Issue 7)**: Implemented automated device registry key backups to `%TEMP%/solas_driver_backup_[HWID].reg` before disabling. Added a "Registry Safe Mode" toggle to prevent disabling if registry backup fails, and a "Restore Backup" button to import registry files.
- **Whitelisted Junk Cleanups (Issue 8)**: Rewrote cleanup scripts to implement a 5-minute file age protection buffer. Shows a detailed preview of files and sizes, calculates total space to free, and implements a 30-second Undo cache moving files to a temp path before recycling them.
- **BSOD Minidump Parsing (Issue 9)**: Implemented a physical minidump parsing script that falls back to Windows System Error Reporting events. Maps bugcheck codes to likely causes, and compiles a styled HTML report at `%TEMP%/solas_bsod_report.html` openable via `shell.openPath`.
- **Desktop Battery Fallbacks (Issue 10)**: Upgraded battery checking to detect desktop hardware configurations first, bypassing powercfg scans to prevent execution failures, and parses laptop capacity profiles including Chemistry.
- **Verified System Snapshots (Issue 11)**: Implemented WMI-based checkpointing in `create_restore_point.ps1` that queries the volume table to verify checkpoint presence. Displays diagnostic warnings and a remediation guide if System Protection is disabled.
- **Network Reset warnings (Issue 12)**: Programmed network check scripts to measure live downstream traffic. Warns users of active downloads, shows temporary internet loss warnings, and manages automated interface resets and SSID WiFi reconnection.
- **Live WMI Performance Counters (Issue 13)**: Replaced fake/static dashboard graphs with real WMI processor load, system memory capacity, disk usage, and network adapter traffic speed counters. Returns "Data Unavailable" on WMI queries failure.
- **Settings Sync & Registry integration (Issue 14)**: Replaced mock settings with a custom CommonJS config loader (`settings.json`). Synchronizes "Run at Windows Startup" toggles with the `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` registry database.
- **Windows 7/8 Compatibility (Issue 15)**: Ported WMI CIM classes to native `Get-WmiObject` calls to prevent script crash cycles on Windows 7. Swapped out modern netsh/PowerShell network cmdlets for legacy cmd shell resets.
