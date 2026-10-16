# Windows Security, SmartScreen & Defender Whitelist Governance

This document specifies the mandatory Windows security policies, antivirus exclusions, zone identifier handling, and non-privileged UAC elevation architecture implemented in `setup-windows.ps1` for `@francogp/auditor`.

---

## 1. Architectural Scope & Problem Statement

Windows environments enforce strict security barriers that can impede the execution of high-performance native binaries distributed via npm packages (such as Rust binaries in `node_modules/@fallow-cli/win32-x64-msvc/fallow-similar-code.exe`):

1. **Mark-of-the-Web (Zone.Identifier)**: Downloads via npm or Git may carry NTFS alternate data streams tagging binaries as untrusted internet assets, triggering Windows SmartScreen execution blocks.
2. **Windows Defender Real-Time Scanning Latency**: Real-time heuristics scanning native binaries on every subprocess spawn can add 500ms to 2s of overhead per invocation.
3. **UAC Elevation Constraints**: Running developer scripts in un-elevated PowerShell sessions must not crash or abort setup when administrative privileges are required for system-wide exclusions or winget package installations.

---

## 2. Canonical Initialization Pipeline (`setup-windows.ps1`)

The canonical `setup-windows.ps1` script systematically executes five security and operational steps:

### 2.1. Pre-Creation of Fallow Cache Subdirectories

To eliminate Windows Rust runtime crashes (`os error 3` when opening cache files whose parent directory does not exist):

- Pre-creates `%LOCALAPPDATA%\fallow\similar-code\models`.
- Pre-creates `%LOCALAPPDATA%\fallow\similar-code\vectors`.

### 2.2. Web Zone Mark Removal (`Unblock-File`)

Removes the `Zone.Identifier` alternate data stream from native executables, shared libraries, and Node.js addons:

```powershell
Get-ChildItem -Path "node_modules/@fallow-cli", "node_modules/fallow" -Recurse -Include *.exe, *.dll, *.node -ErrorAction SilentlyContinue |
    Unblock-File
```

### 2.3. Windows Defender Antivirus Process & Path Exclusions

Registers process and directory exclusions to immunize native binaries against heuristic file locking and scanning latency:

```powershell
Add-MpPreference -ExclusionProcess "fallow.exe", "fallow-similar-code.exe" -ErrorAction SilentlyContinue
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\fallow" -ErrorAction SilentlyContinue
```

### 2.4. Non-Privileged Session UAC Elevation Handling

Non-privileged PowerShell sessions request elevation non-blockingly:

- Checks `([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`.
- If un-elevated, prompts to launch an elevated child process via `Start-Process powershell.exe -Verb RunAs`.
- If elevation is declined or unavailable, execution continues gracefully without throwing a fatal error, while outputting clear manual setup instructions.

### 2.5. Process-Scoped Path Precedence & NVM Isolation

When configuring Node.js runtimes:

- Prepend `$targetNodeDir` to the process-scoped environment path `$env:Path` **before** the shared NTFS junction (`C:\Program Files\nodejs`).
- This guarantees that the executing terminal session remains strictly bound to the version specified in `.node-version` (or `.nvmrc`), completely isolated from concurrent operating system processes or global symlink alterations.
