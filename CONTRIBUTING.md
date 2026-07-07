# Contributing to SolasCarePro

Thank you for your interest in contributing to **Solas Care Pro** — a professional-grade Windows system repair and driver management suite built on Electron + React + PowerShell.

This document describes the conventions, workflow, and quality bars for contributions.

---

## Repository

- **GitHub**: https://github.com/ashwanisingh2/SolasCarePro
- **Stack**: React 18 + Vite, Electron 29, Tailwind CSS, Framer Motion, Lucide React, Recharts, PowerShell 5.1+/7.x
- **License**: See `LICENSE` (or default to MIT if absent)
- **Maintainer**: Ashwani Singh

---

## Development Setup

### Prerequisites
- **Windows 10 build 17763 (1809) or later** (or Windows 11)
  - The app runs on Win 7/8 in compatibility mode, but development requires Win 10+ for full WMI/WUA/SetupAPI coverage.
- **Node.js** v18.0.0 or higher
- **PowerShell** v3.0 or higher (PowerShell 7 recommended for development — used for Pester test runs)
- **Administrator privileges** — required to execute system repairs, scheduled tasks, and device actions

### Install & Run in Dev Mode
```bash
# 1. Clone
git clone https://github.com/ashwanisingh2/SolasCarePro.git
cd SolasCarePro

# 2. Install dependencies
npm install

# 3. Start Vite dev server (terminal 1)
npm run dev

# 4. Start Electron host (terminal 2)
npm run electron:dev
```

Vite serves the React frontend at `http://localhost:5173`, and Electron loads it via `VITE_DEV_SERVER_URL`. Hot reload is supported.

### Build a Portable .exe
```bash
npm run build
```
The compiled executable is emitted to `dist-electron/SolasSystemCarePro.exe` via `electron-builder`.

---

## Commit Message Convention

This project follows **Conventional Commits**. All commits MUST use one of these prefixes:

| Prefix | Use For |
| :--- | :--- |
| `feat:` | A new feature (user-visible) |
| `fix:` | A bug fix (user-visible) |
| `docs:` | Documentation only (README, CHANGELOG, comments) |
| `refactor:` | Code restructuring without behavior change |
| `chore:` | Tooling, dependencies, build config |
| `test:` | Adding or updating tests |
| `perf:` | Performance improvement |
| `style:` | Code style (formatting, no logic change) |
| `ci:` | CI/CD pipeline changes |

### Examples
```
feat: add CPU stress test to HardwareDiagnostics
fix: correct JSON extraction for nested objects in DriverManager
docs: update CHANGELOG for v3.1.0
refactor: extract balanced-brace JSON parser to shared helper
chore: bump electron-builder to 24.13.3
test: add Pester tests for disk_cleanup.ps1
```

### Rules
- Subject line ≤ 72 characters, imperative mood (`add` not `added`)
- Body wraps at 80 characters, explains **why** (not what)
- Footer for breaking changes: `BREAKING CHANGE: <description>`
- One logical change per commit — don't mix a feature with a refactor

---

## Branch Naming

| Pattern | Use For |
| :--- | :--- |
| `feature/<short-name>` | New features (e.g. `feature/cpu-stress-test`) |
| `fix/<short-name>` | Bug fixes (e.g. `fix/json-extraction-regex`) |
| `chore/<short-name>` | Tooling/deps (e.g. `chore/bump-electron-builder`) |
| `docs/<short-name>` | Documentation (e.g. `docs/changelog-3.1`) |
| `refactor/<short-name>` | Refactors (e.g. `refactor/extract-json-helper`) |
| `test/<short-name>` | Tests (e.g. `test/pester-driver-backup`) |

### Rules
- Branch off `main`
- One branch per logical change
- Keep branches short-lived (< 1 week)
- Delete branch after merge

---

## Pull Request Checklist

Before opening a PR, verify each item:

- [ ] **Tested on Windows 10 or 11** with administrator privileges
- [ ] **`npm run vite:build` succeeds** with no warnings new to this PR
- [ ] **PowerShell scripts parse OK** — run `pwsh -NoProfile -File scripts/check_ps_syntax.ps1` (or `pwsh -c "[System.Management.Automation.Language.Parser]::ParseFile('<file>', [ref]$null, [ref]$null)"`)
- [ ] **CHANGELOG.md updated** — add entry under `## [Unreleased]` (or bump version per SemVer)
- [ ] **No third-party dependencies added** — SolasCarePro uses ONLY:
  - Windows native APIs (WMI, CIM, SetupAPI, CfgMgr32, Win32 API)
  - Microsoft technologies (PowerShell, DISM, PnPUtil, Windows Update Agent COM)
  - OEM-supported sources (driver INFs from manufacturer)
  - ❌ NO Driver Booster, Driver Easy, SDI, or any 3rd-party driver databases
  - ❌ NO website scraping
  - ❌ NO unofficial driver sources
- [ ] **No mock/placeholder/demo data** in production paths — every UI element must call a real backend script (mock fallbacks are allowed in `else { ... }` branches for browser dev mode only)
- [ ] **IPC calls have input validation** — all `runSystemCommand` args go through `buildArgs` whitelists in `electron/commandExecutor.js`
- [ ] **Audit logging added** for any new destructive operation (call `Write-AuditLog` from `_common.ps1`)
- [ ] **Restore point created** before any risky operation (call `New-SolasRestorePoint` from `_common.ps1`)
- [ ] **Commit messages follow Conventional Commits** (see above)
- [ ] **Branch is up-to-date with `main`** — rebase before opening PR
- [ ] **No `console.log`** in committed code (use `console.warn` for warnings, `console.error` for errors)
- [ ] **No `// TODO` or `// FIXME`** in committed code — open an issue instead

