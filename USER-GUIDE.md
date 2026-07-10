# 📖 SolasCare Pro — User Guide

**Version:** 5.0.1 | **Platform:** Windows 10 (Build 19041+) / Windows 11

SolasCare Pro is your **Personal IT Administrator** — a single desktop app that handles cleanup,
security, system repair, hardware monitoring, and always-on auto-healing. This guide covers
everything from first install to advanced features.

---

## Table of Contents

1. [Installation](#installation)
2. [First-Run Checklist](#first-run-checklist)
3. [Dashboard Overview](#dashboard-overview)
4. [Feature Guide — 10 Brain.md Features](#feature-guide)
5. [Classic Tools (Pre-v5)](#classic-tools)
6. [Settings Reference](#settings-reference)
7. [Troubleshooting FAQ](#troubleshooting-faq)
8. [Backing Up Your Data](#backing-up-your-data)

---

## Installation

### Requirements
- Windows 10 (Build 19041 / 20H1 or newer) or Windows 11
- Administrator account (UAC prompt on launch)
- Optional: Windows Pro/Enterprise for BitLocker (Solas Vault works without encryption on Home)
- Optional: Winget (App Installer from Microsoft Store) for Software Forge

### Steps
1. Download the latest installer from the [GitHub Releases page](https://github.com/SPTL-Solas/SolasCarePro/releases)
2. Right-click the `.exe` → **Run as administrator** (required for system-level features)
3. If Windows SmartScreen appears: click **More info** → **Run anyway**
   > ⚠️ SmartScreen shows this for all apps without a paid code signing certificate. SolasCare is
   > open-source and safe — you can verify the source code on GitHub.
4. Follow the NSIS installer wizard
5. Launch **SolasCare Pro** from the Desktop shortcut or Start menu

### Why Administrator Privileges?
SolasCare Pro requires Admin to:
- Run `sfc /scannow` and DISM system repair
- Modify registry keys (God Mode Tweaker, Surgical Uninstaller)
- Mount/unmount VHDs (Solas Vault)
- Edit the HOSTS file (Privacy Blackhole)
- Install/uninstall drivers
- Create and manage Windows Scheduled Tasks (Solas Sentinel)

---

## First-Run Checklist

Complete these steps after first launch for the best experience:

### ✅ Step 1 — Add Antivirus Exclusion
SolasCare uses PowerShell and registry operations that antivirus programs may flag as suspicious.
This is a false positive. Add these folders to your AV exclusion list:
- `C:\Program Files\SolasCare Pro\`
- `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`

→ See **[ANTIVIRUS-GUIDE.md](./ANTIVIRUS-GUIDE.md)** for step-by-step instructions for your specific AV.

### ✅ Step 2 — Configure Startup Behavior (Settings)
Go to **Settings** → **General Configuration**:
- Enable **Run at Windows Startup** if you want Sentinel background monitoring always-on
- Enable **Full Manual Mode** if you prefer no automation at all

### ✅ Step 3 — Check Hardware Health (Predictive Maintenance)
Run your first hardware health scan to establish a baseline. SolasCare tracks 90-day trends —
the earlier you start, the better the trend data.

### ✅ Step 4 — Set Up Solas Sentinel
Configure at least one auto-heal rule (e.g., "flush DNS if no internet for 60 seconds") so the
background watchdog starts protecting your system.

### ✅ Step 5 — Create a System Snapshot
Before making any major system changes, go to **Micro-Snapshots** and create a named restore point.

---

## Dashboard Overview

The **Unified Dashboard** is your home screen:

| Card | What it shows |
|------|--------------|
| **System Health Score** | 0-100 score from hardware checks (CPU, RAM, disk, battery) |
| **AutoPilot Status** | Whether background automation is active or paused |
| **Active Processes** | Count of background system operations running |
| **Sentinel Status** | Whether the watchdog is monitoring and how many rules are active |
| **Recent Activity** | Last 5 audit log entries |
| **Quick Actions** | One-click Junk Cleanup, DNS Flush, Restart Explorer |

---

## Feature Guide

### 1. 🔪 Surgical Uninstaller

**What:** Completely removes apps including every leftover file, registry key, and service.

**How to use:**
1. Click **Surgical Uninstaller** in the sidebar
2. **Take Snapshot** before installing any app → SolasCare records the current system state
3. Install your app normally
4. When you want to uninstall: return here and click **Diff Snapshot** — it shows exactly what the installer added (files, registry keys, services)
5. Click **Surgical Remove** to delete everything the installer touched
6. Use **Orphan Scanner** to find leftover app data even for apps installed before you started using SolasCare

**When to use:** Any time you want a clean uninstall, or when the standard Windows uninstaller leaves junk behind.

---

### 2. 🏢 Smart Workspace Automation

**What:** Automatically applies a "profile" (app launcher + Focus Assist + power plan) based on context triggers.

**How to use:**
1. Click **Workspace Automation** → **Create Profile**
2. Name your profile (e.g., "Coding Mode")
3. Add apps to launch, set Focus Assist level, choose power plan
4. Set **Triggers** (any combination):
   - **Time:** "Activate at 9 AM on weekdays"
   - **App:** "Activate when VS Code opens"
   - **Network:** "Activate when I connect to the Office Wi-Fi"
5. Toggle the profile **Active** — triggers will fire it automatically

**Profiles available:** Coding, Work, Gaming, or fully custom.

---

### 3. ⚡ God Mode Visual Tweaker

**What:** 16 curated Windows registry tweaks presented as visual cards with risk ratings.

**How to use:**
1. Click **God Mode Tweaker**
2. Browse tweaks — each card shows: name, description, risk badge (Safe / Moderate / Advanced), and current state
3. Click any tweak card to expand details and see exactly what registry key is modified
4. Click **Apply** — SolasCare saves the previous value automatically
5. Click **Undo** anytime to restore the exact previous registry value

**Bundles:** 4 pre-built bundles (Performance, Privacy, Gaming, Developer) apply multiple related tweaks at once.

**Import/Export:** Share tweak configurations as JSON files with the community.

> ⚠️ Tweaks marked **Advanced** modify system behavior — read the description before applying.

---

### 4. 🔧 Software Forge

**What:** Batch-install apps silently via Winget, remove bloatware, and set up a fresh PC.

**How to use:**

**Batch Install:**
1. Browse the **App Catalog** and check the apps you want
2. Click **Install Selected** — all apps install silently in the background
3. Watch the streaming progress log

**Bloatware Terminator:**
1. Click **Scan for Bloatware** — detects 31 common bloatware patterns
2. Review the list and uncheck anything you want to keep
3. Click **Remove Selected**

**Fresh PC Wizard:**
- Choose a role preset: **Developer**, **Student**, **Content Creator**, or **Minimal**
- Each preset installs a curated app bundle for that use case with one click

**Driver Rollback:**
- Select any device driver → click **Rollback** to restore the previous version

> ℹ️ Requires Winget (App Installer) from the Microsoft Store. Most Windows 11 machines have it already.

---

### 5. 🕵️ Absolute Privacy Blackhole

**What:** Hybrid anti-telemetry system blocking Microsoft and third-party tracking at three levels.

**How to use:**
1. Click **Privacy Blackhole**
2. View the **Live Blocked Counter** showing how many tracking requests have been blocked
3. Three blocking methods operate simultaneously:
   - **HOSTS File** (120+ tracking domains → 0.0.0.0)
   - **Windows Firewall** (per-binary blocking of telemetry executables)
   - **Group Policy** (GPO settings for telemetry services)
4. Use **Safe Whitelist** mode — critical Windows Update domains are never blocked

> ✅ Windows Update, Store downloads, and Microsoft sign-in are protected from accidental blocking.

---

### 6. 🔒 Solas Vault

**What:** A secure, hidden storage container — VHD file encrypted with BitLocker. Invisible when locked.

**How to use:**
1. Click **Solas Vault** → **Create New Vault**
2. Set a vault name, size (GB), and strong password
3. SolasCare creates an encrypted VHD file + BitLocker-protects it
4. To access your vault: click **Unlock Vault** → enter password → drive letter appears in File Explorer
5. Store sensitive files there normally
6. When done: click **Lock Vault** — the drive disappears and the VHD is invisible to other users

**Auto-Lock:** Set an idle timeout (e.g., 15 minutes) — vault locks automatically if you forget.

> ℹ️ BitLocker encryption requires Windows Pro or Enterprise. On Windows Home, the VHD is password-protected but not BitLocker-encrypted.

---

### 7. ⏱️ Micro-Snapshots

**What:** Create named System Restore points before risky operations. Automatic retention management.

**How to use:**
1. Click **Micro-Snapshots** → **Create Snapshot**
2. Enter a descriptive name (e.g., "Before installing GPU driver v555.85")
3. SolasCare creates a Windows System Restore point with that exact name
4. To restore: use the standard Windows **System Restore** tool (or `rstrui.exe`)
5. Configure **Retention Policy**: max snapshots, max age (days), disk usage threshold

**Auto-Cleanup Watcher:** When you exceed the retention limits, oldest snapshots are removed automatically.

> ℹ️ System Restore points protect system files and registry — they do NOT back up personal files. Use PC Clone for full data backup.

---

### 8. 💾 One-Click PC Clone

**What:** Exports your entire SolasCare setup to a portable `.solasclone` file — encrypted backup of apps, Wi-Fi profiles, workspaces, and tweak history.

**How to use:**

**Export (Current PC):**
1. Click **PC Clone** → **Export**
2. Choose what to include (apps list, Wi-Fi profiles, workspaces, tweak history)
3. Set an export password
4. Choose save location → click **Export**
5. Progress bar shows: Collecting data → Compressing → Encrypting (AES-256) → Saving

**Import (New PC):**
1. On the new PC, install SolasCare Pro
2. Click **PC Clone** → **Import**
3. Select your `.solasclone` file → enter the export password
4. Choose what to restore (selective import — not all-or-nothing)
5. Click **Import** — apps install via Winget, Wi-Fi profiles register, workspaces and tweaks restore

> ℹ️ The `.solasclone` file is AES-256-GCM encrypted. Without the password, the contents are unreadable.

---

### 9. 🩺 Predictive Maintenance

**What:** Calculates a 0-100 hardware health score from real system data. 90-day trend graph. Threshold-based alerts.

**What it checks:**
| Check | Healthy Range | Alert Threshold |
|-------|--------------|-----------------|
| Disk SMART status | Passed | Any SMART failure = alert |
| RAM error rate | 0 errors | > 0 ECC errors |
| CPU temperature | < 80°C | > 90°C sustained |
| Battery health | > 80% capacity | < 40% capacity |
| Disk free space | > 15% | < 5% |

**How to use:**
1. Click **Predictive Maintenance** → **Run Health Scan**
2. View the health score (0-100) and which checks contribute
3. See the **90-Day Trend Graph** — a declining trend over weeks suggests hardware degradation
4. Configure **Alert Thresholds** to your preferences

**Automatic Alerts:** When Sentinel is active, health threshold breaches trigger native Windows notifications.

---

### 10. 🤖 Solas Sentinel

**What:** Always-on background watchdog that monitors and auto-heals common PC issues.

**6 Heal Actions:**
| Action | When triggered |
|--------|----------------|
| **Reset Network Adapter** | No internet for N minutes |
| **Restart Windows Service** | A service you depend on crashes |
| **Kill Process** | A frozen process using > X% CPU |
| **Clear Print Spooler** | Printer queue stuck |
| **Flush DNS Cache** | DNS resolution failures detected |
| **Send Notification** | Custom alert rule — just notify, don't heal |

**How to use:**
1. Click **Solas Sentinel** → **Add Rule**
2. Choose a **Condition** (network down, service stopped, CPU spike, etc.)
3. Choose an **Action** from the 6 above
4. Set a **Cooldown** (minimum minutes between triggers — prevents spam)
5. Toggle rule **Active**
6. View the **Event Log** to see every time a rule fired and what it did
7. Read the **Weekly Digest** — summary of all auto-healing activity

> ✅ Sentinel runs in the background via Windows Scheduled Task — survives app restarts.

---

## Classic Tools

These pre-v5 tools are unchanged and remain fully functional:

| Tool | What it does |
|------|-------------|
| **System Maintenance** | Junk cleanup, DNS flush, browser cache reset, power plan tweaks, SSD TRIM |
| **Hardware Diagnostics** | Memory test, CPU analytics, driver sweep, disk check |
| **Driver Management** | Scan, update, rollback, backup for all PNP devices |
| **Software Updates** | Winget-based app update checker and installer |
| **Network Monitor** | Live traffic chart, adapter status, DNS health + one-click reset |
| **Browser Repair** | Detect and reset Chrome, Edge, Firefox, Brave, Opera |
| **Hosts Editor** | View/edit HOSTS file + one-click ad-domain blocker preset |
| **File Shredder** | 3-pass secure delete (unrecoverable) |
| **File Unlocker** | Force-unlock files held by other processes |
| **Duplicate Finder** | Find and remove duplicate files by hash |
| **Broken Shortcuts** | Scan and delete dead Desktop/Start Menu shortcuts |
| **BSOD Analyzer** | Read Event Log bugcheck codes and map them to likely causes |
| **Audit Log** | View the full history of every SolasCare operation |

---

## Settings Reference

| Setting | Default | What it does |
|---------|---------|-------------|
| **Full Manual Mode** | Off | Disables ALL background automation — nothing runs without your click |
| **Run at Windows Startup** | Off | Launches SolasCare in system tray on Windows log-on |
| **Usage Analytics** | Off | Anonymous local-only feature usage tracking (never uploaded) |
| **Crash Telemetry** | Off | Opt-in crash trace logging |
| **Update Channel** | Stable | Choose Stable, Beta, or Developer build track |
| **Export Settings** | — | Save all settings to a JSON backup file |
| **Import Settings** | — | Restore settings from a backup |
| **Check for Updates** | — | Query GitHub Releases API for newer versions |

---

## Troubleshooting FAQ

### ❓ "Windows protected your PC" appears when installing

**Cause:** SolasCare Pro does not yet have a paid code-signing certificate (EV Certificate). Windows SmartScreen shows this for all unsigned executables.

**Fix:**
1. Click **More info** in the SmartScreen dialog
2. Click **Run anyway**
3. This is safe — you can verify the source code on GitHub

---

### ❓ My antivirus quarantined SolasCare or flagged a PowerShell script

**Cause:** False positive. See [Why Does This Happen?](./ANTIVIRUS-GUIDE.md#why-does-this-happen)

**Fix:** Add exclusions per **[ANTIVIRUS-GUIDE.md](./ANTIVIRUS-GUIDE.md)**

---

### ❓ PowerShell scripts fail with "execution policy" error

**Cause:** Your system's PowerShell execution policy is set to `Restricted` or `AllSigned`.

**Fix:** SolasCare uses `-ExecutionPolicy Bypass` per-command — this should work automatically. If it doesn't:
1. Open PowerShell as Administrator
2. Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope LocalMachine`
3. Restart SolasCare

---

### ❓ Winget commands fail in Software Forge

**Cause:** Winget (App Installer) is not installed or outdated.

**Fix:**
1. Open Microsoft Store → search **App Installer** → click **Get** / **Update**
2. Alternatively: `winget upgrade --id Microsoft.AppInstaller`

---

### ❓ Solas Vault won't unlock / "BitLocker not available"

**Cause:** BitLocker requires Windows Pro or Enterprise. Windows Home does not include BitLocker.

**Fix:** The vault still works on Windows Home — your files are stored in a VHD with password protection, just without BitLocker encryption layer. The vault is still hidden when locked.

---

### ❓ Sentinel rules fire but nothing happens

**Cause:** The app may not have admin privileges, or the Windows Scheduled Task isn't registered.

**Fix:**
1. Make sure SolasCare Pro is running as Administrator
2. In Sentinel settings, click **Re-register Scheduled Task**
3. Check the Event Log tab — it shows errors if a heal action failed

---

### ❓ The app is slow or uses high CPU

**Cause:** Live hardware monitoring (Predictive Maintenance) polls system data every few seconds.

**Fix:**
1. Navigate away from the Predictive Maintenance page when not using it
2. In Settings, increase the monitoring interval (if available)
3. Check Task Manager — the Sentinel scheduled task may be running in the background

---

### ❓ Audit log is very large / taking up disk space

**Cause:** Default rotation is 30-day / 10MB. If you run many operations, this fills faster.

**Fix:** Go to **Settings** → **Backup & Data Maintenance** → **Clear Cache** → opens the logs folder so you can delete old files manually.

---

## Backing Up Your Data

### Method 1: PC Clone (Recommended — Full Backup)
Use **PC Clone → Export** to create an encrypted `.solasclone` file containing:
- Installed apps list (restorable via Winget on new PC)
- Wi-Fi profiles
- Workspace Automation profiles
- God Mode Tweaker history
- SolasCare settings

### Method 2: Export Settings (Settings Only)
Use **Settings → Export Settings Backup** to save a `solas_settings_backup.json` file.
This is lighter than PC Clone — just app configuration, no app lists.

### Method 3: Manual Backup
Copy `%APPDATA%\SolasCare\` to a safe location. This folder contains:
- `settings.json` — all app settings
- `logs/` — audit logs and app logs
- `*.jsonl` — feature stores (snapshots, sentinel rules, tweaker history, etc.)

---

## 📞 Support

- **GitHub Issues:** [github.com/SPTL-Solas/SolasCarePro/issues](https://github.com/SPTL-Solas/SolasCarePro/issues)
- **Audit Log:** All operations are logged to `%APPDATA%\SolasCare\logs\audit.jsonl` — attach this when reporting bugs
- **CONTRIBUTING.md:** For developers who want to contribute

---

*SolasCare Pro v5.0.1 — Last updated 2026-07-10*
