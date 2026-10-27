# 0.1.83 武器库存与条件动作开发检查点

本阶段接入真实菜单、统一输入分发、固定 SDK 武器端口和独立武器目录。这里只完成原需求第26节的一部分源码路径与软件验证，未完成全部六项武器功能，更没有通过 Enhanced 游戏内验收。gameValidationStatus 仍为 not-tested，desktopInstallationAllowed 仍为 false。

## 需求对应与可用开发路径

原需求 REQ-01 第26节（原文1759–1788行）要求获取武器、弹药、清空武器、无限弹药、配件管理、已安装 MOD 武器查找。本阶段落实：

- “武器库存与目录”是现有菜单的第7个分类。键盘及 GTA 逻辑手柄沿同一个真实 DispatchCommand：刷新、当前库存、运行定义、GEMS目录、本实例记录、五条分页、名称/hash搜索、详情、补弹调值、二次确认与取消。空输入或取消保留搜索，独立“清空搜索”执行清除。名称缩略，详情优先显示完整八位hash；目录完整来源与问题写本地日志。
- 库存通过当前 Ped.Weapons.GetAllWeaponHashes 枚举，并对每个条目核对 HasWeapon、槽位、当前武器、弹药类型/池/上限/弹匣、颜色及配件状态。空、重复、超限或矛盾不是可信空库存。前后两份已观测字段快照一致才创建动作预览。
- 运行定义来自固定 SDK 的 Weapon.GetAllWeaponHashesForHumanPeds，当前候选还需 IsWeaponValid 与 WeaponAsset.IsValidAsWeaponHash。它们是引擎运行时观测，不代表 MOD 来源、加载效果或版本兼容通过。公开 SDK 部分枚举本身依赖其内部内存实现；GEMS没有复制该实现或升级 SDK。
- 新增为单项 Give(hash, 0, false, false)，不主动装备。只允许未持有、槽位未占用、可确认的非零弹药类型、原池为0且没有原有共享成员的候选。资源请求非阻塞，最长5秒；等待帧只检查会话和资源，提交时再完整检查定义、源、快照、日志和资源。意图记录后若资源失效仍拒绝 Give。
- 补弹为一次性正量 ADD_AMMO_TO_PED，1..10000且不超同弹药池全部已持有成员的共同余量；所有共享读数必须一致。预览显示数量与共享成员数。没有使用会在目标不存在时隐式 Give 的 Ammo/AmmoInClip setter。
- 条件移除仅限当前脚本实例成功读回并记录的新增项，同 actor/epoch、来源、已观测后状态仍相符、没有新共享池成员且目标非当前武器。只调用 Remove(hash)。不主动调用清空原库存/未知弹药的接口；实际读回仅覆盖已观测字段，原生副作用及未知字段不作保证。移除后仍有残余弹药池时明确保留，不称完整恢复。

清空现有武器、无限弹药、配件修改、任意候选无条件发放及人物生成仍未实现。不存在把这些要求改成占位“通过”的结论。

## 目录合同与独立证据

车辆 catalog.json 保留原合同；武器使用 weapon-catalog-v1.json，schemaVersion=1，component=GEMS.WeaponCatalog，protocol=gems.weapon-catalog.v1。严格 reader 拒绝额外/重复字段、坏编码、未知枚举、重复标识/hash、名称/hash不符、非法路径、超量字段、超过2000条/2MiB，以及 verified 却缺少 transactionId 的记录。

原生端独立取得 Process.MainModule 的 GTA5_Enhanced.exe 父目录；使用只读 Win32 目录句柄取得实际根并拒绝重解析/链接等异常。目录字段不能自己证明身份。规范化仅处理 Win32 前缀、分隔符和非根尾分隔；所有大小写和Unicode码点保留，不做NFC或大小写折叠。实际宿主根与包内根和UTF8 SHA256都须相符。无法取得实际身份时拒绝 GEMS目录动作，库存/运行定义仍可单独读取。

