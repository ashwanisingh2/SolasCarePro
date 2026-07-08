# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
