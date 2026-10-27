# 自动恢复事务整批准入

0.1.46更新：当前Installer与desktop/main事务读取及直接恢复基本身份已统一准入，见TRANSACTION_READERS.md；下文未覆盖其他事务入口为0.1.45历史范围，其他数据类型/关联及UI缺口仍保留。

0.1.45：R50/P2自动恢复仅解析事务JSON，坏对象/字段/状态/变更可入流程后报错，较早坏对象可能在新事务已恢复后才发现。新增恢复整批准入：SQL单条8MiB/10000条/合计32MiB，键字段/UTC日期/哈希/目标/布尔/变更20000与重复Windows路径、结束状态一致性检查；全部通过才调用恢复。原validateTarget提取共享政策保持公开接口，错误中文且不自动修复/删除。新增9项，初始7项2通过/5失败，定向22/22、核心492/492/0跳过、构建通过；实际隔离SQLite/备份/目录/原文与10001行计数拒绝/正常中断恢复，非容量压力或游戏实测。16:13香港时间E盘只读record=present/就绪1.0.1158.16/未运行，原Electron3077未重试/绕过，无新依赖/公网/商业许可/真实游戏写入，完整终验缺口保留，详见RECOVERY_ADMISSION.md。

入口Installer.recover调用readRecoveryTransactions，先完整读取/校验所有transaction再进入恢复循环。任一文档未知、坏JSON/字段/键、重复目标或超限，就中文拒绝本批；不会以局部样本继续恢复、自动删除/归一化/迁移。startup仍await recover，坏记录将经原启动失败框停止，维护模式和修复工具待实现，实际Electron未验证。

SQL在解析前限制每文档8MiB、键80字节、数量10000及文本合计32MiB；数量/合计超限不返回部分可执行记录。规则只针对本批恢复读取，不升级Store.get/list所有类型。

事务只允许原九字段，id与SQL键一致，modId为有限标识，name普通非空文字300字符、gamePath绝对路径32768字符，created实际UTC ISO毫秒日期，原五状态与可选error/trustedRestore类型；changes最多20000，仅target/before/after/applied，SHA为64位小写十六进制、before允许null、applied布尔。目标使用共享原validateTarget政策，最长4096字符，Windows大小写重复拒绝。已回滚不能仍applied，已完成须有变更且全部applied；空准备事务允许按原流程回滚。

格式检查不证明文件当前状态/备份内容/作者或来源、MOD关联、整个事务身份、游戏版本与效果。原执行阶段游戏/路径/备份SHA/共享所有权仍必需，其他Installer list/get/直接restoreTransaction/main State/手动单次恢复及MOD/导入准入未统一，本模块不能代替它们。没有OS锁、全文件与数据库原子或断电保证。

validateTarget从Installer.index提取为target-policy，原公开接口导出保持；未更改目标许可或开放新的可执行类型。

真实隔离SQLite/文件/备份，失败数据库原字节与内存行、guard零次/partial文件保护；正常中断恢复与重开通过。8MiB拒绝、10001真实null行零JSON解析、20001变更与结束矛盾验证只是边界，不是有效大库/32MiB上限压力。新增9项初始7项2通过5失败，定向22/核心492/构建通过，运行npm run test:recovery-admission。

E仅只读部署/版本/进程，未写真实游戏。原Electron3077未重试/绕过，当前UI/IPC/启动错误框/最终EXE未验收，无新依赖或商业授权，完整终验仍未通过。
