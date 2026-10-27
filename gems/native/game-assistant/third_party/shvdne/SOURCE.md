# ScriptHookVDotNet Enhanced 编译引用

来源为作者 Chiheb-Bacha 的[官方仓库](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced)，并非 Rockstar 官方 SDK。

- 固定版本：[v1.1.0.6](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6)，发布于 2026-07-15。
- 原始文件：[ScriptHookVDotNetEnhanced-v1.1.0.6.zip](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/download/v1.1.0.6/ScriptHookVDotNetEnhanced-v1.1.0.6.zip)。
- SHA-256：`f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a`。下载后实际校验与 GitHub release asset digest 一致。
- 编译引用：`package/ScriptHookVDotNet3.dll`，不将第三方运行时复制进 GEMS 插件输出目录。
- 许可证：zlib；完整原文在 `package/Licenses/LICENSE.txt`。其他声明在同目录 COPYRIGHT、THIRD-PARTY-NOTICES、MinHookLicense、CallHookLicense 文件。

公开源码只保留来源记录和原始许可证，不分发原始下载包、API DLL、ASI、调试符号或 API 文档。可选构建由开发者按照 [BUILDING.md](../../BUILDING.md) 自行取得并核验固定 SDK；本机下载及输出不进入 Git 或源码归档。发行桌面安装程序不自动安装这些游戏组件。测试安装前应使用同一版本包内的 ASI 与两套 API DLL，依照作者说明安装，不能混用版本。

第三方 SHVDNE 的支持声明并不代表 GEMS 插件通过 Enhanced 游戏实测；GEMS 自身仍处于“编译与离线测试通过，游戏内未验证”的状态。
