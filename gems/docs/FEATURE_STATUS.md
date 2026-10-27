# 功能状态 / Feature status

> 历史快照：下表描述上一轮 0.1.77-oss.1。当前 0.1.78-dev.1 的约定范围、实现和验证状态以 [ACCEPTANCE_MATRIX.md](ACCEPTANCE_MATRIX.md) 为准。本表的“已验证”不能视为当前版本或游戏内验证通过。

本表针对 0.1.77-oss.1 公开工作副本。795 项核心测试和真实 Electron 桌面回归已通过，范围与限制记录在 [OSS_VERIFICATION.md](OSS_VERIFICATION.md)。测试文件存在不代表本次已通过；历史报告中的通过数量不作为本次发布证据。构建、离线夹具、桌面界面与真实游戏兼容性须分别验证。

This matrix covers the 0.1.77-oss.1 public working copy. All 795 core checks and the actual Electron desktop regression passed; scope and limits are recorded in [OSS_VERIFICATION.md](OSS_VERIFICATION.md). Test sources and historical reports do not establish a current pass. Build, fixture, desktop and in-game results are separate evidence.

状态只使用以下五类 / Allowed statuses:

- **已验证可用 / Verified usable** — 本次记录的检查已通过，仅限注明范围 / Passed the recorded current checks, within their stated scope.
- **有实现但尚未验证 / Implemented, unverified** — 已确认业务代码，本次结果待记录 / Implementation inspected; current results pending.
- **部分实现 / Partially implemented** — 已有部分能力，其余明确缺失 / Some capabilities exist; stated gaps remain.
- **只有界面 / UI only** — 有界面但没有对应执行后端 / Interface without an execution backend.
- **尚未实现 / Not implemented** — 没有可用实现 / No usable implementation.

