# 发行代码附件与签名证据

当前0.1.50，release/manifest.json使用schemaVersion=2。source-only只表示没有本版桌面程序/安装器交付，不表示没有代码；当前附带历史助手DLL，Windows只读检查NotSigned。desktopRuntime=not-delivered，codeArtifactCount=1，codeSigning=unsigned-development，两完整终验标记false。

scripts/authenticode.mjs只调用系统Get-AuthenticodeSignature，不载入目标程序/项目脚本，不修改ExecutionPolicy、账户或信任库。verify-signatures原authenticode导出保持。签名证据保留系统原字段；缺失身份可能表现null/空对象，完整策略按未知/不匹配拒绝，不补真实发布者。

scripts/release-artifacts.mjs以EXE/DLL/ASI声明代码类型；固定签名目标为GEMS桌面EXE、安装器、便携EXE（各至少1MiB），助手DLL（至少16KiB）。不覆盖Electron所有第三方DLL、安装后卸载器和未来未登记代码，合法许可/完整物料清单与安装验收另行完成。没有自动为助手DLL签名；完整模式遇其不符合策略就拒绝，不降级。开发源码通道允许明确报告unsigned。

系统Valid状态仅表示此系统的Authenticode结果。明确预期发布者、公开指纹、非自签名、代码签名用途与时间戳全满足才显示verified-authenticode；单Valid无完整身份验收为authenticode-valid-publisher-unverified，未检查/冲突为incomplete-signature-check，混合状态逐附件核对。纯Valid测试对象不是证书或实际签名成功。

发行证据读取拒绝路径连接/符号链接、多链接/非普通文件，固定FD/1MiB缓冲循环完整读，在签名检查前后双次实际SHA并核对大小/纳秒路径身份；任何观察到变化停止，不修改源/外部文件。同步构建脚本两次读，不作性能承诺；不是OS锁或所有附件全局原子快照、最后检查后保护。仅文件hash和签名信息，不验证源ZIP内容/游戏ABI/所有资源/运行。

10项新增/定向19/核心545/构建通过。真实CLI/DLL及旧Node系统读签名、临时已知数据文件和规则夹具区分。新增实现回归的EBADF、可见元数据未检出同长度变更和一次摘要变量错误均保留日志且修复；原助手/Node字节不改。为了全量实际CLI，版本升级后先创建依赖用中间源包，最终仍在所有文档完成后再归档/CRC/source hash/清单。

原Electron3077未重试/绕过，本版桌面和游戏未验收；无可信发布者身份、商业授权新证据，不重问证书/密码。未调用签名服务/创建信任/启动游戏。Windows证书验证的网络/缓存行为未做抓包或离线验收。SHA256SUMS与manifest成对写入、覆盖/中断恢复、未知CLI选项、完整物料和全商业终验仍待推进。
