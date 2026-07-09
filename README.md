# SolasCare Pro

**SolasCare Pro** is a **Personal IT Administrator** for Windows — not just a cleaner app. Built on Electron + React + PowerShell, it bundles 10 production-grade features spanning cleanup, security, time-travel, hardware monitoring, and always-on auto-healing.

> **Vision (Brain.md):** Make SolasCare a "Personal IT Operating System" — beautiful UI, every action reversible, full transparency, always-on Sentinel. The CCleaner/BleachBit era is over.

## ✨ What's New in v5.0.0 — 10 Brain.md Features

| # | Feature | Category | What it does |
|---|---|---|---|
| 1 | **Surgical Uninstaller** | Phase 1 — Core | Point-in-time snapshots + diff to surgically remove every leftover file, registry key, and service when uninstalling apps. Includes Orphan Scanner. |
| 2 | **Smart Workspace Automation** | Phase 1 — Core | Context-aware profiles (Coding/Work/Gaming) that launch apps, set Focus Assist, lock power plan. Trigger-based activation (time / app / network). |
| 3 | **God Mode Visual Tweaker** | Phase 2 — Power User | 16 curated registry tweaks as visual cards with risk badges. 1-click Undo restores exact prior value. 4 curated bundles + JSON import/export for community tweaks. |
| 4 | **Software Forge** | Phase 2 — Power User | Silent batch installer via Winget + Bloatware Terminator (31 patterns) + 1-click driver rollback. Fresh-PC wizard with 4 role presets (Dev/Student/Creator/Minimal). |
| 5 | **Absolute Privacy Blackhole** | Phase 3 — Defense | Hybrid anti-telemetry: HOSTS (120+ domains) + Windows Firewall (per-binary) + GPO. Safe whitelist prevents breaking Windows Update. Live blocked-counter. |
| 6 | **Solas Vault** | Phase 3 — Defense | Ransomware-proof storage: VHD + BitLocker. Vault unmounted + invisible until password-unlocked. Auto-unmount on idle timeout. |
| 7 | **Micro-Snapshots** | Phase 4 — Time Machine | Pre-install System Restore points with smart naming. Retention policy (maxSnapshots, maxAge, disk threshold) with auto-cleanup watcher. |
| 8 | **One-Click PC Clone** | Phase 4 — Time Machine | Export apps (Winget) + Wi-Fi profiles + SolasCare workspaces + tweak history to AES-256-GCM encrypted `.solasclone` file. Selective import on new PC. |
| 9 | **Predictive Maintenance** | Phase 5 — Always-On | Hardware health score (0-100) from SMART, RAM errors, CPU temp, battery, disk free. 90-day trend graph. Threshold-based alerts (not predictive ML — vendor-inconsistent SMART makes that unreliable). |
| 10 | **Solas Sentinel** | Phase 5 — Always-On | Background watchdog with auto-heal rules engine. 6 heal actions (reset adapter, restart service, kill process, clear spooler, flush DNS, notify). Weekly digest. |

## 🛠️ Existing Pre-v5 Features (unchanged)

- **System Maintenance:** Junk cleanup, DNS flushes, browser cache resets, power plan tweaks, SSD TRIM.
- **Hardware Diagnostics:** Memory tests, CPU analytics, driver sweeps, disk checks.
- **Driver Management:** Scan, update, rollback, backup for PNP devices.
- **Software Updates:** Winget integration for app updates.
- **Network Monitor:** Live traffic chart, adapters, DNS status + reset tools.
- **Browser Repair:** Detect Chrome/Edge/Firefox/Brave/Opera + reset cache/full.
- **Hosts Editor:** Read/edit hosts file + preset ad-domain blocker.
- **File Tools:** Shredder (3-pass), Unlocker, Duplicate Finder, Broken Shortcuts scanner.
- **BSOD Analyzer:** Bugcheck 1001 event reader with code-to-cause mapping.
- **Audit Log:** All operations logged to `audit.jsonl` with 30-day + 10MB rotation.

## 🔐 Security & Architecture

SolasCare Pro requires **Administrator privileges** to run, as it executes system-level PowerShell commands (`sfc /scannow`, `DISM`, registry updates, VHD mounting, etc.).

