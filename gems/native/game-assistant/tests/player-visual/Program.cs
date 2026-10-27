using System;
using System.IO;
using System.Linq;
using System.Drawing;
using Gems.GameAssistant;
var output = Path.GetFullPath(args[0]); var fixture = Path.GetFullPath(args[1]); Directory.CreateDirectory(output);
var panel = new ChinesePanel(Path.Combine(fixture, "glyphs")); var view = new MenuViewport(); var port = new MotionPort(); var motion = new PlayerMotionController(port);
var passed = 0; void Check(bool value, string name) { if (!value) { Console.WriteLine("失败：" + name); throw new Exception(name); } passed++; Console.WriteLine("通过：" + name); }
bool Draw(int index, string notice, string? detail = null)
{
    var rows = PlayerMenu.Build(true, 3, false, true, motion); view.Reset(rows.Length); view.Move(index);
    GTA.UI.CustomSprite.DrawnSprites.Clear(); GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42, 48, 61));
    return panel.Draw("GEMS · 玩家", "Enhanced 故事模式 · 效果未实测", rows, view, notice, detail ?? motion.LastResult, "Up/Down 选择；Left/Right 分类", "Enter 确认开关；+/- 调值；F5 仅隐藏菜单");
}
foreach (var index in new[] { 0, 6, 7, 8, 9, 13 }) Check(Draw(index, "开发构建；游戏效果未实测。"), "实际玩家菜单行可读 " + index);
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output, "0.1.82-stage5-ui-player-last.png"));
motion.SetMultiplier("player-run", 1.499f); motion.Toggle("player-run"); motion.Toggle("player-swim"); motion.Toggle("jump"); motion.Tick();
Check(Draw(7, "关闭菜单后观察；关闭功能才停止请求。"), "最高倍率与实际请求状态可读");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output, "0.1.82-stage5-ui-player-running.png"));
port.Throw = true; motion.Tick(); Check(Draw(8, "移动请求失败，详情见本地日志。"), "长异常后的有界状态仍可操作");
Check((motion.TakeError()?.Length ?? 0) > 800 && motion.TakeError() == null, "完整异常供日志消费一次，不进入纹理缓存");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output, "0.1.82-stage5-ui-player-failed.png"));
port.Throw = false; motion.Toggle("player-run"); motion.Tick(); Check(Draw(7, "已重新明确启用请求。"), "失败后重新启用可见");
motion.Stop("输入资格中断／暂停／失焦／动作异常");
Check(Draw(7, "开发测试构建；输入映射在最后一个分类，游戏效果未实测。"), "守卫中断后F5重新打开，实际默认提示仍允许重新启用");
motion.Toggle("player-run"); motion.Tick();
Check(Draw(7, "坐标显示", "X=-1234567.8 Y=1234567.8 Z=-1234567.8"), "长坐标仍可见");
Draw(7, "倍率是本助手请求值；效果待测。"); var textures = GTA.UI.CustomSprite.Images.Count;
for (var i = 0; i < 1000; i++) { motion.SetMultiplier("player-run", (i % 1500) / 1000f); motion.Tick(); Check(Draw(7, "倍率是本助手请求值；效果待测。"), "动态倍率帧 " + i); }
Check(GTA.UI.CustomSprite.Images.Count == textures, "1000帧倍率变化不增加纹理路径");
Console.WriteLine("Stage5 GDI：" + passed + "项通过；真实玩家菜单与GDI绘制，SDK精灵是离线端口，不是游戏截图。");
class MotionPort : IPlayerMotionPort
{
    private long epoch; public bool Throw;
    public bool TrySession(out PlayerMotionSession value) { value = new PlayerMotionSession(new PlayerIdentity(1,2,3,4), epoch); return true; }
    public void ForgetSession() { epoch++; }
    public void Run(PlayerMotionSession session, float multiplier) { }
    public void Swim(PlayerMotionSession session, float multiplier) { if (Throw) throw new IOException(new string('长', 800)); }
    public void Jump(PlayerMotionSession session) { }
}
