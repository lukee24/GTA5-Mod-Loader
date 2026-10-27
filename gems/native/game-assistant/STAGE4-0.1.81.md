# 0.1.81-dev.1：输入与映射软件检查点

原需求第32节的现有菜单键盘/手柄操作、重映射、冲突提示、保存与恢复已接入生产脚本。这里记录软件验证；**没有启动游戏、部署脚本或测试物理手柄**。`gameValidationStatus=not-tested`、`desktopInstallationAllowed=false`。不能据此判定完整 F044、实际模组加载或本轮项目验收通过。

## 原需求与实际路径

| 原文条目 | 本版路径 |
| --- | --- |
| 所有修改器菜单支持键盘操作 | `GemsAssistantScript.OnKeyDown → OnTick → InputRouter → DispatchCommand`；现有玩家、车辆子页、世界子页、生成分页、收藏与输入页共用分发。 |
| 快捷键可以修改 | 最后一个“输入与映射”分类；选择槽位录入，松开全部按键形成预览，应用前仍使用旧映射。 |
| 快捷键冲突检测 | 固定槽位及键名验证；内部相同弦和包含关系拒绝，已知系统保留组合拒绝。其他 MOD 没有统一绑定登记表，外部冲突显示未知。 |
| 手柄打开、分类、选择、返回、调整数值 | 同一分发与可见确认机制；使用固定 SDK 的 GTA 逻辑控制，尚未验证具体硬件。 |
| 不默认占用易冲突组合 | 手柄打开组合默认未绑定；明确配置至少两键。默认未占用的 LT+RT 可作为候选；LB+RB 与分类操作有前缀冲突，明确拒绝。 |
| 映射保存与恢复 | 应用保存不可变版本；上一版/默认先预览再保存；损坏尾部显式预览、两次确认、隔离保留并恢复最后可信版本。 |

F5、Alt+G 的原菜单开关作用保持为可改的主/备用绑定。它们仍打开同一个完整菜单；第31节独立快捷中心及自定义快捷动作未实现。鼠标、资源搜索、摄影、传送、人物/武器等未完成范围不因本版输入基础而完成。

## 操作与恢复

1. 用实际生效的打开键呼出菜单；默认 F5 或 Alt+G。左右分类到“输入与映射”。
2. 选择一个键盘或手柄槽位，按当前执行键开始录入。先松开原输入，再按新组合并全部松开。键盘支持列明的字母、数字、F1–F12、导航键及 Ctrl/Alt/Shift；每弦最多四键。
3. 录入期间长按当前“返回”组合1秒取消，15秒无完整录入也取消。短按返回可以作为待验证的新绑定候选；不支持的键立即显示错误。
4. 预览不会生效。可选“取消预览”，或在冲突检查通过后“应用并保存映射”。保存与回读成功后才切换实际映射，并要求释放后重新按下。
5. 上一版和默认恢复也先预览、再应用；不会删除历史。手柄打开及备用键可用当前减值动作预览清空；主要键盘入口不可清空。
6. 文件损坏或保存结果未知时保持内存中的旧映射，使用“重新读取磁盘映射”确认真实状态。启动读取失败时仅临时使用默认映射，并明确显示错误，不重置文件。
7. 损坏历史可在“预览损坏记录恢复”查看隔离数量和最后可信版本摘要；完整计划文件名/指纹写入日志。再次执行才移动原记录到专用恢复目录。移动后原字节保留，恢复中断必须重新预览后继续；无法确认的外部对象不删除。

运行时配置位于 `%LOCALAPPDATA%\GEMS\game-assistant\input-mappings-v1`。仅将来用户显式运行脚本后使用此路径；本阶段测试只写独立夹具。存储有512版本、512恢复目录上限；超限明确停止，不自动截断或清空。权限/锁定/外部改动阻塞保留原文件；不能读的文件不能凭猜测恢复。

## 输入保护与明确边界

