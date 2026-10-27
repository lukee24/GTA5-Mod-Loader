# RAR / 7Z 桌面导入验收

`tests/archive-ui.mjs` 使用实际 Windows Electron 应用、IPC、SQLite、扫描器和已核验的 7-Zip 26.05 x64 后端。测试只替换原生文件选择器的返回路径，不模拟解压或成功结果。

开发模式先执行 `npm run build`，然后在项目根目录运行：

```powershell
node tests/archive-ui.mjs
```

测试使用 `tools/7zip-26.05/7z.exe` 生成含中文、空格路径及 INI 的 7Z 夹具。启动应用前同时核对 EXE / DLL 的固定 SHA-256；开发模式将准确的工具绝对路径传入 `GEMS_7ZIP_DIRECTORY`。全部缓存位于本测试独占的临时目录，退出后清理。

可选加入已有、本地、有权使用的 RAR / 7Z 样本。只导入副本并查看文件列表，不安装、不运行包内文件：

```powershell
$env:GEMS_ARCHIVE_SAMPLE = 'C:\ModSamples\Vehicle.rar'
node tests/archive-ui.mjs
Remove-Item Env:GEMS_ARCHIVE_SAMPLE
```

最终打包后验证实际应用载荷 EXE：

```powershell
$env:GEMS_PACKAGED_EXE = (Resolve-Path '.\release\win-unpacked\GEMS.exe').Path
$env:GEMS_ARCHIVE_SAMPLE = 'C:\ModSamples\Vehicle.rar'
node tests/archive-ui.mjs
Remove-Item Env:GEMS_PACKAGED_EXE
Remove-Item Env:GEMS_ARCHIVE_SAMPLE
```

打包模式会从子进程环境中移除 `GEMS_7ZIP_DIRECTORY`，要求 `resources/tools/7zip-26.05` 的两份实际文件存在且哈希匹配，再执行导入。这条命令验证打包后的应用载荷；安装向导和便携包装器的独立启动仍需各自验收。

验收覆盖：正常导入和解压内容逐字核对、界面文件路径与哈希、重复导入产生独立记录/缓存、取消保持记录、截断的真实 7Z 被后端拒绝、失败缓存保留且内容目录为空、失败后再次正常导入、重启后记录保留、深浅主题与 1024×768 窗口。所有阶段要求没有绑定游戏、没有模组安装记录和没有文件事务。

结果位于 `artifacts/archive-ui-current.json` 和 `archive-ui-development.json` / `archive-ui-packaged.json`；独立样本证据位于 `archive-ui-sample-*.json`。样本证据仅包含名称、大小、哈希、文件/阻塞项数量及原文件保持结果，不包含资源内容。截图仅使用生成的测试夹具。

本轮开发模式 `0.1.78-dev.1` 已通过。现有 `M4.rar` 为 33,409,475 字节，SHA-256 为 `528462c294ca8cf1a1a898d27710588e7fa4faf4b27d0503df1c34a0524068be`，导入识别 4 个文件、保留 2 个安装阻塞项及 1 条警告；原包哈希、大小、修改时间均未改变。这只说明该样本可被读取和分析，不代表资源转换、可安装性、兼容性或 GTA V 实际加载通过。
