# SolasCarePro — Upgrade & Improvement Roadmap

> Current state: ~85% production-ready (Grade A-).
> Strong security architecture; tests, signing, CI, docs, and product maturity have been significantly improved.
> This document tracks everything required to reach a certifiable, production-grade, trustworthy product.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done
Priority: **P0** = blocker · **P1** = production-grade · **P2** = quality/maturity

---

## PHASE 0 — Confirmed Bugs (fix first)

- [x] **AI diagnostics script parse error** — `scripts/ai_diagnostics.ps1`: `param()` block is placed AFTER a dot-source line and `$ErrorActionPreference`. In PowerShell `param()` must be the first executable statement. Move it to the top.
- [x] **`registry-backup` action not validated** — `electron/commandExecutor.js`: allowlist/validate the `action` param (`backup|list|restore`) like sibling commands; value-validate `toggle-startup-app`.
- [x] **Dedupe key ignores args** — `main.js` (`run-system-command` handler): dedupe key is built only from `commandKey`, so concurrent calls with different args collide. Include a hash of `args` in the dedupe key.
- [x] Verify the earlier fixes are still intact: `preload.js` forwards `options`; `NetworkMonitor.jsx` parses `detect-network` JSON; `RegistryManager.jsx` calls `['backup', label]`; `MaintenanceHub.jsx` awaits `junk-commit`.

---

## PHASE 1 — P0 Blockers (must-have before any release)

### 1. Automated Tests (highest priority)
- [x] Add Vitest for the renderer + a Node test suite for `electron/commandExecutor.js`.
- [x] Add `test` and `test:watch` scripts to `package.json`.
- [x] Tests must assert:
  - [x] Non-allowlisted command keys are rejected.
  - [x] `buildArgs` produce correct arguments (esp. `registry-backup`, `delete-files`, `registry-restore`).
  - [x] Injection-style args (quotes, `;`, path traversal, forbidden system paths) are escaped/rejected.
  - [x] Native handlers (`detect-network`) return correctly parsed status.
- [x] Add a Playwright-for-Electron smoke test: app launches and main window loads.

### 2. Global Crash Handlers
- [x] In `main.js` add `process.on('unhandledRejection')` and `process.on('uncaughtException')` that log to the existing log file and show a dialog instead of crashing silently.

### 3. Documentation (README / CHANGELOG / CONTRIBUTING are all EMPTY — 0 bytes)
- [x] **README.md**: what the app does, install/build steps, why admin rights are needed, the security/allowlist model, supported Windows versions, privacy note (nothing is uploaded).
- [x] **CHANGELOG.md**: seed with current version 4.2.2.
- [x] **CONTRIBUTING.md**: dev setup, lint/test/build commands, PR guidelines, signing process.

### 4. Code Signing
- [x] Add electron-builder `win` signing config placeholders (`certificateFile` / `certificateSubjectName` / `signingHashAlgorithms`).
- [x] Document the signing process in CONTRIBUTING. Do NOT commit any certificate.
- [x] Goal: eliminate SmartScreen "unknown publisher" warnings.

### 5. Legal / Safety
- [x] Add EULA / liability disclaimer ("use at your own risk") with first-run acceptance — the app edits registry, uninstalls drivers, shreds files.

---

## PHASE 2 — P1 Production-Grade

### 6. Lint & Format (config exists but isn't runnable)
- [x] Add `eslint` + `prettier` as pinned devDependencies.
- [x] Add `lint`, `lint:fix`, `format` scripts; fix all violations.
- [x] Add PSScriptAnalyzer for the 49 PowerShell scripts.

### 7. CI Pipeline
- [x] Add `.github/workflows/ci.yml`: install → lint → test → build on `windows-latest` for every push/PR/tag.

### 8. Auto-Update (or documented policy)
- [x] Integrate `electron-updater` with signed releases, OR add a clear "Update policy" section to README.

### 9. Unify Brand Identity
- [x] Align `name` (solas-care-pro), `productName` (SolasPCMaster), `appId` (com.solas.pcmaster), folder name, and UI title ("Solas System Care Pro") to ONE canonical name.

---

## PHASE 3 — Feature Consolidation (reduce overlap & fix organization)

### 10. Merge redundant "fix" entry points
- [x] Consolidate Dashboard, Smart Diagnostics, Smart Repair, and Maintenance Hub into ONE primary flow: scan → recommend → one-click fix. Keep individual tools for advanced users.

