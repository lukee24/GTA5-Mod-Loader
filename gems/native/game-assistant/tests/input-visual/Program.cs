using System;
using System.IO;
using System.Linq;
using System.Drawing;
using Gems.GameAssistant;
var root=Path.GetFullPath(args[0]);var fixture=Path.GetFullPath(args[1]);Directory.CreateDirectory(root);
var count=0;void Check(bool ok,string name){if(!ok)throw new Exception(name);count++;Console.WriteLine("通过："+name);}
var panel=new ChinesePanel(Path.Combine(fixture,"glyphs"));var view=new MenuViewport();
var store=new InputProfileStore(Path.Combine(fixture,"maps"));var editor=new InputEditor(store);
string Nav(bool pad)=>editor.Hint(MenuCommand.Up,pad)+"/"+editor.Hint(MenuCommand.Down,pad)+" 选择；"+editor.Hint(MenuCommand.PreviousCategory,pad)+"/"+editor.Hint(MenuCommand.NextCategory,pad)+" 分类";
string Action(bool pad)=>editor.Hint(MenuCommand.Accept,pad)+" 执行；"+editor.Hint(MenuCommand.Back,pad)+" 返回；"+editor.Hint(MenuCommand.Toggle,pad)+" 开关；"+editor.Hint(MenuCommand.Increase,pad)+"/"+editor.Hint(MenuCommand.Decrease,pad)+" 调值";
bool Draw(MenuRow[] rows,string notice,string detail="",bool pad=false)
{
 GTA.UI.CustomSprite.DrawnSprites.Clear();GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42,48,61));view.SetCount(rows.Length);
 return panel.Draw("GEMS · 输入与映射","Enhanced · "+(pad?"手柄":"键盘")+" · 游戏效果未实测",rows,view,notice,detail,Nav(pad),Action(pad));
}
void Shot(string name)=>GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root,"0.1.81-stage4-ui-"+name+".png"));
var rows=editor.Rows();view.Reset(rows.Length);Check(Draw(rows,"映射预览尚未生效",editor.Detail(0)),"默认实际映射行与提示全部可读");Shot("mapping-default");
view.Move(rows.Length-2);Check(Draw(rows,"损坏恢复需要两次确认；原记录保留。",editor.Detail(view.Selected)),"末项恢复入口在滚动视窗内");Shot("mapping-recovery");
editor.Execute("input-bind:0",MenuCommand.Accept,DateTime.UtcNow);view.Reset(rows.Length);
Check(Draw(rows,editor.Message,editor.Detail(0)),"录入及明确长按取消提示可读");Shot("mapping-capture");editor.Suspend();
var longProfile=InputProfile.Defaults();for(var i=0;i<12;i++)longProfile.Bindings[i].Tokens=new[]{"ControlKey","Menu","ShiftKey",((char)('A'+i)).ToString()};
longProfile.Bindings[12].Tokens=new[]{"FrontendLt","FrontendRt"};
var available=InputProfile.PadTokens.Take(8).ToArray();var combos=(from a in Enumerable.Range(0,5) from b in Enumerable.Range(a+1,7-a) from c in Enumerable.Range(b+1,7-b) from d in Enumerable.Range(c+1,7-c) select new[]{available[a],available[b],available[c],available[d]}).Take(8).ToArray();
for(var i=13;i<21;i++)longProfile.Bindings[i].Tokens=combos[i-13];longProfile.Validate();store.Save(store.Read().Revision,longProfile);editor=new InputEditor(store);rows=editor.Rows();view.Reset(rows.Length);
Check(Draw(rows,"预览取消不改实际映射",editor.Detail(0)),"四键键盘组合实际动态提示可完整显示");Shot("mapping-long-keyboard");
view.Move(12);Check(Draw(rows,"手柄逻辑按钮随游戏映射；效果未实测",editor.Detail(12,true),true),"四键手柄组合提示及当前设备显示可读");Shot("mapping-long-gamepad");
editor.Execute("input-bind:12",MenuCommand.Accept,DateTime.UtcNow);Check(Draw(rows,editor.Message,editor.Detail(12,true),true),"最长手柄返回组合的捕获取消提示可读");Shot("mapping-pad-capture");editor.Suspend();
var tip=Directory.GetFiles(Path.Combine(fixture,"maps"),"input-profile-*.json").OrderBy(p=>p,StringComparer.Ordinal).Last();File.WriteAllText(tip,"{}");editor.Execute("input-reload",MenuCommand.Accept,DateTime.UtcNow);editor.Execute("input-recover",MenuCommand.Accept,DateTime.UtcNow);rows=editor.Rows();view.Reset(rows.Length);view.Move(Array.FindIndex(rows,r=>r.Key=="input-recover"));
Check(Draw(rows,editor.Message,editor.Detail(view.Selected,true),true),"实际损坏恢复计划与可信版提示完整可读");Shot("mapping-real-recovery");
for(var page=0;page<=5;page++){var world=WorldMenu.Build(page,new WorldView());view.Reset(world.Length);Check(Draw(world,"世界操作仍需真实游戏验证"),"原世界菜单布局回归 "+page);}
for(var page=0;page<=3;page++){var vehicle=VehicleMenu.Build(page,true,true,false,12.5f,false,"");view.Reset(vehicle.Length);view.Move(vehicle.Length-1);Check(Draw(vehicle,"车辆操作仍需真实游戏验证"),"原车辆菜单末行布局回归 "+page);}
var dynamic=new[]{new MenuRow("dynamic","动态映射预览","0")};view.Reset(1);Draw(dynamic,"预览 0123456789","Ctrl+Alt+Shift+A");var textures=GTA.UI.CustomSprite.Images.Count;
for(var i=0;i<1000;i++){dynamic[0]=new MenuRow("dynamic","动态映射预览",i.ToString());Check(Draw(dynamic,"预览 "+i,"Ctrl+Alt+Shift+A"),"动态映射帧 "+i);}
Check(GTA.UI.CustomSprite.Images.Count==textures,"1000帧实际绘制不新增纹理路径");
Check(!Draw(new[]{new MenuRow("overflow",new string('长',120))},"超长不可读行"),"不可读所选行不能给执行确认");
Check(!Draw(new[]{new MenuRow("normal","正常")},new string('长',300)),"过长警告拒绝执行确认");
Console.WriteLine("Stage4 GDI："+count+"项通过；真实绘制代码+离线SDK绘制端口，不是游戏截图。");
