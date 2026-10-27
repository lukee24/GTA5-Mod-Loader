# Stage7：角色武器操作（0.1.84-dev.1）

本阶段补上实际菜单、控制器、固定 SDK 端口及持久日志。软件测试覆盖明确的一次清除、四个无限请求、单项组件安装/移除和武器本体颜色的条件恢复；没有部署 DLL 或启动 GTA。`gameValidationStatus=not-tested`、`desktopInstallationAllowed=false`。编译、接口返回、读回和离线图片都不构成模组实际加载或使用通过。

## 原需求及交付边界

原始需求武器部分第 1781–1786 行依次为“获得武器”“获得弹药”“清除武器”“无限弹药”“组件管理”“已安装 MOD 武器搜索”。Stage6 的单项发放、补弹、来源目录和搜索继续保留；其受限槽位、共享池、特殊武器和未验证游戏效果的边界仍适用。

| 原约定 | 本阶段真实开发路径 | 仍待完成或验证 |
| --- | --- | --- |
| 清除武器 | 当前角色全部清除，明确二次确认；一次 typed `RemoveAll`；有界只读核对 | 无完整库存自动撤销；原有/MOD武器及保存副作用须游戏验证 |
| 无限弹药 | 所选共享池请求开启/强制关闭；全角色弹匣请求开启/强制关闭，共四个命令 | 实际 flag 无可靠 getter，射击/换弹/切武器/退出效果及外部脚本共存待实测 |
| 组件管理 | 兼容定义、安装/活动分读、单项安装/移除、武器本体颜色及条件恢复 | 组件新涂装范围和原色适用性未确认，不能编辑或恢复未知组件颜色；隐藏状态不保证恢复 |

原文没有要求清除后完整恢复全部运行时武器状态。文件安装、卸载、备份要求继续保护磁盘文件，不以运行时清除的不可逆性替代文件恢复。清除只能由用户主动完成两次确认，不能在初始化、菜单隐藏、失焦、脚本退出或读回失败后自动执行。本阶段没有把六项武器需求或整项目标成全部完成。

## 使用路径与真实状态含义

打开已配置菜单（默认 F5，也保留可重映射 Alt+G 别名），进入“武器”分类，再进入角色操作页。键盘上下选择、左右分类、加减号修改数字草稿、确认键执行；逻辑手柄上下选择、肩键分类、左右调值，确认键执行。屏幕提示沿 Stage4 当前映射显示。手柄打开组合仍须用户配置，物理设备未实测。

先刷新当前角色库存。清除和全角色弹匣操作只要求有效故事/输入资格、连续角色会话、库存 hash 集合与当前武器身份，不要求可选弹匣、最大弹药或组件诊断成功。近战等可选读数失败不被当作空库存，也不会阻止这两类身份操作。选定一个库存条目后才读取该武器的详情；列表每页五项，组件选择键绑定 hash 和定义摘要，不按易变数组位置指向目标。

清除第一次确认展示“原有/MOD武器”“无完整自动恢复”“可能随游戏保存”。下一次新输入且警告完整可读时才能提交；写入意图、再核会话和库存、消费票据后只调用一次。原生返回后至多观察 120 个 Tick 或 3 秒，两个独立 Tick 均显示当前武器为空手且库存只有空手，才记录“已观测”。中途取消、隐藏、失焦、暂停、身份或守卫变化会结束观察并关闭持有的意图句柄，结果保留未知；不会再次清除或自动 Give 回原武器。

无限请求将三个概念分开：用户期望 `desired`、调用是否返回 `submission`、实际状态 `actualState=unknown`。另记 `auditDurable`，结果写失败不能抹去已经返回的调用。共享池请求绑定实际 AmmoType 和所有已观察成员；成员/类型未知或变化拒绝提交。全角色弹匣请求作用于当前 ped，不称某一所选武器独占。强制关闭是用户新请求，不是恢复未知原值。菜单隐藏、失焦、退出及重载都不隐式写 false，已提交效果可能仍在；旧日志不自动重放请求。

## 组件观察、写入与恢复

固定 SDK 的 `WeaponComponent.Active` getter 底层读取 HAS（是否安装），setter 请求安装/移除；单独 named `IS_PED_WEAPON_COMPONENT_ACTIVE` 读取活动状态。界面分别显示“安装 / 活动”的是、否或未知，不把两者混同。

公开全局组件 hash、named `DOES_WEAPON_TAKE_WEAPON_COMPONENT` 和 SDK 缓存集合相互核对。定义、挂点、安装状态、目标 hash 或连续会话变化会取消旧预览。实际提交前重新核兼容定义和安装状态、捕获的 ped/当前 ped、库存与当前武器。游戏引擎和其他脚本并不接受本工具事务锁，检查无法保证排除所有同值接管或最终调用间的竞争。