### 11. Fix navigation categories
- [x] Move Registry & Services out of "Security Tools" into "System".
- [x] Un-bury Network, Privacy, Startup, History, Large Files from inside "Power Features" — surface them as top-level or in logical categories.

### 12. Merge duplicate power/driver tools
- [x] Combine Core Parking + Fast Startup + Ultimate Performance + Advanced Power Tweaks into one "Performance Tuning" page.
- [x] Fold Driver Sweeper into the Drivers page as a tab.

### 13. Honest naming
- [x] Rebrand "AI Diagnostics" → "System Health Advisor" (it's a rule-based expert system, not AI — per the script's own comment).

---

## PHASE 4 — Trust & UX (turn the tool into a product)

### 14. Transparency
- [x] **Dry-run / preview mode** before destructive ops: show exactly what will be deleted/changed (file list, MB freed, keys touched) BEFORE running.
- [x] Add a short "what this does" description/tooltip to every action.
- [x] Fix language inconsistency in confirmation messages (English vs Hinglish) — pick one, or add proper localization.

### 15. Safety net
- [x] **Create a System Restore point before any destructive action** and surface it ("we made a restore point"). `lastRestorePointId` already exists in settings — make it visible and reliable.
- [x] Unified History/Undo timeline (currently buried under Power Features) - *Moved to top level sidebar*.

### 16. Onboarding & states
- [x] First-run "Scan my PC" welcome flow instead of a wall of 25+ tools.
- [x] Clear offline / PowerShell-blocked / winget-missing error states (no silent fails).
- [x] Re-evaluate the Win 7/8 "compatibility mode" claim — Removed banner, targeting modern Windows 10/11.

---

## PHASE 5 — New High-Value Features

- [x] **Bloatware / OEM junk remover** + startup impact measurement.
- [x] **Windows Defender quick-scan integration** (trigger + show results).
- [x] **Autopilot transparency**: show scheduled-task status / last-run on the dashboard.
- [x] **Opt-in, local-first usage analytics** to inform consolidation decisions.
- [x] **Opt-in crash telemetry** (privacy-respecting) so failures are visible.

---

## PHASE 6 — Reliability & Lifecycle

- [x] **Don't blind-kill long destructive ops** (DISM/SFC) on quit — warn "unsafe to cancel, let it finish".
- [x] **Log/audit retention policy** — `audit.jsonl` and daily logs grow unbounded; add rotation (e.g. 30 days / 10 MB cap).
- [x] **Uninstall cleanup** — NSIS uninstaller should remove the `HKCU\...\Run` key, scheduled task, and `%APPDATA%\SolasCare`.
- [x] **Settings schema versioning** — add a `schemaVersion` field for future migrations.
- [x] **Pause background metrics polling when window is hidden** (battery/CPU savings).

---

## PHASE 7 — Quality / Maintainability (P2)

- [x] Refactor God files: `DriverManager.jsx` (~1605 lines), `SmartRepair.jsx` (~1046), `commandExecutor.js` (~1565) into smaller domain modules.
- [x] Extract shared command-invocation + result-rendering patterns into reusable hooks/components.
- [x] Accessibility pass: aria-labels on all icon buttons, keyboard nav, focus trap in modals, `aria-live` on streaming terminal output (currently only ONE aria-label in the whole app).
- [x] Verify light theme is complete across all 32 components.
- [x] Responsive/min-size handling for 1366×768 laptops + DPI/multi-monitor.
- [x] Notification batching / quiet option.
- [x] (Optional, larger) Migrate the IPC boundary to TypeScript for type-safe command contracts.

---

## Suggested Order of Execution

1. Phase 0 (bugs) → 2. Tests + crash handlers (P0) → 3. Docs + signing + EULA (P0)
4. Lint/CI (P1) → 5. Restore-point safety + dry-run (trust) → 6. Feature consolidation
7. Reliability/lifecycle → 8. New features → 9. Refactor + a11y (P2)

## Constraints (do not break)
- Preserve existing security hardening: `contextIsolation`, `sandbox`, CSP, allowlist, `spawn` arg-arrays, no `shell:true`.
- After each item: run `npm run build` + tests and report results.
- Pin dependency versions. Never commit secrets or certificates.
- Ask before any destructive or irreversible action.