| 功能 / Feature | 状态 / Status | 实际范围与限制 / Scope and limits | 源码与测试 / Evidence |
| --- | --- | --- | --- |
| 导入 / Import | 已验证可用 / Verified usable (fixtures) | ZIP、文件夹、单文件及有限 OIV；保留原包并核对 SHA/CRC。RAR/7Z 须先解压。 / ZIP, folders, files and limited OIV; retained originals and SHA/CRC checks. Extract RAR/7Z externally first. | [scanner](../packages/scanner/index.ts), [archive tests](../tests/archive-entry.test.ts), [core tests](../tests/core.test.ts) |
| 资源识别 / Resource identification | 部分实现 / Partially implemented | 文件类型、目录、有限 XML 与部分 RSC7 版本头；不证明模型结构或 Enhanced 可加载。 / File/path/XML classification and selected RSC7 headers; no model or game compatibility proof. | [scanner](../packages/scanner/index.ts), [resource analysis](../packages/converter/index.ts), [RPF tests](../packages/rpf-engine/rpf.test.ts) |
| 安装与冲突预览 / Install and conflict preview | 已验证可用 / Verified usable (fixtures) | 明确文件映射、受限目标、覆盖确认、备份与事务检查点；OIV 仅有限顶层 add。 / Explicit mappings, restricted targets, overwrite approval, backups and checkpoints; limited top-level OIV add only. | [installer](../packages/installer/index.ts), [install input tests](../tests/install-input.test.ts), [OIV tests](../tests/oiv-plan.test.ts) |
| 停用、重新启用与卸载 / Disable, re-enable and uninstall | 已验证可用 / Verified usable (fixtures) | 按事务恢复，检查文件归属和外部修改；保留备份。 / Transaction-based restoration checks ownership and external changes; backups remain. | [installer](../packages/installer/index.ts), [lifecycle tests](../tests/lifecycle.test.ts) |
| 备份与环境快照 / Backup and mod-environment snapshots | 已验证可用 / Verified usable (fixtures) | 内容寻址备份；快照含 mods、scripts、根目录 ASI/INI/DLL，不是整个游戏或同时刻原子快照。 / Content-addressed backups of mods, scripts and root ASI/INI/DLL files; not a full-game or atomic multi-file snapshot. | [backup](../packages/backup/index.ts), [snapshot entry point](../desktop/main.ts), [backup tests](../tests/backup.test.ts), [snapshot tests](../tests/snapshot-plan.test.ts) |
| 恢复与中断处理 / Restore and interrupted operations | 已验证可用 / Verified usable (fixtures) | 暂存校验、提交守卫、逆向恢复、待处理记录；子进程中断夹具不能代表硬件断电。 / Staging checks, commit guards, reverse recovery and pending records; process-interruption fixtures are not power-loss validation. | [installer](../packages/installer/index.ts), [restore tests](../tests/restore-stage.test.ts), [process tests](../tests/process-recovery.test.ts) |
| 环境与日志诊断 / Environment and log diagnostics | 已验证可用 / Verified usable (fixtures) | 文件头、Steam 记录、进程与日志线索；不确认因果、NVE/LWE 安装或组件兼容。 / Headers, Steam records, process state and log clues; no causal diagnosis or NVE/LWE/component compatibility certification. | [diagnostics](../packages/diagnostics/index.ts), [evidence tests](../tests/diagnostics-evidence.test.ts), [log tests](../tests/diagnostic-log-snapshot.test.ts) |
| RPF 浏览与提取 / RPF browsing and extraction | 已验证可用 / Verified usable (fixtures) | 有界未加密 RPF7、嵌套归档及资源封装；不支持解密或模型预览。 / Bounded unencrypted RPF7, nested archives and resource envelopes; no decryption or model preview. | [RPF engine](../packages/rpf-engine/index.ts), [RPF tests](../packages/rpf-engine/rpf.test.ts), [snapshot tests](../tests/rpf-file-snapshot.test.ts) |
| RPF 独立副本重建 / RPF independent-copy rebuild | 已验证可用 / Verified usable (fixtures) | 库 API 支持有限二进制条目替换并回读；未接入桌面写入，不写游戏归档或资源结构。 / Library API rebuilds a separate archive with binary replacements and readback; no desktop write action, game-archive writes or resource-structure edits. | [replaceBinaryEntries](../packages/rpf-engine/index.ts), [payload tests](../tests/rpf-payload-validation.test.ts) |
| handling 参数副本 / Handling parameter copies | 已验证可用 / Verified usable (fixtures) | 编辑受支持 XML 字段并输出独立副本及变更记录；不自动应用到游戏。 / Edit supported XML fields into independent copies with change records; no automatic game installation. | [handling](../packages/vehicles/handling.ts), [copy writer](../packages/vehicles/handling-copy.ts), [write tests](../tests/handling-write.test.ts) |
| Legacy → Enhanced 转换 / Conversion | 尚未实现 / Not implemented | 只有资源头、封装、页大小检测；转换入口明确拒绝，无转换后端或转换结果验收。 / Header, envelope and page-size analysis only; conversion explicitly rejects requests, with no backend or converted-output validation. | [capabilities and rejected conversion](../packages/converter/index.ts) |
| DLC 自动注册、加密 RPF 与模型渲染 / DLC registration, encrypted RPF and model rendering | 尚未实现 / Not implemented | 对应执行能力未提供，界面的限制说明不是实现。 / Execution is unavailable; explanatory interface elements are not implementation. | [scanner blockers](../packages/scanner/index.ts), [RPF capabilities](../packages/rpf-engine/index.ts) |
| 游戏助手 / In-game assistant | 部分实现 / Partially implemented | 实验性 C# 源码和桌面展示存在；桌面安装禁用，当前公开副本未验证原生构建与 Enhanced 游戏效果。 / Experimental C# source and desktop presentation exist; installation is disabled, with no current native-build or Enhanced gameplay verification. | [capabilities](../native/game-assistant/capabilities.json), [desktop interface](../desktop/renderer/src.tsx) |

没有任何条目因显示页面或导航入口而升级为可用功能；本表无需强行使用全部五类状态。 / A visible page or navigation item does not establish a working feature; not every allowed status needs to appear in the matrix.

游戏目录互斥仅在同一进程内生效；跨进程、多个数据库管理同一游戏目录、真实大文件压力与游戏加载仍有未验证边界。参见 [游戏目录互斥](GAME_DIRECTORY_EXCLUSION.md)。本版本不依赖 OpenIV，也不分发游戏资源、转换密钥或商业模组。

Game-directory exclusion is in-process only. Cross-process coordination, persistent ownership across databases, large real-world workloads and game loading remain outside current verification. See [game-directory exclusion](GAME_DIRECTORY_EXCLUSION.md). This version does not depend on OpenIV or distribute game resources, conversion keys or commercial mods.