---

## Code Style

### React Components
- **Functional components only** — no class components
- **Hooks for state/effects** — `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`
- **One component per file** — file name matches default export name (`DriverManager.jsx` exports `DriverManager`)
- **Props destructuring at top** — `function MyComp({ foo, bar, onAction }) {`
- **Tailwind classes only** — no inline `style={{}}` except for dynamic values (e.g. `style={{ color: severity === 'critical' ? '#F87171' : '#FBBF24' }}`)
- **Lucide React for icons** — no SVG inline unless absolutely necessary
- **Framer Motion for transitions** — `motion.div` with `initial`/`animate`/`exit` on tab content

### IPC Bridge Pattern
```jsx
// Every IPC call MUST have a mock fallback for browser dev mode:
const handleScan = async () => {
  setBusy(true);
  try {
    if (window.api) {
      const res = await window.api.runSystemCommand('scan-drivers');
      if (res.success && res.stdout) {
        const list = JSON.parse(res.stdout.trim());
        setDrivers(list);
      }
    } else {
      // Mock fallback for browser preview
      await new Promise(r => setTimeout(r, 800));
      setDrivers([{ DeviceName: 'Mock Device', /* ... */ }]);
    }
  } catch (e) {
    addNotification('Scan', 'Failed: ' + e.message, 'error');
  } finally {
    setBusy(false);
  }
};
```

### PowerShell Scripts
- **First line: comment with file name** — `# my_script.ps1`
- **Second line: brief purpose** — `# What this script does`
- **`param()` block at the very top** (before any dot-source) — PowerShell 7 parser rejects `param()` after code
- **Dot-source `_common.ps1` immediately after `param()`**:
  ```powershell
  param(
      [ValidateSet('a','b')][string]$Action = 'a'
  )
  . (Join-Path $PSScriptRoot '_common.ps1')
  $ErrorActionPreference = 'Stop'
  ```
- **Validate all path inputs** — reject `..` traversal, shell metacharacters `<>"|`, and limit length
- **Validate all enum inputs** with `[ValidateSet(...)]`
- **Output JSON via `ConvertTo-Json -Compress -Depth N`** — never pretty-print to stdout (breaks the IPC parser)
- **Empty arrays must emit `[]`** — PS 5.1 emits nothing on empty array via ConvertTo-Json; use `ConvertTo-JsonArray` helper from `_common.ps1`
- **Log every destructive operation** via `Write-AuditLog -Action '...' -Result '...' -Target '...' -Details '...'`
- **Create restore point** via `New-SolasRestorePoint -Description '...'` before any install/uninstall/rollback/registry edit

### Electron Main Process (`electron/commandExecutor.js`)
- **Every command key MUST have a `buildArgs` validator** — reject invalid input before spawning PowerShell
- **Path validation regex**: `/[<>|"`]/` (reject) and `path.includes('..')` (reject)
- **PnP device ID validation**: `/^[A-Za-z0-9\\&_.\-{}]+$/`
- **Confirmation required** for any operation that changes system state: `confirmationRequired: true, confirmationMessage: '...'`
- **Stream channel** for long-running ops: `streamChannel: 'care-out'` or `'winget-out'`
- **Timeout** for every command — never allow infinite runs

---

## Testing

### PowerShell Scripts (Pester)
Tests live in `scripts/tests/SolasCarePro.Tests.ps1`. Run all unit tests:

```bash
Invoke-Pester -Path ./scripts/tests/ -Tag Unit -Output Detailed
```

Install Pester (one-time):
```bash
Install-Module Pester -Force -SkipPublisherCheck
```

### Frontend (Vite Build)
```bash
npm run vite:build
```
A successful build is the minimum smoke test. If you add new components, verify they appear in `dist/assets/`.

### Manual Smoke Test
After any change that touches:
- **Driver Manager** — test all 9 tabs end-to-end on a real Windows machine
- **Smart Repair** — run each of the 7 recipes and verify progress streaming
- **IPC layer** — verify `commandExecutor.js` syntax: `node -c electron/commandExecutor.js`
- **PowerShell scripts** — verify parse: `pwsh -NoProfile -File scripts/check_ps_syntax.ps1`

---

## CHANGELOG

Update `CHANGELOG.md` for every PR. Format follows [Keep a Changelog](https://keepachangelog.com/):

```markdown
## [Unreleased]

### Added
- New feature X

### Fixed
- Bug Y

### Changed
- Refactored Z

### Removed
- Deleted W
```

When you cut a release, change `## [Unreleased]` to `## [3.2.0] - YYYY-MM-DD` and add a new empty `## [Unreleased]` section on top.

Bump `package.json` version to match.

---

## Issue & PR Etiquette

- **Search existing issues** before opening a new one
- **One issue = one problem** — don't bundle multiple bugs
- **Repro steps required** for bug reports — include Windows version, app version (from Settings → About), and the audit log entry from `%APPDATA%\SolasCare\logs\audit.jsonl`
- **Screenshots welcome** for UI bugs
- **Be patient and kind** — this is a solo-maintained project

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT or as specified in `LICENSE`).

---

*Generated for SolasCarePro | github.com/ashwanisingh2/SolasCarePro*
