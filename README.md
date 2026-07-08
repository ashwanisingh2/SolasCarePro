# SolasCarePro

SolasCarePro is a professional-grade Advanced System Repair & Driver Management Suite designed for Windows administrators and power users. It provides a secure, streamlined Electron and React-based interface to execute powerful Windows maintenance operations safely.

## Features
- **System Maintenance:** Junk cleanup, DNS flushes, browser cache resets, power plan tweaks, and SSD TRIM optimization.
- **Hardware Diagnostics:** Memory tests, CPU analytics, driver sweeps, and disk checks.
- **Driver Management:** Scan and perform safe rollback or updates for PNP devices.
- **Software Updates:** Automated Winget integrations for software updates.

## Security & Architecture
SolasCarePro requires **Administrator privileges** to run, as it executes system-level PowerShell commands (e.g. `sfc /scannow`, `DISM`, registry updates). 

To ensure safety:
- **Strict Allowlist:** Arbitrary commands cannot be executed. Every command is defined and strictly validated in `electron/commandExecutor.js`.
- **Argument Escaping:** Arguments from the UI are sanitized and injected using parameterized script bindings or strict validation checks.
- **No Direct Shell Access:** The React frontend communicates strictly over a secure IPC bridge in `preload.js` and `main.js`. 
- **Auditing:** All destructive actions and command executions are securely logged in an immutable `audit.jsonl` file.

## Build Instructions
Ensure you have Node.js installed on your Windows machine.

1. `npm install`
2. `npm run dev` (for local development)
3. `npm run build` (to compile and package the executables)

## Requirements
- Windows 10 (Build 19041+) or Windows 11
- Administrator privileges

## Update Policy
SolasCare Pro uses a static release model. We do not use aggressive background auto-updaters. Instead, users can subscribe to our GitHub releases to download the latest signed installers. Security patches and major feature additions are typically released quarterly. 

## Privacy & Telemetry
SolasCare Pro operates **100% locally**. 
- We do **not** upload your system diagnostics, IP addresses, or repair logs to any remote server.
- Optional, anonymous crash telemetry can be opted-in via the Settings panel to help us identify unexpected application closures, but no personal data is attached to these traces.