Security hardening:
- **Strict Allowlist:** Every command is defined and validated in `electron/commandExecutor.js`. Unknown commands are blocked.
- **Argument Validation:** Per-command `buildArgs` validators reject shell metacharacters, path traversal, and PowerShell escape characters.
- **No Direct Shell Access:** The React renderer communicates strictly over a secure IPC bridge in `preload.js`. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- **CSP Enforcement:** Strict Content-Security-Policy injected via `<meta>` and dynamically via `session.onHeadersReceived`.
- **Audit Logging:** All destructive operations logged to `audit.jsonl` with 30-day + 10MB rotation.
- **Restore Points:** Mandatory System Restore point creation before risky operations (driver install/uninstall, registry edits).

## 🏗️ Build Instructions

Ensure you have Node.js 18+ on Windows.

```bash
# Install dependencies
npm install

# Development (Vite dev server + Electron)
npm run electron:dev

# Renderer-only dev
npm run dev

# Build installer (NSIS + portable + zip)
npm run build

# Vite build only (renderer bundle)
npm run vite:build

# Run unit tests (Vitest)
npm test

# Lint (ESLint)
npm run lint
npm run lint:fix
```

## 🧪 Testing

- **Unit Tests (Vitest):** `npm test` — 159+ tests covering all 10 features' arg validators + store round-trips.
- **PowerShell Tests (Pester):** `scripts/tests/SolasCarePro.Tests.ps1` — syntax check for all 60+ PS scripts.
- **E2E Tests (Playwright for Electron):** `npm run test:e2e` — smoke test launching main.js.
- **CI:** `.github/workflows/ci.yml` runs lint + tests + Vite build on every push/PR. `.github/workflows/psscriptanalyzer.yml` lints PowerShell.

## 📋 Requirements

- **OS:** Windows 10 (Build 19041+) or Windows 11
- **Privileges:** Administrator (UAC prompt on launch)
- **Optional:** Windows Pro/Enterprise for BitLocker (Solas Vault works unencrypted on Home)
- **Optional:** Winget (App Installer from Microsoft Store) for Software Forge

## 🔒 Update Policy

SolasCare Pro uses a static release model. We do not use aggressive background auto-updaters. Users can subscribe to GitHub Releases for the latest signed installers. Security patches and major feature additions are typically released quarterly.

## 🛡️ Privacy & Telemetry

SolasCare Pro operates **100% locally**.
- We do **not** upload your system diagnostics, IP addresses, or repair logs to any remote server.
- Optional, anonymous crash telemetry can be opted-in via Settings to help identify unexpected application closures. No personal data attached.

## 📁 Project Structure

```
SolasCarePro/
├── main.js                  # Electron main process (2,000+ LOC, 9 watcher loops)
├── preload.js               # contextBridge IPC bridge (60+ exposed methods)
├── electron/                # Node.js backend
│   ├── commandExecutor.js   # Allowlisted command registry (80+ commands)
│   ├── surgicalStore.js     # F1: snapshot/diff/orphan store
│   ├── workspaceStore.js    # F2: profiles + triggers store
│   ├── tweakerStore.js      # F3: catalog + applied log
│   ├── forgeStore.js        # F4: catalog + role presets
│   ├── privacyStore.js      # F5: blocklist + safe whitelist
│   ├── vaultStore.js        # F6: vault registry + activity log
│   ├── snapshotStore.js     # F7: retention policy + history
│   ├── cloneStore.js        # F8: AES-256-GCM encryption + history
│   ├── healthStore.js       # F9: thresholds + history + alerts
│   └── sentinelStore.js     # F10: rules engine + event log + digest
├── scripts/                 # 60+ PowerShell scripts (all dot-source _common.ps1)
└── src/                     # React renderer (lazy-loaded feature components)
    ├── components/
    │   ├── SurgicalUninstaller.jsx
    │   ├── WorkspaceAutomation.jsx
    │   ├── GodModeTweaker.jsx
    │   ├── SoftwareForge.jsx
    │   ├── PrivacyBlackhole.jsx
    │   ├── SolasVault.jsx
    │   ├── MicroSnapshots.jsx
    │   ├── PcClone.jsx
    │   ├── PredictiveMaintenance.jsx
    │   ├── SolasSentinel.jsx
    │   └── ... (28 existing components)
    └── context/
        ├── NotificationContext.jsx
        └── SystemMetricsContext.jsx
```

## 📜 License

See `LICENSE` file for details.

---

*SolasCare Pro — Not a cleaner. A Personal IT Operating System.*
