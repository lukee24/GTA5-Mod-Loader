using Gems.GameAssistant;
using System;
using System.IO;
using System.Linq;
using System.Drawing;
using System.Globalization;

var root = Path.GetFullPath(System.Environment.GetEnvironmentVariable("GEMS_VISUAL_OUT") ?? Path.Combine(AppContext.BaseDirectory, "../../../../../artifacts"));
Directory.CreateDirectory(root);
var fixture = Path.Combine(AppContext.BaseDirectory, "fixture-" + Guid.NewGuid().ToString("N"));
var panel = new ChinesePanel(fixture);
var count = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); count++; Console.WriteLine("通过：" + message); }
bool Draw(MenuRow[] rows, MenuViewport viewport, string notice, string title = "GEMS · 玩家")
{
    GTA.UI.CustomSprite.DrawnSprites.Clear(); GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42, 48, 61));
    return panel.Draw(title, "Enhanced 故事模式 · F5 / Alt + G · 未实测", rows, viewport, notice);
}
var labels = new[] { "无敌模式", "恢复生命", "恢复护甲", "清除通缉", "通缉等级 (+/-)", "无限体力：接口待验证", "超级跳跃持续请求", "移动倍率：恢复契约待验证", "隐身模式", "故事主角切换：未实现", "显示当前坐标", "恢复本助手可恢复开关" };
var rows = labels.Select((label, index) => new MenuRow("player:" + index, label, "", index != 5 && index != 7 && index != 9)).ToArray();
var view = new MenuViewport(); view.Reset(rows.Length);
Check(Draw(rows, view, "开发版本：未经过游戏实测"), "真实面板绘制代码可完整显示首项");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-player-first.png"));
view.Move(11);
Check(Draw(rows, view, "开发版本：未经过游戏实测") && view.First == 4 && view.VisibleSelection == 7 && GTA.Native.Function.LastMarkerY == 518, "第12项可见且高亮留在第8槽位");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-player-last.png"));
var sixteen = Enumerable.Range(1, 16).Select(index => new MenuRow("vehicle:" + index, "车辆功能测试行 " + index)).ToArray();
view.Reset(16); view.Move(15);
Check(Draw(sixteen, view, "16行滚动夹具：不代表车辆功能实现") && view.First == 8 && GTA.Native.Function.LastMarkerY == 518, "16行末项布局使用同一可见槽位");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-sixteen-last.png"));
var vehicleRows = VehicleMenu.Build(0, true, true, false, 0, true, "");
view.Reset(vehicleRows.Length); view.Move(16);
Check(vehicleRows.Length == 17 && Draw(vehicleRows, view, "车辆开发路径；实际游戏效果未验证", "GEMS · 当前车辆"), "实际车辆菜单17项末行完整显示");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-vehicle-last.png"));
vehicleRows = VehicleMenu.Build(0, true, true, false, 0, true, "performance"); view.Reset(17); view.Move(3);
Check(Draw(vehicleRows, view, "一次性设置不会自动恢复；再次回车确认。", "GEMS · 当前车辆") && vehicleRows[3].Label.StartsWith("确认"), "一次性改装确认使用实际菜单文本");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-performance-confirm.png"));
for (var page = 1; page <= 3; page++)
{
    vehicleRows = VehicleMenu.Build(page, true, true, false, 0, false, page == 3 ? "lights" : ""); view.Reset(vehicleRows.Length);
    Check(Draw(vehicleRows, view, "一次性设置不自动恢复；仅开关条件恢复", "GEMS · 当前车辆"), "车辆子菜单可见 " + page);
    GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-vehicle-subpage-" + page + ".png"));
}
var dynamicRows = new[] { new MenuRow("dynamic", "坐标 X=0.0 Y=-1.5 Z=100.2") };
view.Reset(1); Draw(dynamicRows, view, "X=0.0 Y=-1.5 Z=100.2");
var textures = GTA.UI.CustomSprite.Images.Count;
for (var frame = 0; frame < 200; frame++)
{
    var value = frame.ToString(CultureInfo.InvariantCulture); dynamicRows[0] = new MenuRow("dynamic", "坐标 X=" + value + ".0 Y=-" + value + ".5 Z=100.2");
    Check(Draw(dynamicRows, view, "X=" + value + ".0 Y=-1.5 Z=100.2"), "动态坐标帧 " + frame);
}
Check(textures == GTA.UI.CustomSprite.Images.Count, "200帧真实绘制循环没有增加纹理路径");
var reloaded = new ChinesePanel(fixture);
Check(GTA.UI.CustomSprite.Images.Count == textures, "重新创建菜单继续复用稳定纹理路径");
dynamicRows[0] = new MenuRow("long", new string('长', 100));
Check(!Draw(dynamicRows, view, "超长项不可执行"), "超长未完整显示菜单项没有绘制确认");
dynamicRows[0] = new MenuRow("invalid", "非法\n名称");
Check(!Draw(dynamicRows, view, "不可显示字符不可执行"), "非法字符fallback不会取得绘制确认");
count += WorldVisualChecks.Run(panel, root);
var beforeReload = GTA.UI.CustomSprite.Images.Count; new ChinesePanel(fixture);
Check(GTA.UI.CustomSprite.Images.Count == beforeReload, "世界图标与滑条重载不增加路径");
File.WriteAllText(Path.Combine(fixture, "world-ui-v1", "weather-sun.png"), "external-world-edit");
try { new ChinesePanel(fixture); throw new Exception("未拒绝外部修改天气缓存"); }
catch (InvalidDataException) { Check(File.ReadAllText(Path.Combine(fixture, "world-ui-v1", "weather-sun.png")) == "external-world-edit", "天气缓存外部修改后拒绝覆盖"); }
File.WriteAllText(Path.Combine(fixture, "glyph-v1", "background.png"), "external-user-edit");
try { new ChinesePanel(fixture); throw new Exception("未拒绝外部修改缓存"); }
catch (InvalidDataException) { Check(File.ReadAllText(Path.Combine(fixture, "glyph-v1", "background.png")) == "external-user-edit", "缓存内容被外部修改后拒绝覆盖"); }
Console.WriteLine("完成：" + count + " 项Windows GDI面板夹具；仅替代绘制端口，不验证SHVDNE渲染或游戏加载。");
