# 0.1.79-dev.1 原生助手：基础与玩家链

本记录对应 `artifacts/0.1.79-stage1-manifest.json` 的源码、DLL 与测试摘要。属于开发检查，不是游戏验收；DLL 未部署到 GTA V，`gameValidationStatus` 仍为 `not-tested`，桌面安装仍禁用。0.1.78 原始证据及归档没有覆盖。

## 本组修改与原因

| 问题/原功能 | 本组处理 | 验证与边界 |
| --- | --- | --- |
| 超过8行时选择落到屏幕外 | 8行视窗随选中项移动；切换分类/目录修订后撤销旧绘制确认 | 11/16行的滚动、环绕、缩减、空列表；Windows GDI 12/16行末项图像。真实游戏绘制待测 |
| F5、Enter 长按重复切换 | 仅按下边缘触发；KeyUp不依赖游戏守卫，允许时修复丢失的松键状态 | 持续按住、不同键、重复松键、校准 |
| 动态中文/数值耗尽整页纹理 | 固定背景加稳定字形纹理，最多2048个字形（含fallback）；文件名跨脚本重载复用 | 1万组动态数值不增加字形；200帧实际面板代码的GDI绘制不增加路径。SDK实际GPU占用/性能待测 |
| 缓存耗尽/截断时仍可执行看不见的条目 | 仅对完整绘制、未禁用、key/标签/值仍一致的条目接受执行 | fallback、超长、旧值和改分类均拒绝；超长车辆名称可能暂时无法执行，不能假称完整搜索/展示已实现 |
| 无敌恢复不绑定角色且可能覆盖他人修改 | 记录player/ped handle、模型、内存地址、原值和最后写入；恢复前重查守卫/身份/当前值 | 只恢复可确认的本助手布尔改动；目标改变不写到新角色；异常保留记录，失败重试限频 |
| 关闭开关setter写入前抛异常后丢恢复信息 | 关闭走条件恢复路径，不提前抹掉最后成功写入记录 | 部分写入、写入前失败、读回不匹配均有失败后复测 |
| 守卫检查提前知道网络/加载仍继续读取角色 | 顺序短路探测；拒绝后仅清本地状态，不为恢复/取消继续调用实体API | 分支探针和原64组合；没有以离线测试冒充网络/故事实测 |

## 玩家11项当前状态

| 原始项 | 本组代码行为 | 验收状态 |
| --- | --- | --- |
| 无敌 | 读取、切换、条件恢复 | 已实现开发路径；游戏待测 |
| 恢复生命 | 验证正的MaxHealth后写入并读回；死亡守卫拒绝 | 已实现开发路径；游戏待测 |
| 恢复护甲 | 采用实际MaxArmor，验证0..65535；不是固定100 | 已实现开发路径；游戏待测 |
| 清除通缉 | SDK Wanted.SetWantedLevel(0,false)，ApplyWantedLevelChangeNow(false)，读回 | 已实现开发路径；游戏待测 |
| 调整通缉 | 0..5；选中该项按+/-调节，Enter循环；溢出安全 | 已实现开发路径；游戏待测 |
| 无限体力 | 菜单禁用且明确接口待验证 | 未完成：只有Native名称，不猜参数 |
| 超级跳跃 | 受当前角色身份与守卫约束的SetSuperJumpThisFrame；拒绝/换角色后停止，不自动重新开启 | 已实现请求路径；游戏高度/关闭效果待测 |
| 移动倍率 | 菜单禁用，标明恢复契约待验证 | 未完成：typed方法可调用，但没有原倍率getter，不能强置1.0覆盖其他MOD |
| 隐身 | Ped.IsVisible反向显示，记录并条件恢复可见性 | 已实现开发路径；游戏待测；不声称NPC感知失效 |
| 人物切换 | 明确故事主角切换未实现 | 未完成；不以ChangeModel代替完整主角状态切换 |
| 坐标 | 菜单独立信息行显示真实Position的X/Y/Z，不遮盖错误提示 | 已实现只读路径；游戏变化/性能待测 |

仅“无敌”和“可见性”有原值条件恢复；额外的“恢复本助手可恢复开关”会停止超级跳跃请求。生命、护甲、通缉等一次性操作不假称自动回退。F5关闭只是隐藏菜单，已启用的开关继续作用；需要关闭开关或选择恢复。无法识别其他脚本对完全相同布尔值的写入。角色变化、守卫拒绝、强制进程终止或游戏崩溃时不能保证原状态恢复，日志保留未执行/失败说明。

## 可重复离线检查

固定SHVDNE归档与API DLL的SHA-256仍由 `build.ps1` 校验；本组使用相同编译引用，没有新增包。编译前参考包已缓存。最初NuGet漏洞数据网络不可达；本组离线restore使用 `-p:NuGetAudit=false`，不构成依赖漏洞审查证据。

```powershell
dotnet restore GEMS.GameAssistant.csproj --ignore-failed-sources -p:NuGetAudit=false
dotnet build GEMS.GameAssistant.csproj -c Release --no-restore
dotnet run --project tests/GEMS.GameAssistant.Tests.csproj -c Release --no-restore
dotnet restore tests/visual/VisualCheck.csproj --ignore-failed-sources -p:NuGetAudit=false
dotnet build tests/visual/VisualCheck.csproj -c Release --no-restore
./tests/visual/bin/Release/net48/VisualCheck.exe
```

纯C#测试会明确报告当前会话无法建立符号链接的额外1项；原有75项历史结果仍独立保留。视觉夹具编译实际 `ChinesePanel.cs`/`MenuRaster.cs`，仅把GTA绘制端口替换为Windows GDI；不执行SHVDNE Native、不验证游戏加载。三张图已人工查看，中文、禁用灰色行、12/16末项和第8槽高亮均可见。

## 实机最短验收链

在兼容的 Enhanced 故事模式测试存档中，记录EXE、ScriptHookV、SHVDNE与本组DLL的版本和hash；先取得真实脚本加载日志与菜单截图。逐项检查原值→操作→读回→可见效果→关闭/恢复；无敌要验证受伤，超级跳跃要比较高度并关闭复测，隐身要看角色显隐，通缉要看星级和警察行为。长按F5/Enter、切换角色、死亡/加载、其他MOD修改同一状态、脚本卸载均需验证没有串目标或强行覆盖。菜单滚动到最后一项并长时间显示坐标，记录帧率/显存/错误日志。最后退出、按归属安装记录卸载助手，再进故事模式确认其他MOD与游戏状态。

上述真实游戏步骤尚未执行，因此本组不能写“本轮验收通过”。
