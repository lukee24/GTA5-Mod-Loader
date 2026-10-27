# GTA5模组加载器开发与使用

GTA5模组加载器是以车辆为主的 GTA5 Enhanced 模组管理工具，当前为 **0.1.86-dev.1** 开发版。桌面使用 Electron、React 和 TypeScript，本地数据存储使用 SQLite。现有程序界面、文件名和源码内部名称仍沿用旧名 GEMS。项目介绍见[仓库首页](../README.md)。

## 目前能做什么

| 功能 | 范围 |
| --- | --- |
| 导入与扫描 | ZIP、RAR/7Z、文件夹和单个资源，查看文件、车型信息及安装计划 |
| 车辆管理 | 分类、检索、收藏和安装状态 |
| 安装管理 | 受支持文件的安装、启用、停用、更新和卸载；写入前备份，按记录恢复，遇到外部修改会提示 |
| 诊断与启动 | 检查目录和依赖，记录错误，向 Steam 请求启动 Enhanced |
| 文件工具 | 受限的未加密 RPF7 浏览与独立副本导出、handling XML 副本编辑、配置方案 |

这些软件流程已有测试记录。导入、安装和备份恢复的操作步骤见[使用说明](docs/CORE_QUICK_START.md)。文件识别和安装状态不等于游戏兼容，先看包作者的要求，再检查实际写入计划。

游戏助手仍在实验阶段，不会随桌面软件自动安装。旧版在 Enhanced 1.0.1158.16 故事模式中测试过 F5 中文菜单、原版 Adder 生成、收藏和车门；修复请求执行后读回车辆生命和引擎1000/1000，未验证受损车辆的恢复。新版速度设置已修复，但复测遇到 SHVDNE 日志占用和 `ERR_GFX_STATE` 图形错误，速度修复、驾驶和完整移除后的游戏复测尚未完成。具体结果见[当前状态](../docs/CORE_RELEASE_STATUS.md)和[助手说明](docs/GAME_ASSISTANT.md)。

新增 Add-On 车辆 DLC 注册、Legacy 转换和加密 RPF 修改不支持。高级人物、服装、摄影等留待后续维护。

## 构建与运行

需要 Windows x64 和 Node.js 24，在本目录执行：

```powershell
npm ci
npm run build
npm start
```

常用开发命令：

```powershell
npm test                      # 软件和文件操作测试，无需游戏
npm run test:ui                # 可选桌面测试，使用临时样本
npm run source                # 生成源码 ZIP
node scripts/verify-source.mjs # 检查源码归档
```

若设置过 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`，需要清除该变量，再运行 `node node_modules/electron/install.js` 才能启动桌面。原生 C# 助手单独构建，见[原生构建说明](native/game-assistant/BUILDING.md)。

RAR/7Z 使用固定版本的 7-Zip 后端，准备方式见[压缩包后端](docs/ARCHIVE_BACKEND.md)。后端准备完成后，`npm run dist` 生成未签名的 Windows 安装器和便携包。源码不带游戏资产、第三方模组或运行二进制。[Windows CI](../.github/workflows/gems-windows.yml) 保留了依赖安装、测试、构建和源码检查流程。

## 使用和数据

首次使用在“设置”选择 Enhanced 游戏目录。导入后先查看扫描报告和安装计划，再确认写入；错误目录、游戏运行中或未完成的恢复操作会阻止安装。工具不运行模组包里的安装程序。

停用和卸载只恢复工具记录的改动。用户在外部修改过的文件需要单独处理，不会通过清空模组目录恢复。环境快照只覆盖记录中的文件，不能当作整个游戏的时间点还原。

默认数据在 `%APPDATA%/GEMS/Studio/`，可从设置打开。数据库、导入副本、备份和日志留在本机；卸载桌面应用不会自动删除这些数据。不要手动删掉仍被安装记录引用的备份。

## 文档

- [核心使用说明](docs/CORE_QUICK_START.md) · [当前范围](../docs/CORE_DELIVERY_SCOPE.md) · [本版测试记录](../docs/DEVELOPMENT_ACCEPTANCE_0.1.86.md)
- [完整功能清单](docs/ACCEPTANCE_MATRIX.md) · [模组更新](docs/MOD_UPDATE.md) · [恢复边界](docs/GAME_DIRECTORY_EXCLUSION.md)
- [清单格式](docs/GEMS_MANIFEST.md) · [RPF 副本](docs/RPF_COPY.md) · [handling 编辑](docs/HANDLING_EDITOR.md) · [配置方案](docs/PROFILES.md)
- [全部文档](docs/) · [贡献指南](../CONTRIBUTING.md) · [安全报告](../SECURITY.md)

历史报告只对应当时版本；它们保留开发过程，不代表所有功能已完成游戏实测。

本项目自有代码采用 [MIT License](LICENSE)。依赖和上游许可见[依赖记录](docs/DEPENDENCIES.json)、[RPF 声明](packages/rpf-engine/NOTICE.txt)及[原生接口来源](native/game-assistant/third_party/shvdne/SOURCE.md)。本项目与 Rockstar Games、Take-Two Interactive 无隶属关系。
