# 0.1.82 玩家移动请求开发检查点

本阶段修复 0.1.81 已知的超级跳跃连续性失败，并接入玩家跑步／冲刺和游泳倍率的真实菜单、统一输入分发与固定 SDK 调用。**尚未通过 Enhanced 游戏内加载和效果验证，桌面安装许可仍为 false。** 这不是整项目验收完成，也不表示第23节玩家功能全部完成。

## 需求与当前行为

原需求 REQ-01 第23节（R023 / F039）列出11项玩家功能，并要求每个开关真实读取或确认状态。本阶段对应“超级跳跃”和“移动速度调整”：

- 跑步／冲刺、游泳各有请求开关及0..1.499倍率。确认键切换，已映射的加减动作调值；默认请求关闭、倍率1.000，调值不自动开启。键盘和GTA逻辑手柄都走现有生产 `DispatchCommand`。
- 倍率显示的是本助手保存的请求值，开关显示本助手是否继续提交。提交成功提示仅表示 SDK 调用返回，不是引擎最终生效读数。
- 关闭菜单（默认F5）只隐藏界面，合规请求继续；菜单打开仍按Stage4规则模态捕获输入，因此需关闭菜单后观察运动效果。“停止本助手移动请求”停止三项请求。
- 暂停、失焦、故事守卫拒绝、目标角色身份或连续会话变化、动作异常、脚本退出均撤销旧请求。相同角色恢复后需要重新启用。暂停检测沿用SDK `Game.IsPaused`，前台资格沿用实际窗口PID检查。
- 每次调用重新检查资格、玩家身份和本端口连续epoch。已观察到一次中断便失效，不能因为Ped再次相同而复用旧会话；这不是与游戏引擎的原子事务。
- 跑步已提交而后续游泳／跳跃调用失败时，记录哪些调用已返回，明确失败调用也可能已生效，停止后续请求，不声称当前帧回滚。完整异常写本地日志，界面只放有界提示，避免长异常阻断操作确认。

现有生命、护甲、通缉、无敌、隐身和坐标功能保留。无限体力仍缺可靠写入合同，完整故事主角切换仍未实现；这两项保持禁用，不增加占位式“完成”功能，不把人物模型替换当故事主角切换。

## 固定 SDK 与恢复边界

使用既定 SHVDNE v1.1.0.6 / API3 / .NET Framework4.8，发布包和参考DLL哈希见 `BUILDING.md`。没有升级依赖、添加数值Native hash、复制内部内存读写或写入游戏目录。

捆绑XML明确 `Player.SetRunSpeedMultThisFrame(float)` 和 `Player.SetSwimSpeedMultThisFrame(float)` 的逐帧合同，以及0、1、1.499的最小／默认／最大值。固定DLL仅截上界，GEMS因此在生产入口额外拒绝负数、NaN、无穷及越界值。

没有可靠的当前有效倍率getter。关闭只停止本助手未来的逐帧请求，**不写1.0冒充恢复原值**，也不恢复其他脚本的未知倍率。停止不撤销已发生的跳跃或本帧已提交调用。外部脚本同值接管、同帧覆盖、真实引擎停止行为仍须实测。

## 实证失败与修复

1. 0.1.81原始失败：外层检查通过、输入读取后守卫拒绝，内层 `RequireContext` 抛错；旧Tick catch只暂停输入，跳跃请求仍开，同actor恢复会续跳。旧故障日志和源码哈希由项目私有验收目录封存。0.1.82先对原样故障程序复跑，观察到Enabled=false、调用0；旧程序因“未能再复现故障”按其原设计抛错，不能把这个exit标为测试PASS。随后生产脚本行为测试改用正向安全断言，并覆盖失焦、暂停、跳跃调用异常和输入后角色改变。
2. 新端口初测发现零地址会话、二次读取实体死亡、二次getter异常未失效epoch；保留 `player-port-before-fix`，修复后原样复测。
3. 新端口最后资格回调改变角色、Toggle第二次session读取把旧角色请求带给新角色；保留 `player-port-race-before-fix`，增加最后目标核验及两次会话一致性，原样复测通过。
4. 实际GDI发现最初的跑步长标签不可完整显示，无法获得执行确认；缩短标签后复测。完整异常移出绘制文本，实际长异常及恢复操作仍可读。动态纹理测试首次把尚未出现的静态提示字计为增长；补齐静态提示预热后验证1000次变化不增加纹理路径，不能把这一测试前置不足描述成生产缓存泄漏。

