# RAR / 7Z 导入后端

GEMS 使用独立的 **7-Zip 26.05 Windows x64** 控制台后端读取 RAR / 7Z。ZIP / OIV 继续使用原有 yauzl 路径。外部程序不负责向归档指定的路径解压：它只通过 stdout 输出被选中的一个文件，GEMS 检查长度和 CRC 后写入自己的隔离缓存。

导入顺序为：保留原包副本 → 核验后端 EXE / DLL → 核对格式魔数 → 有界列目录 → 验证路径、类型和容量 → 每个文件再次精确列名核对 → 逐个限长读取并校验 CRC → 完整成功后发布缓存。扫描和解压不等于安装成功或游戏加载成功。

目录穿越、绝对路径、设备名、备用数据流、通配符、重复/大小写冲突、文件与目录冲突、链接、加密、分卷和不能可靠解析的目录字段均拒绝。非空注释和 NT 安全信息也保守拒绝。目录最多 64 层，相对路径最多 4096 字符；最多 20000 条目和 20 GiB 总展开数据。目录文本最多 8 MiB，错误文本最多 64 KiB；超过 1 MiB 的总数据压缩比超过 300 时拒绝。每次列目录最多 30 秒，单条进程最多 120 秒，一次导入总时间预算 10 分钟。7Z 使用后端 512 MiB 内存参数；RAR 不支持该参数，改为拒绝目录声明中超过 512 MiB 的字典。后者不是操作系统级进程内存限制。

失败时原始输入不变，保留工作区中的原包副本与 failure.txt；仅清理本次创建且目录身份仍匹配的暂存目录。出现连接或目录身份变化时保留现场，不递归清理不明目录。

## 安装或配置后端

按顺序查找：

1. 明确设置的 `GEMS_7ZIP_DIRECTORY` 绝对目录（开发或受控部署）。
2. 打包应用的 `resources/tools/7zip-26.05`。
3. Windows Program Files 中的 `7-Zip`。

每种位置都必须同时匹配下列 EXE / DLL 字节。程序不搜索 PATH，不执行任意选定程序，不自动更新全局 7-Zip，不加载额外 `Codecs` / `Formats` 插件目录。26.04、其他版本或修改后的 DLL 会明确拒绝，不能仅修改版本号或目录名称绕过。后端缺失时仍可使用 ZIP / 文件夹导入。

## 可复现来源与校验

2026-10-27 从 [7-Zip 官方下载页](https://www.7-zip.org/download.html)核对到官方仓库的 [26.05 x64 安装包](https://github.com/ip7z/7zip/releases/download/26.05/7z2605-x64.exe)。[官方发布资产页](https://github.com/ip7z/7zip/releases/expanded_assets/26.05)公布该安装包的 SHA256；本轮下载值与之相同：

```text
7z2605-x64.exe
fd99e86f57d8f429ef5ed045bf98315af962e2309b0f1ba87a147a44c71647d0
```

下载后先核对上述哈希，再用已有可信归档工具仅提取 `7z.exe`、`7z.dll`、`License.txt`、`History.txt` 到新建目录。无需运行安装器，不改动系统安装。解出后再次核对：

| 文件 | SHA256 |
| --- | --- |
| 7z.exe | `94205cfc054dd3bbeb978905bc619a65b3f04e9e73bb2717841110b6f46d962e` |
| 7z.dll | `78bf6b668d75801e3aa180b4ccb16e6d8395fba80dec8a065055bb6f8dfabb82` |
| License.txt | `519ac0a4bded9c18ea02e0afb71f663d8c47373bd9facd3ac96a79f51d77765d` |
| History.txt | `da10132b33d6674f9338c830714678c95caa420bbd5069d381136eafe6a435f1` |

安装包与解出的程序没有 Authenticode 签名；这里的来源证据是官方网页链接、官方发布资产摘要和逐文件比对，不是签名证明，也不是对所有恶意归档安全性的保证。不要把未核验的不同版本加入哈希表。真实用户模组和本机私有测试缓存不属于项目源码或公开测试资产。

对应源码：[7-Zip 26.05 source .7z](https://github.com/ip7z/7zip/releases/download/26.05/7z2605-src.7z)，官方发布 SHA256 为 `fa081a1a33186158d71e9e24f494ed852ef8d0c9d06e21a86fb4713d94b55ae9`。下载后先用 `Get-FileHash -Algorithm SHA256` 核对该值，再解压到独立的源码目录。源码构建后的字节可能不同，必须作为另一个后端逐项验证，不能假称与上述发行字节一致。GEMS 本身不在导入时构建或下载后端。

如需从源码构建，遵循该发布标签的 [DOC/readme.txt](https://github.com/ip7z/7zip/blob/26.05/DOC/readme.txt)：安装 Visual Studio C++ 工具与 Windows SDK，使用带 `ml64.exe` 的 x64 Native Tools 命令提示符。进入解压目录的 `CPP\7zip` 后执行 `nmake` 构建全部 Windows 目标；单独构建控制台与完整格式 DLL 时，分别在 `CPP\7zip\UI\Console` 和 `CPP\7zip\Bundles\Format7zF` 执行 `nmake`。记录编译器、SDK 版本、构建日志与产物哈希后，重新验证导入功能及归档异常用例。此处提供官方构建路径，**本轮使用的后端是官方发行二进制，没有执行源码编译**。

GEMS 的本地构建先执行 `node scripts/prepare-archive-tools.mjs --from <上述四文件所在的绝对目录>`，再执行 `npm run build` 或 `npm run dist`。该步骤复制通过哈希检查的文件，并取得官方对应源码 `7z2605-src.tar.xz`（SHA256 `0b6080b8c3e7a579161d2d495224c0e51c467576cb4c7048b0ab485ef44cc22e`）。系统 tar 只将源码中两个固定许可条目输出到有界内存，随后以新文件保存为 `LGPL-2.1.txt` 和 `unRarLicense.txt`；不运行安装器或把归档路径直接解压到目标目录。程序、来源说明、版权、完整许可及对应源码一同进入本地开发包。原生归档测试默认使用项目内已准备的 `tools/7zip-26.05`；也可通过 `GEMS_7ZIP_DIRECTORY` 显式指定已核验目录。

`npm test` 包含不依赖二进制的目录解析与安全边界单元测试。另行执行 `npm run test:archive-backend` 运行 `tests/sevenzip-integration.ts`，覆盖真实 26.05 进程、有效与恶意 7Z、solid 压缩、精确文件选择和失败处理；必须先准备后端，缺少后端会失败而不是静默跳过。纯源码归档不包含工具二进制或用户样本，因此普通单元测试通过不等于原生归档链已经验收。

## 许可与验证范围

7-Zip 不采用 GEMS 的 MIT 许可。应保留发行包内的 `License.txt`、版权和相关声明，并参照 [官方许可说明](https://www.7-zip.org/license.txt)处理公开分发与对应源码提供。主要代码适用 GNU LGPL 2.1 或后续版本；`7z.dll` 还包含 BSD 条款代码和带 unRAR 限制的代码。unRAR 限制禁止利用该部分代码重建 RAR 压缩算法，不能宣称所有随附代码都是 OSI 开源许可。GEMS 仅调用解码功能，不生成 RAR。

本轮验证包括真实 7Z 中文/空格名称、空文件、加密、损坏、路径穿越、CRC 错误、输出上限，以及已有 RAR5 / 7Z 模组的只读导入与原包哈希不变。RAR4 解析器已接线，但尚无代表性 RAR4 实包验收证据；不得扩大结论。更换后端版本和正式分发包后，应从实际交付包重新测试，而不是沿用开发环境结果。
