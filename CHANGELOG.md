# Changelog

All notable changes to the **Solas Care Pro** system care suite are documented in this file.

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
