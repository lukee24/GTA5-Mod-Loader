using System;
using System.IO;
using System.Linq;
using System.Drawing;
using Gems.GameAssistant;
try {
var output = Path.GetFullPath(args[0]); var fixture = Path.GetFullPath(args[1]); Directory.CreateDirectory(output);
var panel = new ChinesePanel(Path.Combine(fixture,"glyphs")); var view = new MenuViewport();
var port = new FakePort(); var controller = new WeaponController(port,new MemoryJournal(),(choice,definitions)=>{});
var bridge = new WeaponCatalogBridge(Path.Combine(fixture,"missing.json"),new WeaponGameIdentity(()=>fixture));
var menu = new WeaponMenu(controller,bridge); int checks=0;
void Check(bool value,string name) { checks++; if(!value)throw new Exception("FAIL "+name); }
bool Draw(string key,string notice)
{
    var rows=menu.Rows(); view.Reset(rows.Length); var index=Array.FindIndex(rows,r=>r.Key==key); if(index<0)throw new Exception(key); view.Move(index);
    GTA.UI.CustomSprite.DrawnSprites.Clear(); GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42,48,61));
    return panel.Draw("GEMS · 武器库存与目录","Enhanced 故事模式 · 键盘 · 效果未实测",rows,view,notice,menu.Detail,
        "Up/Down 选择；Left/Right 分类","Enter 执行；Back 返回；F5 开关；+/- 调值");
}
menu.Execute("weapon-refresh",0,DateTime.UtcNow);
Check(Draw("weapon-page:2","独立目录失败不伪造空库存。"),"home state legible");
menu.Execute("weapon-page:2",0,DateTime.UtcNow);
controller.Definitions[1].Name=new string('长',300)+"Unicode𠮷";
Check(Draw("weapon-item:1","列表显示有界名称与完整hash。"),"long runtime name list");
menu.Execute("weapon-item:1",0,DateTime.UtcNow);
Check(Draw("weapon-grant","来源/注册/效果未验证；修改前还需独立运行时检查。"),"full detail and default warning fit");
menu.Execute("weapon-grant",0,DateTime.UtcNow);
Check(Draw("weapon-grant",controller.LastResult),"real first grant preview readable");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.83-stage6-ui-weapon-grant.png"));
menu.Execute("weapon-grant",0,DateTime.UtcNow); controller.Tick(DateTime.UtcNow);
Check(Draw("weapon-remove",controller.LastResult),"observed grant and remove row readable");
menu.Execute("weapon-ammo",1,DateTime.UtcNow); menu.Execute("weapon-ammo",0,DateTime.UtcNow);
Check(Draw("weapon-ammo",controller.LastResult),"shared ammo preview readable");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.83-stage6-ui-weapon-ammo.png"));
menu.Execute("weapon-ammo",0,DateTime.UtcNow); menu.Execute("weapon-remove",0,DateTime.UtcNow);
Check(Draw("weapon-remove",controller.LastResult),"removal restore limit readable");
GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.83-stage6-ui-weapon-remove.png"));
menu.Cancel(); controller.Suspend("失焦"); Check(Draw("weapon-remove","会话中断；旧记录保留，未恢复。"),"unowned session record still visible");
Check(Draw("weapon-cancel",new string('错',800))==false,"oversized mandatory notice blocks action acknowledgement");
Draw("weapon-ammo","仅调整草稿，仍需二次确认。"); var textures=GTA.UI.CustomSprite.Images.Count;
for(int i=0;i<1000;i++){menu.Execute("weapon-ammo",1,DateTime.UtcNow);Check(Draw("weapon-ammo","仅调整草稿，仍需二次确认。"),"amount frame "+i);}
Check(GTA.UI.CustomSprite.Images.Count==textures,"dynamic amount reuses bounded textures");
Console.WriteLine("Stage6 real WeaponMenu/ChinesePanel GDI: "+checks+" PASS. Fake game port/sprite sink; not a game screenshot.");
} catch(Exception error) { Console.WriteLine(error.GetType().FullName + " " + error.Message + "\n" + error.StackTrace); System.Environment.ExitCode=1; }
namespace GTA { public static class StringHash { public static uint AtStringHashUtf8(string value,uint seed) => throw new NotSupportedException("This GDI fixture does not parse catalogs; real hash is tested by weapon-catalog."); } }
