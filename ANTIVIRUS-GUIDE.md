# 🛡️ SolasCare Pro — Antivirus Exclusion Guide

SolasCare Pro is a **system-level tool** that uses PowerShell, registry edits, VHD mounting, and
HOSTS file modification — all legitimate Windows administration operations. Some antivirus programs
flag these as suspicious because they look like malware behavior patterns.

**This is a false positive.** SolasCare Pro is 100% local, open-source, and does not connect to
any external server except the GitHub Releases API for update checks.

Adding an exclusion removes this friction and prevents performance degradation.

---

## 📂 Folders to Exclude

Add both of these paths to your antivirus exclusion list:

| Folder | Purpose |
|--------|---------|
| `C:\Program Files\SolasCare Pro\` | App installation directory (scripts, binaries) |
| `%APPDATA%\SolasCare\` | App data (logs, settings, vault metadata) |

> **Tip:** `%APPDATA%` expands to `C:\Users\<YourUsername>\AppData\Roaming\` on most systems.

---

## 🪟 Windows Defender (Built-in)

1. Open **Windows Security** (search in Start menu, or press `Win + I` → Privacy & Security → Windows Security)
2. Click **Virus & threat protection**
3. Scroll to **Virus & threat protection settings** → click **Manage settings**
4. Scroll to **Exclusions** → click **Add or remove exclusions**
5. Click **+ Add an exclusion** → choose **Folder**
6. Add: `C:\Program Files\SolasCare Pro\`
7. Repeat step 6 for: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`

✅ Done — Defender will no longer scan these folders.

---

## 🔵 Avast / AVG

1. Open **Avast** or **AVG** → click the ☰ menu (top right) → **Settings**
2. Go to **General** → **Exceptions** (Avast) or **Exceptions** (AVG)
3. Click **Add Exception**
4. In the path field, type: `C:\Program Files\SolasCare Pro\`
5. Click **Add Exception** again and add: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`
6. Click **OK**

---

## 🟡 Malwarebytes

1. Open **Malwarebytes** → click **Settings** (gear icon, top right)
2. Go to the **Security** tab
3. Scroll to **Exclusions** → click **Add Exclusion**
4. Choose **Exclude a Folder**
5. Browse to: `C:\Program Files\SolasCare Pro\` → click **OK**
6. Repeat for: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`

---

## 🔴 Bitdefender

1. Open **Bitdefender** → click **Protection** in the left sidebar
2. Under **Antivirus**, click **Settings**
3. Go to the **Exclusions** tab
4. Click **+ Add** under "List of Files and Folders Excluded from Scanning"
5. Browse to: `C:\Program Files\SolasCare Pro\` → click **OK**
6. Repeat for: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`

---

## 🟠 Norton

1. Open **Norton** → click **Settings** (gear icon)
2. Go to **Antivirus** → **Scans and Risks**
3. Scroll to **Exclusions / Low Risks** → click **Configure** next to "Items to Exclude from Scans"
4. Click **Add** → **Add Folder**
5. Add: `C:\Program Files\SolasCare Pro\`
6. Repeat for: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`

---

## 🟢 ESET NOD32 / ESET Internet Security

1. Open **ESET** → press `F5` to open Advanced Setup
2. Go to **Detection Engine** → **Exclusions**
3. Click **Add** under "Performance Exclusions"
4. Type the path: `C:\Program Files\SolasCare Pro\`
5. Repeat for: `C:\Users\<YourUsername>\AppData\Roaming\SolasCare\`
6. Click **OK** to save

---

## ❓ Why Does This Happen?

SolasCare Pro triggers AV heuristics because it legitimately does things that malware also does:

| SolasCare Operation | Why AV Flags It | Reality |
|---------------------|-----------------|---------|
| `powershell -ExecutionPolicy Bypass` | Bypassing execution policy is a common malware technique | Required for system scripts to run without requiring users to change global PS settings |
| Registry key writes | Spyware and adware often write registry keys | SolasCare writes only clearly documented tweaks (God Mode Tweaker) with 1-click Undo |
| HOSTS file modification | Browser hijackers edit HOSTS to redirect traffic | SolasCare adds ad/telemetry domain blocks (Privacy Blackhole) — opposite of hijacking |
| VHD mount/unmount | Ransomware sometimes uses VHDs to exfiltrate data | Solas Vault *protects* your files by locking them in an encrypted VHD |
| Creating scheduled tasks | Malware uses Task Scheduler for persistence | Solas Sentinel uses it for background healing and monitoring |
| `sfc /scannow` + DISM | Rarely flagged, but system binary modification triggers some heuristics | These are built-in Windows repair tools being invoked — not modified |

---

## 🔍 How to Verify SolasCare is Safe

- **Source code:** The entire codebase is available on GitHub for inspection.
- **No outbound connections:** SolasCare Pro makes zero outbound network calls except the optional GitHub update check (`api.github.com`).
- **Audit log:** Every operation is logged to `%APPDATA%\SolasCare\logs\audit.jsonl` — you can inspect exactly what ran.
- **VirusTotal:** Drag the installer `.exe` to [virustotal.com](https://www.virustotal.com) — most detections will be AV-specific heuristics, not signature matches.

---

## 💬 Still Having Issues?

If after adding exclusions you're still experiencing problems:
1. Temporarily **disable real-time protection** and test
2. Check `%APPDATA%\SolasCare\logs\` for error messages
3. Open a GitHub Issue with the log output

---

*Last updated: 2026-07-10 | SolasCare Pro v5.0.1*