- 键盘轮询不产生动作。必须收到 SHVDNE 的新 `KeyDown`，并与当前按键组合匹配；保留 SDK 暂停按键事件的行为。
- 两设备共用每帧最多一个动作及释放屏障。设备切换、失焦、暂停、故事守卫拒绝、目标身份变化和文本输入中断均清旧确认；恢复后必须观察释放。旧按住键及系统重复事件不能形成第二次危险确认。
- 所选条目、操作提示和映射帮助必须完整绘制才授权执行。恢复警告不可读时同样清除旧恢复确认，不能用通用提示替代未读计划后继续恢复。
- 前台PID通过 Windows 只读窗口查询；`Game.IsPaused` 为 SDK 暂停菜单状态。最终分发再次检查输入资格与目标身份。
- 打开菜单/录入时使用固定 SDK `Game.DisableAllControlsThisFrame()` 的每帧模态请求。此时不同时驾驶、移动或开火；关闭后观察功能。失焦/暂停/守卫拒绝后不再提交，不调用 `EnableAllControlsThisFrame`。这是输入抑制，不是冻结世界。
- 自有颜色/车牌文本调用由 busy/finally 释放屏障保护。无法可靠检测所有其他脚本的系统键盘或自定义文本框；不调用缺少独立查询契约的 `UPDATE_ONSCREEN_KEYBOARD` 干扰它们。外部文本框与手柄并用仍待真实共存测试。
- 手柄按钮指 GTA 前端逻辑控制，跟随游戏映射；不宣称 XInput/PlayStation/第三方设备或重映射工具已经测试。摄影相机输入将另行实现，不受本菜单模式代替。

## 本阶段验证与复测

最终源码、DLL、源码包及分组结果以 `artifacts/0.1.81-stage4-manifest.json` 为准；下面各组不能相加当成游戏测试。

- 原有核心关联检查：682断言通过。四类既有 ACL/符号链接权限分支未执行，保持明确记录；真实 junction 结果不替代这些分支。
- `tests/input-flow`：98断言通过。生产 `GemsAssistantScript.cs`、路由、编辑器及真实存储 Compile Include。GTA宿主、已有世界/车辆动作端口与绘制端口为替身；实际 `OnTick/DispatchCommand/Rows` 没有另写模拟控制器。覆盖实际菜单导航、预览取消、保存与恢复、损坏文件隔离、文本重入、同帧/长按/设备切换和不可读警告。
- `tests/input-port`：18断言通过。生产 `GtaInputPort` 和 Router，SDK返回与调用记录为替身；核对键码、设备持续采样、资格变化和模态抑制。不能证明真实硬件隔离。
- 世界端口关联回归：198项通过，GTA SDK宿主为替身。`GtaWorldPort` 生产实现保持上一检查点的语义。
- `tests/input-store`：389断言、29用例通过，0失败/0跳过；真实 Windows 文件、跨进程锁、junction、长路径、并发、失败及恢复中断。详见该测试目录 README。未测试断电后的物理持久性。
- `tests/input-visual`：1020断言通过。真实 `ChinesePanel/MenuRaster` 的 Windows GDI绘制，SDK精灵端口为替身；最长四键组合、实际恢复提示、原车辆/世界布局以及1000动态帧纹理预算。截图不是游戏截图。
- `tests/verify-stage4-wiring.ps1`：28项通过。最终生产 DLL 的 PE/IL接线检查，不加载游戏，不替代以上行为测试。

修复过程中保留了设备切换旧按压重放、导航前缀冲突、普通文件替换所有权、恢复记录超量遗漏、长路径、恢复警告确认等初始失败和复测证据。保存/恢复使用不共享删除的原文件句柄移动，禁止按路径误删或误移动外部替换文件。独立复核记录由项目验收目录保留。

## 构建与复测命令

从 `gems/` 应用工程根目录运行（含 `package.json` 与 `native/` 的目录）；SDK来源与固定哈希见 `BUILDING.md`，不升级依赖：

```powershell
dotnet build native/game-assistant/GEMS.GameAssistant.csproj -c Release
dotnet run --project native/game-assistant/tests/GEMS.GameAssistant.Tests.csproj -c Release
dotnet run --project native/game-assistant/tests/input-flow/InputFlowCheck.csproj -c Release
dotnet run --project native/game-assistant/tests/input-port/InputPortCheck.csproj -c Release
dotnet run --project native/game-assistant/tests/input-store/InputStoreCheck.csproj -c Release -- <全新专用夹具目录>
dotnet build native/game-assistant/tests/input-visual/InputVisualCheck.csproj -c Release
native/game-assistant/tests/input-visual/bin/Release/net48/InputVisualCheck.exe <独立截图输出目录> <全新专用夹具目录>
pwsh -File native/game-assistant/tests/verify-stage4-wiring.ps1
```

测试使用实际目录时保留所有夹具；junction权限不足需如实失败或标为未执行，不能改系统策略掩盖。NuGet漏洞数据网络失败警告不等于编译失败，也不是安全审计通过。

后续真实游戏门槛：确认精确 Enhanced/运行时版本后，以已授权样本在故事模式验证键盘与每种手柄、各菜单与重映射、关闭后控制恢复、已有 MOD 共存及文本框；确认实际模块加载、功能出现和操作效果。当前不部署，不写“本轮验收通过”。
