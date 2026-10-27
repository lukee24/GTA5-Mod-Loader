# 发行命令行参数准入

当前0.1.52。只说明GEMS工程的三个发行入口，未改变用户签名、账号或系统策略。

| 入口 | 无参数 | 明确支持的选项 |
|---|---|---|
| release-manifest.mjs | 读取完整开发附件并生成开发清单 | --source-only：源码和声明附件；--installer-unavailable：桌面开发包但缺安装器；--require-signed：完整签名预览 |
| signed-build.mjs | 先检查签名身份/配置，构建并验证 | --preflight：只检查配置字段，不连接服务/验证证书 |
| verify-signatures.mjs | 核验全部声明的发行代码 | --file 程序路径：只核验指定文件 |

每个入口均允许单独 --help，输出中文用法且不读取包版本、发行附件、配置/签名服务或写证据。帮助不能与其他选项组合。manifest三个选项互斥；签名预览必须拥有完整程序/安装器/便携包/助手DLL，不允许降级。三个脚本只接受显式选项；未知拼写、重复、赋值形式和多余位置值都会先退出失败，不回显未知值。有限参数最多16项，每项32768字符，拒绝控制字符/非法类型；这些是接口边界，非大型文件性能或安全认证。

Windows路径含空格时作为一个带引号的参数，例如：

```powershell
node scripts/verify-signatures.mjs --file "C:/测试目录/GEMS 程序.exe"
node scripts/release-manifest.mjs --source-only
node scripts/signed-build.mjs --help
npm run test:release-cli
```

--file需要且只需要一个路径；以减号开始的相对文件名使用 ./ 前缀。解释器不执行目标，也不把声明路径当签名证明，实际独立文件/身份/SHA/Windows签名和发布者策略仍由原检查完成。程序接口verifySignedFile与verifyReleaseSignatures保留；CLI参数验证不代替这些策略。

审查R57/P2：原source-only搭配拼错requre-signed可以退出0并改写清单，但清单仍是unsigned-development/commercialReady=false，未冒称signed-preview或实际绕过可信签名门禁。初始真实项目3组全失败，清单被测试恢复；最终9项包括复制本工程实际原脚本的独立子进程、非法包JSON/证据哨兵/缺附件与依赖，以及纯参数边界。定向28、核心566和构建通过；没有创建/信任测试证书或执行游戏助手/Electron/安装器。

尚未完成：manifest与SHA256SUMS成对原子/覆盖/中断、buildPlatform硬编码、其他CLI全面审查、真实完整签名与安装/卸载/更新、所有附件许可和Enhanced游戏效果。本机原Electron3077未解除，本版 UI/IPC/最终EXE不算已验收。