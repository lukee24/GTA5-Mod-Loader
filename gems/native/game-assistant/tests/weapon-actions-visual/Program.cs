using System;
using System.IO;
using System.Linq;
using System.Drawing;
using Gems.GameAssistant;
try
{
 var output=Path.GetFullPath(args[0]);var fixture=Path.GetFullPath(args[1]);Directory.CreateDirectory(output);
 var panel=new ChinesePanel(Path.Combine(fixture,"glyphs"));var view=new MenuViewport();var port=new ActionPort();var controller=new WeaponActionsController(port,new ActionJournal(),_=>{});var menu=new WeaponActionsMenu(controller);var count=0;
 void Check(bool ok,string why){count++;if(!ok)throw new Exception("FAIL "+why);}
 bool Draw(string key,string notice)
 {
  var rows=menu.Rows();view.Reset(rows.Length);var index=Array.FindIndex(rows,r=>r.Key==key);if(index<0)throw new Exception("missing "+key);view.Move(index);
  GTA.UI.CustomSprite.DrawnSprites.Clear();GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42,48,61));
  return panel.Draw("GEMS · 角色武器操作","Enhanced 故事模式 · 效果未实测",rows,view,notice,menu.Detail,"方向键 / 手柄 选择；肩键 分类","Enter / A 执行；Back / B 返回；F5 隐藏；+/- 调值");
 }
 void AllRows(string context){foreach(var row in menu.Rows())Check(Draw(row.Key,"效果待测。"),context+" row "+row.Key);}
 var now=DateTime.UtcNow;menu.Execute("wa-refresh",0,now);AllRows("home");Check(Draw("wa-clear",controller.LastResult),"home actual state readable");
 menu.Execute("wa-clear",0,now);Check(Draw("wa-clear",controller.LastResult),"full clear irreversible warning readable");GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.84-stage7-ui-clear.png"));
 menu.Cancel();menu.Execute("wa-clip-off",0,now);Check(Draw("wa-clip-off",controller.LastResult),"whole-ped force off warning readable");GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.84-stage7-ui-infinite.png"));
 menu.Execute("wa-clip-off",0,now);Check(Draw("wa-request-log",controller.LastResult),"request returned effect unknown fits");
 menu.Execute("wa-inventory",0,now);AllRows("inventory");var item=menu.Rows().First(r=>r.Key.StartsWith("wa-item:")).Key;menu.Execute(item,0,now);AllRows("selected");
 menu.Execute("wa-components",0,now);AllRows("components");var part=menu.Rows().First(r=>r.Key.StartsWith("wa-component:")).Key;menu.Execute(part,0,now);AllRows("component");
 Check(menu.Rows().First(r=>r.Key=="wa-installed").Value=="否/否","Chinese installed and active values");
 Check(Draw("wa-livery","实际返回值不等于可用恢复原色。"),"raw livery versus unknown readable");
 menu.Execute("wa-install",0,now);Check(Draw("wa-install",controller.LastResult),"component warning readable");GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.84-stage7-ui-component.png"));
 menu.Execute("wa-install",0,now);var restore=menu.Rows().First(r=>r.Key.StartsWith("wa-restore:")).Key;menu.Execute(restore,0,now);
 Check(Draw(restore,controller.LastResult),"conditional restoration warning readable");GTA.UI.CustomSprite.Canvas.Save(Path.Combine(output,"0.1.84-stage7-ui-restore.png"));
 Check(!Draw("wa-install",new string('危',800)),"unreadable mandatory notice prevents acknowledgement");
 menu.Cancel();menu.Back();menu.Back();Draw("wa-tint","颜色草稿，尚未提交。");var textures=GTA.UI.CustomSprite.Images.Count;
 for(int i=0;i<1000;i++){menu.Execute("wa-tint",i%2==0?1:-1,now);Check(Draw("wa-tint","颜色草稿，尚未提交。"),"dynamic frame "+i);}
 Check(GTA.UI.CustomSprite.Images.Count==textures,"bounded dynamic GDI textures");
 menu.Reset();menu.Execute("wa-records",0,now);AllRows("records");
 Console.WriteLine("Stage7 actual WeaponActionsMenu / ChinesePanel GDI: "+count+" PASS. Game port and sprite sink substitutes; not gameplay.");
}
catch(Exception e){Console.WriteLine(e);System.Environment.ExitCode=1;}
namespace GTA { public static class StringHash { public static uint AtStringHashUtf8(string value,uint seed)=>throw new NotSupportedException("GDI does not parse catalog"); } }