每个目录动作绑定 revision 和完整文件字节 SHA256；同修订改字节、换根、记录消失或文件状态不再 verified 都拒绝。registration=not-registered、dependencies=missing硬拒。unknown不自动升级成“已注册”：在根、文件状态、当前运行定义与资源等独立证据相符时，才允许明确预览的条件动作；仍提示未知依赖可能失败，效果尚未验证。

## 恢复、连续性与真实限制

动作前在 LocalAppData/GEMS/game-assistant/weapon-actions-v1 写入不可变意图（已观测前快照和来源），刷盘并读回；持有该文件句柄直到写入结果，禁止覆盖/替换意图。失败文件保留，不按路径删除未知文件。结果包含已观测后快照或不可确认及部分结果说明。审计未确认数与当前会话失权数分别显示，不能因写了 unknown-partial 结果就把问题计数清零。

记录不是跨脚本重启的武器所有权凭据。失焦、暂停、故事守卫拒绝、actor/model/address变化、已观察到的epoch中断或异常都会撤销旧预览/等待及条件移除资格，保留记录。F5隐藏取消待提交武器请求；玩家移动请求仍按Stage5保持，不混用两种行为。守卫失败时不为资源清理继续调用 Native；因此中断后的资源释放也不能声称已完成。

补弹不自动扣回已消耗或捡取的弹药。API抛错可能发生在改变之后，结果日志也可能失败；此时停止后续动作、保留未确认，不重试 Give 或称原子回滚。同hash、同状态的外部移除重建/接管无法通过这些getter区分，条件账本不是绝对归属证明。游戏引擎与其他MOD不受本工具事务锁控制。

任一特殊武器 GET_MAX_AMMO 返回false，会使本次完整库存读取失败并阻止写入；不能假设近战/特殊武器总返回成功。未知弹匣状态显式保留 ClipKnown=false；补弹及新增所有权确认要求已知弹匣，不能把unknown当0。AmmoType=0不允许本阶段新增或补弹，但不会被偷偷从库存删除。组件枚举记录的是固定SDK getter提供的hash及Active值（其底层为是否拥有该组件），不代表另一个独立的运行active判定；组件涂装/livery和未暴露字段没有完整恢复合同。移除预览直接说明该限制，记录比较不能辨认这些外部修改。实际特殊武器影响仍待游戏样本验证。可信上限：库存512、运行定义4096、单项配件512、弹药读数1000000。

记录目录上限2048文件、单文件1MiB、总量16MiB；读取同时核对实际累计字节，写入前检查容量，动作前预留意图及最大结果文件空间。超大意图在创建文件前拒绝；若修改后结果过大，保留可读取意图与未确认状态，不发布自身不能读取的结果。损坏、文件外部变化、占用、权限拒绝或容量不足时停止，原件保留。先退出脚本并备份整个记录目录；人工检查或归档后重新启动，再主动刷新。不会自动清理历史，也不根据旧意图“恢复”游戏库存。

## 实证问题与修复

1. 严格 reader 的目录只用 FILE_READ_ATTRIBUTES 并不能阻止 Windows 重命名，独立实际目录移动复现后改为 GENERIC_READ与不共享写入/删除，实际测试确认读取期间无法改名。真实hardlink/junction、独占锁、长Unicode路径均有独立夹具。
2. 持久意图写入期间资源失效，旧路径仍可能 Give。保留 weapon-port-before-fix；修复 controller意图后与端口最终写前两次Loaded检查，原样失败序列通过。
3. 实际 .NET Framework 4.8 对空HumanName执行 StringInfo.SubstringByTextElements(0,0) 抛错，net8初测未暴露。保留 gdi-before-fix；空名现显示“名称未提供”，真实4.8 GDI原场景通过。长名一度挤掉完整hash，保留before-hash-fix图片；详情将hash放首列并缩短显示名。
4. 实际脚本的输入快照之后失焦、当帧没有命令或待发放请求时，旧武器预览/所有权未撤销。保留 flow-focus-before-fix；脚本追加最后输入资格检查，控制器对预览和有效账本持续观察会话。原序列及同actor返回均拒绝旧移除资格。

