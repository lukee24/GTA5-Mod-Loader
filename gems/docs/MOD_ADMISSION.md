# MOD记录准入与共享文件保护

0.1.49补充：报告规则已提取到core/import-report，MOD继续同一规则并保留MOD中文错误。下文0.1.48剩余的import和manual-targets状态准入已补齐（见IMPORT_ADMISSION.md）；快照/全部关联/维护/性能/真实UI及游戏缺口保持，不升级历史测试范围。

当前0.1.48。模块packages/installer/mod-records.ts；固定SQL读取在packages/database/index.ts。仅本工程MOD DTO和内嵌报告字段验证，不证明作者/资源或游戏效果。

记录状态只允许已启用、已停用、已卸载；SQL键/文档id/报告id一致，事务标识非空，实际UTC日历、非负安全整数bytes、有限品牌/收藏值。报告类别/文件/警告/阻碍/生成名、独立绝对源路径、相对路径/hash/大小与布尔、重复Windows源路径检查；README保留多行，最多512Ki字符。未知字段拒绝，不默默去掉字段或自动改旧数据。

单MOD最多8MiB JSON，完整MOD最多10000条/32MiB，报告文件最多20000个、每文件最多20GiB。SQL在JSON解析前限字节/数量；无法检查全批则停止，无部分所有权清单。预计写入在安装第一条事务/备份/目标写入之前检查；同id替换扣除原JSON文本。main品牌收藏写入先调用同一预算/字段检查。没有磁盘预留或OS锁。

Installer/index所有MOD读取与Desktop/main State/记录操作/导出采用统一读取；restoreTransaction和recover写状态前全批准入。缺失MOD与坏MOD区分：正常安装中断时缺MOD仍按原事务恢复；坏记录保留并停止。启动仍await recover，异常可能触发现有中文启动错误框，维护模式尚未实现且本版框未在Electron验证。

测试：12项/定向56/核心523/构建通过；详见TEST_REPORT。初始恢复夹具后来改为实际已安装MOD坏JSON，最终定向复验；旧版单模块隔离复验明确共享文件删除/先回滚后报错。10001行/35MiB空白JSON、预计警告超8MiB仅数量/文本预算，不是大型作者MOD或性能压力。

剩余：独立import/snapshot和manual-targets原status判断、整体事务关联/备份引用、损坏修复/迁移/归档、重复完整校验性能、OS竞态、UI/IPC/真实Enhanced与可信发行。没有解除3077或启动Electron，无新网络/依赖/第三方授权/游戏写入。原完整需求全部保留，不能销售为全部已验收成品。
