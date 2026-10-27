# Contributing to GTA5模组加载器

GTA5模组加载器 0.1.86-dev.1 is an actively developed, vehicle-focused GTA V Enhanced mod manager. Contributions are welcome in English or Chinese. Read the [current scope](gems/README.md) and [current status](docs/CORE_RELEASE_STATUS.md) before changing behavior.

## Set up and check a change

Use Windows x64 and Node.js 24:

```powershell
cd gems
npm ci
npm test
npm run build
```

Core tests use temporary files and synthetic fixtures; they do not require a game installation. After desktop changes, run `npm run test:ui` where the Electron runtime is permitted by Windows policy. This is a separate check from the core tests. Report a blocked or failed check as such, including the command and relevant error. Do not disable application-control policies to make a check pass.

The C# assistant is a separate experimental component. See its [build instructions](gems/native/game-assistant/BUILDING.md) before working on it; the default source workflow does not build or validate it in-game.

## Submit a useful issue or pull request

For a bug, include the version or commit, Windows and Node.js versions, exact steps, expected behavior and actual result. A minimal synthetic fixture is preferable to a real game or mod archive. Remove usernames, local paths, tokens and private content from logs before posting them.

For a pull request, describe the problem and resulting behavior, list the checks actually run, and identify remaining limitations. Add a focused regression test for changes to parsing, install/restore transactions, file ownership or security boundaries. Update the relevant scope document when support changes. Keep a fix separate from unrelated formatting or interface changes.

## Preserve these boundaries

- Import and inspection must not silently install a mod or execute package content.
- File writes need a validated plan, required user confirmations, conflict checks and recoverable records. Do not treat hashes or path checks as a complete operating-system lock or a guarantee against every race.
- Keep unsupported conversion, encrypted RPF editing, DLC registration and unverified assistant installation disabled. A new backend needs an explicit license review and evidence for its supported formats.
- Keep static analysis, fixture tests, desktop checks and in-game results distinct. Do not describe a successful parse or copy as game compatibility.
- Do not commit game assets, game keys, third-party mod packs, credentials, signing certificates, local databases, backups, downloaded dependencies or generated binaries. Preserve upstream license notices for any permitted third-party source.

Potentially exploitable bugs should follow [SECURITY.md](SECURITY.md).

## 中文简述

欢迎中文 issue 和 PR。请说明问题、修改后的行为与实际执行过的命令；未运行、失败或被系统策略阻止的检查应如实记录。涉及文件解析、安装、恢复或安全边界时，请提供可复现的最小夹具与回归测试。不要提交游戏文件、密钥、私人日志或第三方模组包，也不要把静态检查通过写成游戏内兼容已验证。