读回中保留武器 Tint/TintCount、组件原始色返回、安装和活动字段。武器本体颜色使用实际 TintCount 限制草稿，独立确认后 typed setter；组件色 getter 没有已确认的适用性、成功位或范围合同，原始整数包括 0/负数都不能作为可信可恢复原色。`LiveryRaw` 和可用 `Livery` 分离；后者保持 unknown，组件新色与原色恢复入口不可用。不猜 native 数值、不复制 SDK 内存读写、不借武器 TintCount 当组件范围。

单项组件安装可能互斥卸下同挂点其他组件，也可能改变弹药。只有已观测的预期变化且结果记录成功，才保留当前实例、当前连续会话的条件恢复资格。恢复须再次确认、当前快照仍匹配该次 after；每一步先写意图，再核状态、消费旧资格、调用一次、读回并写结果。互斥件逆向恢复按先移除新增件、再安装原件顺序执行；第二步失败时第一步仍发生，显示已完成步数和当前步骤可能生效，停止后续步骤，不称原子回滚。

记录比较只涉及实际观测字段；未知值不转成 0。最后字段完全匹配才称“已观测字段恢复”，不承诺原库存的全部隐藏状态、外部同值改动、活动状态或涂装都能还原。提交新的明确动作前，旧 Stage6 条件移除与新组件恢复资格失权，审计历史保留。预检查或意图失败且未到提交不会假称已修改；最终端口拒绝也可能保守撤销旧资格，这不是已经改变游戏状态的证据。

## 预算与持久记录

默认库存观察最多 512 项，不扫描全局组件；池请求只补读各项 AmmoType。详情仅选定武器，最多 1024 全局定义、512 个组件。每次详情使用一个 75ms 合作式预算，覆盖兼容、HAS、IS和原始色查询；超时或超量整体标 unknown、组件数组清空，菜单可查看具体 75ms/1024 原因，不返回假装完整的截断列表。清除/全角色弹匣不依赖这些详情。

75ms不是整次菜单操作的延迟保证。预览、确认、意图前后核对和端口最终核对会重复详情；最大计数夹具的完整双确认组件路径调用 14 次全局枚举、14337 次兼容检查、34329 次显式 named-native，另有 typed SDK/身份 getter（替身总边界读数 850602）。该上限夹具固定时间钩子用于计数；独立时钟边界及实际 90ms 延迟用例验证截止。同步 native 不能中途取消，单次调用可超过75ms，返回后才停止；夹具耗时不代表游戏帧性能，实机响应仍待验收。

本地记录仍放 `LocalAppData/GEMS/game-assistant/weapon-actions-v1`；目录名不表示只能读取 v1。旧 Stage6 `GEMS.WeaponAction.v1` 原字节保留，新操作写 v2。reader 按文件扩展核对 intent/result phase、精确字段、base64 UTF-8、ID、checksum、状态及配对版本，拒绝把完整 intent 复制成 result 冒充完成。正常 v1/v2 混存可读，不清空或迁移旧记录。

单记录 1MiB、总量16MiB、2048文件；实际 UTF-8/base64 编码后检查，意图先预留最大结果空间。结果超限/写入故障保留可读未确认意图，释放持有资源；部分生效不自动重试。日志目录损坏、外部改变、容量不足或权限问题时停止新动作；退出脚本后先备份整个目录再人工检查/归档，不按路径删除未知文件，也不把历史当跨会话所有权。

## 已修复问题与失败证据

1. 端口最后资格回调改变库存后仍可进入清除。真实生产端口替身复现，新增最后捕获 ped 的库存/当前武器和双身份核对；原故障序列通过。保留 `actions-port-depth-candidate` 与 `actions-port-final-guard-fix`。
2. 旧日志校验允许将 intent 原字节复制成 result，未确认数错误归零。严格阶段/字段/版本配对修复，独立同一用例由失败转通过；v1/v2正常混存通过。
3. 先前无限请求使 Suspend 覆盖部分恢复结果；外层 catch 又覆盖结果写失败的原 IOException。现追加一次持续效果提示，保留已完成步数、可能修改、未回滚和原始异常。独立两条红例原样通过。
4. GDI 初次首页选中行过长，无法完整显示即拒绝确认。缩短行与页脚，完整风险保留在二次确认；扩展为所有可达页每行，中文是/否、未知、条件恢复和动态纹理预算通过。
5. 轻量池预览此前会丢弃深读详情，已改为保留同库存的选定详情。实际脚本测试初次颜色失败还包含夹具错误：把键盘 Right（默认下一分类）当数值增加。失败日志保留；使用实际 Add/+ 映射并核当前页、草稿和 setter 后通过，不把夹具修正冒称产品故障修复的原样对照。
6. 初次 GDI 重跑使用了错误项目文件名，未执行测试；首个 IL 脚本未解析编译器嵌套类型，造成错误失败，修复解析后37项通过。这些失败尝试保留，未算产品通过。独立首次归档也正确发现菜单在测试后变化，重新绑定同一 Script5 夹具后才封存。
7. 首轮本阶段冻结将正在写入的自身输出日志纳入哈希，被Windows文件锁拒绝；当轮ZIP/DLL/日志以 freeze-attempt-1 保留，不当作成功manifest。排除本次打开的输出日志后重建归档并逐项复核。早期端口红日志没有该时点完整源码快照/SHA，因此仅作为失败过程记录；不能声称它具有独立审查红绿夹具同等的精确绑定证据。

