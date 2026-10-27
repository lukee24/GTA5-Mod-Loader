# 文件提交前条件复核

当前0.1.57，R62/P2。原操作开头guard通过后仍做长核验，许可可能改变。新功能保护最终rename/unlink，未运行真实Enhanced/当前Electron或改变系统策略。

Backup.restore保留前三参数并可接收第四beforeCommit函数：暂存/目标SHA核验完成后调用一次，非法回调工作前拒绝、回调异常原样传出。Installer安装/覆盖恢复的两处restore传原guard，新增目标恢复删除也在unlink前再次调用。主进程原guardGame绑定保留，因此真实环境仍使用原只读游戏部署/进程检查；当前测试仅模拟guard，不声称实机切换成功。

异步guard本身可能等候，期间用户会改变目标。commit-target捕获普通目标/每层目录身份或明确null，再在核验与回调之后同步检查；新增目录尚不存在用missing标记，不创建、不当作永远许可，后来出现会拒绝。tmp原全存在独立文件政策保持，目录身份提取到core/path-identity，restoreDirectoryIdentity别名保留。缺失目录不能阻断无需写入的正确回滚。

guard失败可能留下恢复待处理事务：applied=true是写前持久化标记，不证明目标已提交；不虚报启用或恢复。条件允许后recover按实际SHA和所有权处理，未提交则消除标记，真正已提交则恢复；用户另行改变的内容保留。预备目录/tmp可能已创建/复制，末段钩子不表示整个准备阶段零写入；通用Backup.restore省略回调也不自行验证游戏条件。

验证：npm run test:commit-guard。新增11项、定向77、核心617/构建通过。原3组真实隔离copy/read后模拟running，旧版仍覆盖、停用或unlink；修复后运行中/未知/部署故障保留目标与待处理状态，条件恢复再recover/安装/停用正常。异步回调中用户改写/新建目标和unlink guard中改写均保留；回调阶段/次数、非法回调、原缺失父目录/早期失败无写回滚单独验证。首次13项文案类别1失败和首次616项新缺失父目录回归1失败已修正留证，不放宽保护。

限制：无OS进程锁/阻止游戏启动，guard结束到同步提交还有最后竞态；准备阶段、磁盘余量末段、每文件额外环境检查性能/大IO/取消/超时、其他后端尚未全面验收。旧process-recovery真实子进程终止测试属于本软件测试进程，不是GTA崩溃/游戏效果。原Electron3077不重试/绕过，E只读就绪1.0.1158.16/未运行；source-only历史助手未签名、无桌面EXE验收、commercialReady=false/fullRequirementsPassed=false。