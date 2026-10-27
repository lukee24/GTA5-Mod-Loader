# 快照计划身份与源文件绑定

最新0.1.63：R68/P2快照预检回调拿到可变已校验计划，可把B内容记给A、改游戏根目录或改id但侧车仍旧文件名；原3项全失败/实际隔离JSON和blob错关联。SnapshotPlan只读类型且根/数组/条目深冻结，输入源字段只捕获一次，Backup.snapshot预检回调准入/TypeError中文且不写blob，之后使用计划自身gamePath。新增8项/定向63/63、核心674/674/0跳过、构建通过；异步期间改原输入不改变备份、预检失败原错误保持/之后可重试，真实SQLite容量回调/保存重开正确关联。10月14日01:10香港时间E只读就绪1.0.1158.16/未运行；原3077不重试/绕过，当前UI/IPC/Enhanced/最终EXE未验收，无新依赖/公网/商业许可/真实游戏写入，完整商业终验未通过，详见SNAPSHOT_PLAN.md。

planSnapshot先完成完整清单/路径对应/类型/预算核对，再冻结根、files数组及每个文件条目，并以readonly类型表达。绝对源字段只读取一次，避免源Getter在核对和登记间换值；对普通输入也确保之后变化不改变私有计划。

Backup.snapshot传给beforeWrite的是该只读计划；预检可以同步或返回Promise，必须完成后才保存blob。非法回调/修改计划TypeError中文拒绝，其他原Error引用保持；随后以计划gamePath/id/source/relative执行，不允许预检重写已验证关联。输出SnapshotRecord未冻结，原记录/数据库的读写政策不因此改变。

npm run test:snapshot-plan：8新增与55相关=63/63，完整674/674、构建通过。原3项实际错关联失败，变更拒绝/原文件保持、原输入async变化不改计划、Getter一次读，以及真实SQLite容量检查/保存重开见TEST_REPORT。

这是direct后端契约保护；当前main容量回调没有这些变更行为，未声称已从GUI触发、安装不可信插件或修改E游戏。不可变计划不锁物理源/全环境或撤销外部回调副作用；侧车JSON与SQLite仍两步，没有完整环境原子/断电/大资源验收。当前UI/IPC/Enhanced及正式商用仍需各自实际证据，原3077不绕过。
