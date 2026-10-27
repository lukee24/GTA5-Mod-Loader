# Security policy

GTA5模组加载器 handles untrusted archives and can modify files in a user-selected game directory. The current development version is intended for development and review. There is no supported production release or guaranteed security-response timeframe.

## Report a vulnerability

If this repository offers **Security → Report a vulnerability**, use that private reporting channel. Include the affected commit, a concise impact description, reproduction steps and a minimal synthetic fixture. Do not attach game data, paid mod content, credentials or personal backups.

If private reporting is unavailable, open an issue requesting a private contact channel without including exploit details or sensitive files. General non-sensitive bug reports can use the normal issue tracker. A reporting endpoint or response deadline is not promised until maintainers configure one.

## Scope and limits

Reports are especially useful for archive path traversal or resource exhaustion, renderer/IPC boundary failures, unexpected package execution, incorrect install targets, backup corruption, data loss during restore, and credential exposure in source or release tooling.

Path, identity, size and hash checks reject changes they observe. They do not provide native cross-process locking, a fully atomic transaction across all files and SQLite, or a guarantee against every race or power failure. Backups and interrupted transactions need to remain available for diagnosis and recovery.

Package scanning does not establish that a mod is safe to execute or compatible with the game. Unencrypted RPF parsing does not validate a complete model graph or game behavior. Keep the current unsupported features disabled until their implementation, licensing and validation are established.

Historical unsigned desktop binaries were blocked by Windows application-control policy on the original development machine. Do not disable or bypass those controls. The current publication contains source; it makes no claim that a signed, accepted end-user binary is available.

## 中文简述

潜在漏洞请优先通过仓库的私密漏洞报告入口提交；如果入口尚未启用，请先公开请求私密联系方式，不要公开利用细节。报告应使用最小合成夹具，移除个人路径、凭据、游戏资源与付费模组内容。本项目仍处于源码预览阶段，没有承诺生产支持或固定响应时限。文件哈希、路径检查和备份不能保证消除全部并发、断电或数据丢失风险。
