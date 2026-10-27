# 0.1.85 核心版原生助手交接

> 本文是早前软件交接快照。后续真实游戏局部结果与速度修复DLL身份以[0.1.86记录](../../../docs/DEVELOPMENT_ACCEPTANCE_0.1.86.md)为准；不将本页历史“未部署”扩为当前事实。

2026-10-27。用户最新确定以车辆正常可用的核心版为交付目标，人物/服装/摄影保留后续维护。本次完成受影响原生路径的软件回归；没有写入或启动真实GTA。整个助手仍为实验性软件，gameValidationStatus=not-tested，desktopInstallationAllowed=false。车辆模组的实际安装、游戏加载、使用及恢复仍须单独故事模式验收。

## 当前默认行为

生产默认保持原七分类（玩家、当前车辆、世界天气与时间、车辆生成器、收藏车型、输入与映射、武器库存与目录）。ExperimentalPedsEnabled默认为false，没有生产菜单或配置开关；新增人物源码保留，不能据源码存在声称人物已交付。人物目录、收藏、逐Tick创建和条件清理曾在隔离替身链执行，实际人物效果及完整视觉验收仍未完成。

车辆提交前继续逐Tick等待模型，最终使用固定SHVDNE源码已核的命名CREATE_VEHICLE参数：model/hash、x/y/z、heading、false、false。固定typed World.CreateVehicle内部会Request(1000)/Yield，因此不在最后检查之后进入该等待包装。最后重新检查输入资格、角色身份、模型/动态车辆容量及邻近占用，并在native调用前消费一次性票据和共享预约。创建后异常不重试，已经提交但未知的对象保持占用额度。当前实例已提交/未知对象加未提交预约上限16；世界清理实际观察本实例车辆消失后才释放对应额度，失权/遗忘不释放。命名DELETE_ENTITY直接处理仍满足原有身份和安全条件的本实例车辆，不先调用会夺归属的Entity.Delete包装器。上述是软件接线与观测合同，不是游戏兼容保证。

## 本次实际执行

| 层 | 结果 | 日志 |
| --- | --- | --- |
| 固定SDK net48/x64构建 | exit0，2 warning/0 error | artifacts/0.1.85-core-sdk-build-final.txt |
| 既有原生core/Windows文件 | 721断言通过；4历史权限分支未执行 | artifacts/0.1.85-core-native-regression.txt |
| 实际GtaWorldPort关联 | 201断言通过，0失败组 | artifacts/0.1.85-stage8-world-port.txt |
| 实际Script输入/玩家/武器/角色动作 | 99 / 51 / 61 / 46断言通过 | artifacts/0.1.85-core-input-flow-final.txt |
| 维护人物实际Script链 | 54断言通过，含默认入口关闭检查，测试内部显式打开 | 同上；GTA/输入/绘图仍替身 |
| 既有车辆/世界/面板Windows GDI | 1378断言通过，含1000帧动态值 | artifacts/0.1.85-core-visual-run.txt |
| 独立实际Script车辆关键入口 | 6例通过，最终Script SHA与独立绑定相同 | 私有ped-review-0.1.85/vehicle-script/runs/candidate1；独立总报告 |

不同单位和层次不合并成游戏测试总数。GDI输出在artifacts/0.1.85-core-visual；测试程序保留历史0.1.80-stage3图片文件名，但本轮新目录实际重新绘制，未覆盖旧版图片。已目视当前车辆末页和条件清理确认两图，主要操作文字可读。GDI不是游戏HUD或实际手柄测试。

最终SDK的两条警告来自默认关闭的维护代码：PedMenu.Short的nullable分析，以及仅由测试赋值的PedFavoriteStore.BeforePublish字段。GDI构建有NU1900（漏洞服务不可达），不称漏洞审计通过。初次port固定SDK构建暴露Ped(handle)非公开构造，改为Entity.FromHandle as Ped后编译；输入夹具首次语法错误和仍假定七分类的测试预期失败均保留，后者在明确默认关闭高级人物后恢复原七分类预期。

## 已修问题与维护边界

独立真实夹具发现并修复：全取消预约未回收空batch，导致长期字典增长；清理已观察完成但结果Journal写失败时未显示审计未知；新人物收藏写入用只读目录pin造成Windows共享冲突。原始红绿证据由独立报告保留。提交后未知额度继续保留，日志不是删除权限或完整恢复备份。

人物控制器/port/收藏/reader的部分独立候选通过不推广为最终人物验收；源后来有接线和维护门控修改，具体候选身份见独立bindings。新用户缩减到车辆核心后停止扩展人物功能和大批测试包装。此前已经复制的tests/ped-core、ped-port、ped-favorites保留为维护源码（相对路径适配版），本次未将它们当新增正式全量执行结果。实际net48人物reader曾读取TS producer的证据在独立私有报告，不新增公共producer包装。

## 交接产物

本版DLL为artifacts/0.1.85-core-GEMS.GameAssistant.dll，active artifacts/GEMS.GameAssistant.dll和capabilities.json同步。旧0.1.84版本化DLL、源码ZIP与Stage7证据不改。运行源/测试/文档与证据的实际SHA、字节及DLL身份在artifacts/0.1.85-core-native-handoff.json。未生成单独新人物发布包，未部署游戏。用户接受的车辆核心范围与真实游戏验收由主任务继续核对。
