# 恢复暂存提交与清理保护

当前0.1.56，审查R61/P2，范围为Backup.restore经由现有Installer/快照使用的真实文件恢复。原游戏进程、路径、覆盖审批、所有权及事务守卫保持，未运行真实Enhanced或加载游戏助手。

原流程在tmp初次SHA校验后仍进行fsync和目标异步SHA核对，tmp可变化后被先提交，随后才因写后SHA错报失败。三组实际隔离复现中两组原目标被改成late corruption，一组真实hardlink替换未拒绝；不是声明真实用户游戏损坏或远程攻击，旧hardlink断言在diagnostic之前失败，原日志没有nlink测量。

现先读实际源blob hash/bytes；创建父目录后记录每层普通目录dev/ino，copy完成捕获tmp文件身份。tmp必须独立普通文件nlink=1，fsync前后再次检查同fd SHA/真实大小及路径/纳秒身份；目标预期核对后同步复查tmp/全目录，再rename。原写后SHA检查保持。源blob只读硬链接策略不变，目标恢复副本必须独立。

cleanup只移除仍在同一普通目录、同inode、本次拥有的tmp；同inode损坏副本可以清理，替换的新inode/硬链接/外移/父目录变化/清理失败保留。copy抛错或捕获身份前失败可能留下未取得所有权的部分文件，不凭名字删除；维护/引用清理未提供。expectedCurrent在公开API仍可选，Installer调用已有明确预期，本轮未新增其他调用授权。

验证：npm run test:restore-stage。新增10项、定向54、核心606和构建通过。fsync后实际损坏、目标核对期间普通/同字节新inode/hardlink替换、同inode改字节并主动改mtime都拒绝原目标保持；父目录在target fd关闭后实际改名/替换成普通目录或junction，外部同名目标/tmp和移走旧文件保留；fsync故障原错误保留并重试正常，源blob坏字节在copy前拒绝，普通/0字节恢复独立且正确；真实Scanner/SQLite/Installer损坏tmp失败已回滚/原用户ini不改，再安装与停用正常。全部夹具自建本地文本，空guard不代表真实故事模式。

限制：元数据与两次SHA不是OS锁/原子快照；最后检查至rename及未显现元数据的同长度变化没有全面保证。增加一遍tmp SHA有IO开销，真实大资源峰值、取消/超时/硬件断电和全文件DB原子未验收；本轮没有在最终提交点新增游戏进程/磁盘状态复核，仍由原逐操作guard负责，长核验窗口待审。当前Electron3077未解除且不重试/绕过，UI/IPC/最终EXE和完整商业终验未通过，历史助手仍NotSigned，无新第三方资源/下载或商业许可。