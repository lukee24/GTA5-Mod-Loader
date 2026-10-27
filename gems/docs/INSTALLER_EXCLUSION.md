# 同一数据库实例的文件事务互斥

当前0.1.74另增加游戏根进程内写租约，补充同进程不同Store共用目录边界，见GAME_DIRECTORY_EXCLUSION.md；下述0.1.67范围为历史。仍不等于跨进程/OS锁或持久跨库共享所有权。

0.1.67：Installer公开restoreTransaction接入exclusive，与安装、停用、卸载和recover共用写操作边界。模块内WeakSet绑定Store对象，同一Store的不同Installer实例不能并行开启第二个文件事务。busy仍用于当前实例显示；锁在成功或异常后finally释放，发生冲突立即中文拒绝，不排队。

内部restoreWithinTransaction只由已持有锁的安装失败、停用和recover调用，避免嵌套申请而把正常回滚拒绝或造成等待死锁。恢复输入与持久化清单完整绑定、私有结果/不回写请求、既有路径/实际SHA/所有权/末段守卫检查保持。

复现：npm run test:installer-exclusion。原3项实际隔离SQLite和文件测试，已有exclusive等待时直接恢复仍删除原已安装文件；真实disable守卫等待时另一实例恢复同一事务；另一实例可在已有写事务等待中安装新MOD。初始化用Scanner/Store/Backup/Installer真实操作，等待用明确Promise闸门，不是模拟安装结果或真实游戏进程。

范围：仅同进程、同一个Store对象；不同Store即使打开相同库文件也不在该WeakSet范围内，更不等于跨进程或跨数据库的游戏目录锁。独立Store且独立游戏目录仍可并行操作。只读plan等可继续读取，不保证跨等待的所有权/账本语义稳定；不同库共同写一个游戏目录、任意本地改库、OS文件锁/准确断电与完整发行验收仍需独立解决。

这项互斥不是身份认证、IPC授权或线程互斥原语。当前桌面主进程主要使用单个Installer，尚未证实真实GUI能制造本轮直接Core API重入；当前UI/IPC/Enhanced和最终EXE没有因此通过验收。原Device Guard 3077不重试或绕过。

验证：新增8项/定向97/97、核心707/707/0跳过、构建通过。正常内部回滚/实例间重试、原错误保持和独立库不误阻通过。真实证据见TEST_REPORT.md和artifacts/installer-exclusion-current.json。
