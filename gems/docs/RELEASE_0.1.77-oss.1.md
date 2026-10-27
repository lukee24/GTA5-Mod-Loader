# 0.1.77-oss.1 — source preview candidate

Prepared on 2026-10-26 from the existing local 0.1.76 development source. This file records a candidate; the GitHub release publication time, if published, is authoritative.

This preview exposes the existing Electron/TypeScript project and its temporary-file regression suite. It adds an explicit source-only publication boundary so private runtime logs, games/MODs, SDK binaries and old local build artifacts cannot enter the source ZIP. Manifest tests use synthetic non-runnable PE headers instead of depending on an unpublished helper DLL. The optional C# assistant remains source-only with documented upstream download and hash checks.

The transitive undici dependency is updated from 7.30.0 to 7.30.1 within the existing compatible range. Public Chinese/English guidance, source CI, contribution/security guidance, dependency notices, feature status and a real empty-workspace screenshot are included.

Validation: 795 core checks passed, actual Electron UI regression passed, TypeScript/renderer/main/preload build passed. The source artifact has separate CRC/SHA verification. See [OSS_VERIFICATION.md](OSS_VERIFICATION.md) for environment, evidence and limits.

Distribution: source ZIP and verification/checksum files only. No installer, portable executable, GTA content, third-party MOD or bundled native runtime. Legacy-to-Enhanced conversion, encrypted RPF support and DLC registration remain unavailable; this release does not establish in-game compatibility.