5. 真实Journal边界复现允许的128项库存各含512组件使意图超过1MiB，而旧写入端不限制，随后自身reader无法读取。保留journal-budget-before-fix；现单条/总量在写入前受限，结果过大保留unknown，实际文件夹具验证历史可读。归档首轮ZipArchive在写完entry后设置时间失败，只有首项的ZIP/manifest以incomplete保留；最终归档逐entry与源码摘要比对，不能把该失败产物当交付。

## 软件验证与证据范围

最终源码、DLL、各组命令和结果绑定 artifacts/0.1.83-stage6-manifest.json。各组不是游戏验收计数，不能相加当作实机通过：

| 组 | 结果 | 实际执行与替身范围 |
| --- | --- | --- |
| 严格目录 | 291断言/14组 | 真实生产reader、固定SDK纯托管hash、真实Win32文件/目录；真实.NET4.8读取TS producer，与Node实际路径向量交叉；没有GTA调用 |
| 控制器/日志/bridge | 89断言 | 真实生产controller/菜单/目录门禁及文件日志；游戏port为状态夹具。实际文件锁/变化/目录阻塞/2049文件/结果写入失败及重读；注入IO故障不是物理断电实证 |
| 武器SDK端口 | 168断言/14组 | 真实GtaWeaponPort与controller，GTA对象与named-native入口替身；边界故障、共同弹药上限、资源失效原样复测 |
| 实际脚本武器链 | 61项 | 真实GemsAssistantScript、WeaponMenu、controller、SDK port、reader/日志；GTA宿主/输入/原生调用/图形输出替身；菜单键盘/逻辑手柄路径、搜索/分页/来源变更、部分失败 |
| 关联输入/移动 | 99 / 51项 | 真实既有脚本分发和玩家controller/port，环境替身；新增第7分类后仍覆盖重映射、车辆/世界子页、F5运动保留与旧5条移动故障 |
| 武器GDI | 1010项 | 真实.NET4.8 WeaponMenu/ChinesePanel栅格化，离线sprite接收端；长名、完整警告、不可读拒绝、1000帧动态值不增纹理；图片不是游戏截图 |
| 既有纯逻辑核心 | 721项 | 玩家/世界/车辆/输入关联逻辑，无游戏调用；保留既有ACL及3种symlink权限不足分支未执行的限制 |
| 固定SDK构建 | net48 DLL | 0源码警告/错误；SDK引用校验见BUILDING.md；测试GDI还原包审计可能报NU1900网络不可达，不等于依赖安全审计通过 |

从应用工程目录 gems/ 运行（不是外层仓库根）：

    dotnet run --project native/game-assistant/tests/weapon-core/WeaponCoreCheck.csproj -c Release
    dotnet run --project native/game-assistant/tests/weapon-port/WeaponPortCheck.csproj -c Release
    dotnet run --project native/game-assistant/tests/input-flow/InputFlowCheck.csproj -c Release
    dotnet run --project native/game-assistant/tests/weapon-visual/WeaponVisualCheck.csproj -c Release -- native/game-assistant/artifacts native/game-assistant/artifacts/0.1.83-stage6-visual-fixture
    powershell -NoProfile -File native/game-assistant/build.ps1

目录reader的真实hardlink/junction用例需要当前Windows令牌具备相应操作权限；创建失败必须报告未执行/失败，不将其他链接类型代替。其独立命令及.NET4.8交叉见 tests/weapon-catalog/README.md。没有修改系统策略，也没有部署DLL、启动游戏或写游戏目录。

## 实机验收仍需完成

在明确兼容的Enhanced故事模式，使用有权使用的代表性原版和MOD样本，记录游戏/SHVDNE/ScriptHookV/资源版本。先核目录来源和运行定义，执行每种允许的新增/补弹，离开模态菜单后确认实际持握、模型、射击与弹药行为；验证共享池、特殊武器、现有配件和其他MOD未受观察到的影响。然后在满足条件时移除，核原库存、配件和残余池；中断/暂停/失焦/换角色后应拒绝旧资格。日志/截图/录像须来自实际游戏。

当前没有上述证据。不得把目录匹配、SDK返回、读取到对象、DLL编译或离线图片当游戏加载、效果、卸载或恢复通过；整项目验收仍未完成。