独立原红例、生产候选 SHA、实际文件及原样修后结果在私有 `weapon-review-0.1.84` 归档；摘要与摘要哈希进入本阶段 manifest。旧版本证据不重写。

## 最终软件验证

| 组 | 本次结果 | 真正覆盖的层与替身 |
| --- | --- | --- |
| 新动作核心 | 70 断言 | 实际 controller/menu/Journal；真实 v1/v2文件、预算、复制intent、句柄释放；游戏 port/部分故障为替身 |
| 新动作 SDK 端口 | 295断言 / 21组 | 实际 port+controller；GTA对象、named-native和Journal边界替身；最终资格、未知诊断、最大计数、真实Stopwatch超时 |
| 实际 Script 链 | 新46项；既有输入99、玩家51、武器61项 | 实际 Script/菜单/controller/weapon port/reader/持久Journal；GTA宿主、输入、原生调用和绘图替身，不是物理手柄 |
| 旧武器核心 | 89断言 | 实际旧 controller/bridge/Journal，包含真实v1文件；未改原历史文件 |
| 旧武器端口 | 168断言 | 真实旧 port，GTA调用替身 |
| 新菜单 GDI | 1044项 | 实际 .NET4.8 ChinesePanel和菜单，离线sprite接收端；四张图、所有行和1000帧纹理预算，不是游戏截图 |
| 独立审查 | 19+9+6+5 | 真实 controller/Journal、实际 Script 链；故障注入及实际文件，源前后SHA相同，2类产品问题修后无遗留失败 |
| 最终 DLL 接线 | 37项 | PE/IL元数据辅助核对真实路由与typed入口，不单独证明行为 |
| 固定SDK编译 | 0警告 / 0错误 | net48 / x64 / SHVDNE v1.1.0.6固定DLL，未升级依赖 |

这些计数各自表示软件检查，不相加为游戏验收。GDI项目保留 NU1900（漏洞审计源网络不可达），不是已通过依赖安全审计。历史 ACL 与三种符号链接权限不足分支未因此变成通过；本阶段未重跑无关世界/车辆全套来累加计数。旧武器核心本次新 GUID 实际文件仍由旧测试写到 `0.1.83-stage6-fixtures` 前缀，84 manifest另列本次文件清单；前缀不表示受测DLL版本，旧文件未覆盖。

从应用工程目录 `gems/` 运行：

```powershell
dotnet run --project native/game-assistant/tests/weapon-actions-core/WeaponActionsCoreCheck.csproj --no-restore
dotnet run --project native/game-assistant/tests/weapon-actions-port/WeaponActionsPortCheck.csproj -c Release --no-restore
dotnet run --project native/game-assistant/tests/input-flow/InputFlowCheck.csproj --no-restore
dotnet run --project native/game-assistant/tests/weapon-core/WeaponCoreCheck.csproj --no-restore
dotnet run --project native/game-assistant/tests/weapon-port/WeaponPortCheck.csproj -c Release --no-restore
dotnet run --project native/game-assistant/tests/weapon-actions-visual/WeaponActionsVisualCheck.csproj --no-restore -- native/game-assistant/artifacts native/game-assistant/artifacts/0.1.84-stage7-new-gdi-fixture
dotnet build native/game-assistant/GEMS.GameAssistant.csproj -c Release --no-restore
pwsh -NoProfile -File native/game-assistant/tests/verify-stage7-wiring.ps1
```

清洁构建须先按 BUILDING.md取得并校验固定SDK及还原依赖；`--no-restore`不能替代首次还原。最终精确源码、DLL、日志和图片以 `artifacts/0.1.84-stage7-manifest.json` 绑定。

## 游戏内验收门槛

使用明确兼容的Enhanced故事模式、用户有权使用的原版及MOD样本，记录游戏/SHVDNE/ScriptHookV和资源版本。确认实际加载后，验证四种无限请求在射击、换弹、共享池和切武器中的效果；退出/失焦/重载后核真实持续效果，显式关闭不是恢复原始配置。组件须核真实外观、互斥件、活动及弹药影响；条件恢复要再对照原有武器和已观测状态。清除须在用户接受其不可完整撤销及可能保存副作用的测试状态下明确执行，再核持握、库存、原有/MOD武器及日志，不自动重装或改存档掩盖结果。

本环境未执行这些步骤。全部实际加载、使用、恢复和共存结论保持待实测，任意组件涂装仍未完成，整项目验收未通过；不进入正式开源申请提交。