故障日志保留在 `artifacts/0.1.82-stage5-*`，不覆盖Stage1–4的版本化证据。

## 本次验证

最终分组路径、源码、DLL和源码包身份见 `artifacts/0.1.82-stage5-manifest.json`。各组不能相加当作游戏测试：

| 组 | 结果 | 实际范围 |
|---|---|---|
| 原生核心及移动规则 | 721断言通过 | 原有682关联断言加本阶段39；4类既有ACL／符号链接权限分支仍未执行，详见日志；纯逻辑／文件测试，不运行GTA |
| 生产脚本链 | 输入关联98＋新增移动51断言通过 | 直接编译实际Script、输入router/editor/store、移动controller/port/menu；GTA宿主、实体、输入快照、绘制、世界和车辆端口为替身；包含真实键盘/逻辑手柄菜单、F5隐藏、明确停用、五个旧失败边界、部分提交和车辆speed隔离 |
| 玩家SDK端口 | 256断言／19用例，0失败 | 实际GtaPlayerMotionPort及controller；GTA返回与typed调用记录为替身；参数、身份、epoch、二次读取及提交失败 |
| 玩家绘制 | 1013断言通过 | 实际PlayerMenu／ChinesePanel／MenuRaster Windows GDI；SDK精灵端口为替身，含1000动态帧、最长状态、长异常、守卫中断后重开菜单；截图不是游戏截图 |
| 最终DLL辅助接线 | 45项通过 | PE／IL元数据与typed SDK调用点，补充上述行为证据，不代替行为或游戏实测 |
| 生产DLL构建 | 0警告／0错误 | 固定SDK net48；GDI测试构建另有NU1900漏洞端点不可达警告，不能称安全审计通过 |

独立审查另运行实际Script/controller/port夹具，结果与生产SHA由项目私有验收报告保存。本阶段未重新执行未变的全部世界端口／输入文件恢复组合，其历史证据继续保留；不能改标为本次全部重测。

## 构建与复测

从 `gems/` 应用工程根目录（含package.json和native目录）运行：

```powershell
dotnet build native/game-assistant/GEMS.GameAssistant.csproj -c Release
dotnet run --project native/game-assistant/tests/GEMS.GameAssistant.Tests.csproj -c Release
dotnet run --project native/game-assistant/tests/input-flow/InputFlowCheck.csproj -c Release
dotnet run --project native/game-assistant/tests/player-port/PlayerPortCheck.csproj -c Release
dotnet build native/game-assistant/tests/player-visual/PlayerVisualCheck.csproj -c Release
native/game-assistant/tests/player-visual/bin/Release/net48/PlayerVisualCheck.exe <独立截图输出目录> <全新专用夹具目录>
pwsh -File native/game-assistant/tests/verify-stage5-wiring.ps1
```

core测试中的旧 `FrameRequest` 小模型检查属于历史回归，生产脚本已改用 `PlayerMotionController`；不能拿旧模型结果作为新接线证明。玩家端口和绘制测试的源码都直接链接生产文件。

## 仍待真实游戏验证

需要记录目标Enhanced可执行版本／hash、ScriptHookV／SHVDNE版本、存档、现有模组和样本，确认本DLL实际加载并进入故事模式。逐项观察跑步／冲刺和游泳的默认、最小、最大倍率，关闭／重新启用、关闭菜单、暂停／失焦、死亡／加载／换主角以及与已有模组共存的效果。检查超级跳跃启停、拒绝后不自动恢复、退出卸载及文件恢复。

如果实机显示SDK逐帧效果的停止行为不符预期，应保留失败并重新查明合同，不能强写默认值掩盖。无限体力、完整主角切换、实际加载／使用／卸载恢复仍未完成，R023/F039和总项目继续保持部分实现／待实测。
