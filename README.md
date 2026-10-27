# GTA5模组加载器

GTA5模组加载器是我在开发的 GTA5 Enhanced 模组管理工具，目前主要围绕车辆。它把模组导入、安装管理、备份恢复和依赖检查放在一个 Windows 桌面应用里，不依赖 OpenIV。

源码和旧版文件中的 GEMS 是项目以前的名称；现有 0.1.86 程序界面和文件名仍沿用旧名。

目前已实现游戏目录识别、模组扫描、车辆分类与收藏，以及受支持文件的安装、启用、停用、更新和卸载。安装前会显示文件改动并建立备份，出错后可以按记录恢复。还有依赖诊断、Steam 启动入口和本地日志。这些软件流程已经做过测试，当前版本是 **0.1.86-dev.1**。

游戏助手仍是实验功能。旧版脚本在 Enhanced 1.0.1158.16 故事模式中测过 F5 中文菜单、原版 Adder 生成、收藏和开门。还执行了修复请求，读回车辆生命和引擎数值1000/1000，但没有验证受损车辆的恢复。新版修复了速度设置，但复测时遇到 `ERR_GFX_STATE` 图形错误，速度修复和驾驶还没测完，助手自动安装暂未开放。

新增 Add-On 车辆的 DLC 注册、Legacy → Enhanced 转换和加密 RPF 修改目前不支持。已安装或已启用只说明文件操作完成，车辆能否正常使用还要在游戏里确认。高级人物、服装、摄影等后续再维护。

## 从源码运行

需要 Windows x64 和 Node.js 24。在仓库根目录执行：

```powershell
cd gems
npm ci
npm run build
npm start
```

`npm test` 运行软件测试，不需要游戏；`npm run test:ui` 是可选的桌面测试。原生助手需要另行构建，见[构建说明](gems/native/game-assistant/BUILDING.md)。仓库不包含游戏文件、模组包、运行时或 SDK 二进制。

## 使用与维护

- [使用说明](gems/docs/CORE_QUICK_START.md) · [开发说明](gems/README.md)
- [当前状态与限制](docs/CORE_RELEASE_STATUS.md) · [本版测试记录](docs/DEVELOPMENT_ACCEPTANCE_0.1.86.md) · [完整功能清单](gems/docs/ACCEPTANCE_MATRIX.md)
- [全部文档](gems/docs/) · [贡献指南](CONTRIBUTING.md) · [安全报告](SECURITY.md)

这是一个持续维护中的项目。欢迎提交能复现的问题，尤其是具体游戏版本、模组类型和安装恢复步骤。

## 许可

本项目自有代码采用 [MIT License](LICENSE)。第三方依赖保留各自许可，见[依赖记录](gems/docs/DEPENDENCIES.json)、[RPF 声明](gems/packages/rpf-engine/NOTICE.txt)和[原生接口来源](gems/native/game-assistant/third_party/shvdne/SOURCE.md)。本项目与 Rockstar Games、Take-Two Interactive 无隶属关系。
