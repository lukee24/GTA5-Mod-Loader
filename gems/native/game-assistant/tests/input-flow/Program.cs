using Gems.GameAssistant;
using System.Reflection;
using System.Windows.Forms;
using GTA;

var passed=0;
void Check(bool condition,string name) { if(!condition)throw new Exception(name);passed++;Console.WriteLine("通过："+name); }
T Field<T>(object obj,string field) => (T)obj.GetType().GetField(field,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(obj)!;
void Set(object obj,string field,object? value) => obj.GetType().GetField(field,BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(obj,value);
var script=new GemsAssistantScript(); var number=0;
void Frame(string[]? held=null,string[]? buttons=null,bool pad=false,int? sameFrame=null)
{
    var tokens=held??Array.Empty<string>();Game.Held=tokens.Select(k=>(Keys)Enum.Parse(typeof(Keys),k)).ToHashSet();
    GtaInputPort.Frame=new InputFrame{Number=sameFrame??++number,Keys=tokens,Buttons=buttons??Array.Empty<string>(),Gamepad=pad};script.RaiseTick();
}
void Press(string token)
{
    Frame();var key=(Keys)Enum.Parse(typeof(Keys),token);script.RaiseDown(key);Frame(new[]{token});script.RaiseUp(key);Frame();
}
void Select(string key,bool pad=false)
{
    var rows=ChinesePanel.Rows;var index=Array.FindIndex(rows,r=>r.Key==key);Check(index>=0,"真实菜单包含 "+key);
    var v=Field<MenuViewport>(script,"viewport");v.Reset(rows.Length);v.Move(index);Frame(pad:pad);
}
Frame();Frame();Press("F5");Check(Field<bool>(script,"opened"),"真实F5事件经OnTick打开菜单");
Select("invincible");Press("Return");Check(Game.Player.IsInvincible,"真实玩家菜单确认调用玩家开关");
script.RaiseDown(Keys.Return);Frame(new[]{"Return"});var invincible=Game.Player.IsInvincible;script.RaiseDown(Keys.Return);Frame(new[]{"Return"});Check(Game.Player.IsInvincible==invincible,"系统自动重复不二次切换");script.RaiseUp(Keys.Return);Frame();
Press("Right");Select("paint-menu");Press("Return");Check(Field<int>(script,"vehiclePage")==1,"真实车辆二级页进入");
Select("paint-primary");VehicleController.DuringText=()=>{script.RaiseDown(Keys.Return);Frame(new[]{"Return"});script.RaiseUp(Keys.Return);};Press("Return");VehicleController.DuringText=null;
Check(VehicleController.Calls.Count(c=>c=="paint:False")==1,"文本输入Yield重入只执行一次");Frame();Check(!Field<bool>(script,"inputBusy"),"文本完成finally解除busy");
if(!Field<bool>(script,"opened"))Press("F5");Press("Escape");Check(Field<int>(script,"vehiclePage")==0,"返回真实车辆父页");
Select("speed");Press("Add");Check(VehicleController.Calls.Contains("speed:1"),"小键盘加号经统一调值");
Press("Right");Select("world-page:1");Press("Return");Select("time-hour");Press("Oemplus");Check(WorldController.Calls.Contains("time-hour:1"),"世界小时草稿统一调值");Press("Escape");Check(Field<int>(script,"worldPage")==0,"返回世界父页");
Press("Right");Select("next-page");Press("Return");Check(Field<int>(script,"vehicleOffset")==0,"空安装目录分页不虚构条目");
Press("Right");Check(ChinesePanel.Rows[0].Key=="empty-favorites","收藏分类保持真实空态");Press("Right");Check(ChinesePanel.Rows.Any(r=>r.Key=="input-apply"),"实际输入映射分类可达");
Select("input-bind:0");Press("Return");Check(Field<InputEditor>(script,"inputEditor").Capturing,"通过实际菜单开始录入");
Press("F6");Check(!Field<InputEditor>(script,"inputEditor").Capturing,"新组合释放后进入预览");Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[0].Tokens[0]=="F5","预览未改变实际配置");
Select("input-cancel");Press("Return");Check(!Field<InputEditor>(script,"inputEditor").Dirty,"真实取消不写配置");
Select("input-bind:0");Press("Return");Press("F6");Select("input-apply");Press("Return");Console.WriteLine("保存状态："+Field<InputEditor>(script,"inputEditor").Message);Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[0].Tokens[0]=="F6","实际菜单保存并生效");
Check(ChinesePanel.ActionHint.Contains("F6")&&!ChinesePanel.ActionHint.Contains("F5"),"真实绘制提示随重映射更新");Press("F6");Check(!Field<bool>(script,"opened"),"新绑定关闭实际菜单");Press("F5");Check(!Field<bool>(script,"opened"),"旧绑定不再触发");Press("F6");
Select("input-previous");Press("Return");Select("input-apply");Press("Return");Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[0].Tokens[0]=="F5","实际上一版恢复保留历史");
// A held keyboard key requires an actual matching new event, not another unrelated key event.
var router=new InputRouter();var profile=InputProfile.Defaults();
InputFrame F(int n,string[]? k=null,string[]? b=null,bool pad=false,string[]? events=null,bool eligible=true,string session="a") => new InputFrame{Number=n,Eligible=eligible,Session=session,Keys=k??Array.Empty<string>(),Buttons=b??Array.Empty<string>(),Gamepad=pad,PressedKeys=events??Array.Empty<string>()};
router.Poll(profile,F(1),true);Check(router.Poll(profile,F(2,new[]{"Return"},events:new[]{"A"}),true)==null,"无关KeyDown不授权旧Return");
Check(router.Poll(profile,F(3,new[]{"Return"},events:new[]{"Return"}),true)==MenuCommand.Accept,"真实对应边沿授权");
router.Poll(profile,F(4),true);Check(router.Poll(profile,F(3,new[]{"Return"},events:new[]{"Return"}),true)==null,"相同FrameNumber不会执行第二次");
router.Suspend();router.Poll(profile,F(5,pad:true),true);Check(router.Poll(profile,F(6,b:new[]{"FrontendAccept"},pad:true),true)==MenuCommand.Accept,"手柄确认实际路由");
router.Poll(profile,F(7),true);Check(router.Poll(profile,F(8,b:new[]{"FrontendAccept"},pad:true),true)==null,"设备切回不将旧按住键视为新输入");
router.Poll(profile,F(9,pad:true),true);Check(router.Poll(profile,F(10,b:new[]{"FrontendAccept"},pad:true),true)==MenuCommand.Accept,"设备释放后新按下恢复");
// Final input eligibility is rechecked after the port's initial snapshot.
Set(script,"category",0);Frame();Select("invincible");var before=Game.Player.IsInvincible;
GtaInputPort.AfterRead=()=>GtaInputPort.Focused=false;script.RaiseDown(Keys.Return);Frame(new[]{"Return"});GtaInputPort.AfterRead=null;script.RaiseUp(Keys.Return);
Check(Game.Player.IsInvincible==before&&!Field<bool>(script,"opened"),"快照后失焦阻止真实分发");GtaInputPort.Focused=true;Frame(new[]{"Return"});Check(!Field<bool>(script,"opened"),"恢复前台持键不执行");Frame();Press("F5");
Select("invincible");ChinesePanel.Legible=false;Frame();Press("Return");Check(Game.Player.IsInvincible==before,"不可读提示禁止真实动作");ChinesePanel.Legible=true;Frame();
Game.Allowed=false;Frame();Check(!Field<bool>(script,"opened"),"故事守卫失败关闭菜单");Game.Allowed=true;Frame(new[]{"F5"});Check(!Field<bool>(script,"opened"),"同角色守卫恢复要求释放");Frame();Press("F5");
Press("F5");var suppression=GtaInputPort.Suppressions;Frame();Check(GtaInputPort.Suppressions==suppression,"关闭菜单不抑制游戏控制");
void PadPress(string button) { Frame(pad:true);Frame(buttons:new[]{button},pad:true);Frame(pad:true); }
Press("F5");Set(script,"category",5);Frame();Select("input-bind:12");Press("Return");Frame(pad:true);
Frame(buttons:new[]{"FrontendLt"},pad:true);Frame(buttons:new[]{"FrontendLt","FrontendRt"},pad:true);Frame(pad:true);
Check(Field<InputEditor>(script,"inputEditor").Dirty,"手柄逐帧组合捕获进入预览");Select("input-apply",true);PadPress("FrontendAccept");
Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[12].Tokens.SequenceEqual(new[]{"FrontendLt","FrontendRt"}),"实际手柄路径保存无冲突打开组合");
Frame(buttons:new[]{"FrontendLt"},pad:true);Check(Field<bool>(script,"opened"),"组合前缀不触发导航或关闭");Frame(buttons:new[]{"FrontendLt","FrontendRt"},pad:true);Check(!Field<bool>(script,"opened"),"完整逐帧手柄组合关闭");Frame(pad:true);
Frame(buttons:new[]{"FrontendRt"},pad:true);Frame(buttons:new[]{"FrontendRt","FrontendLt"},pad:true);Frame(pad:true);Check(Field<bool>(script,"opened"),"反向逐帧手柄组合打开");
PadPress("FrontendRb");Check(Field<int>(script,"category")==6&&ChinesePanel.Rows.Any(r=>r.Key=="weapon-refresh"),"手柄可进入新增武器分类");
PadPress("FrontendRb");Check(Field<int>(script,"category")==0,"核心版默认七分类从武器回到玩家，高级人物入口关闭");var selected=Field<MenuViewport>(script,"viewport").Selected;PadPress("FrontendDown");Check(Field<MenuViewport>(script,"viewport").Selected==selected+1,"手柄选择下一真实条目");
Select("wanted",true);var wanted=Game.Player.Wanted.WantedLevel;PadPress("FrontendRight");Check(Game.Player.Wanted.WantedLevel==wanted+1,"手柄调值走真实玩家动作");
PadPress("FrontendRb");Select("windows-menu",true);PadPress("FrontendAccept");Check(Field<int>(script,"vehiclePage")==2,"手柄进入真实车窗子页");Select("windows-down",true);PadPress("FrontendAccept");Check(VehicleController.Calls.Contains("windows:True"),"手柄确认调用实际脚本车窗分支");PadPress("FrontendCancel");Check(Field<int>(script,"vehiclePage")==0,"手柄返回父页");
PadPress("FrontendRb");for(var page=1;page<=5;page++){Select("world-page:"+page,true);PadPress("FrontendAccept");Check(Field<int>(script,"worldPage")==page,"手柄世界子页可达 "+page);PadPress("FrontendCancel");}
Check(ChinesePanel.ActionHint.Contains("Pad确认")&&!ChinesePanel.ActionHint.Contains("Enter"),"手柄提示显示当前实际映射");
var conflicting=InputProfile.Defaults();conflicting.Bindings[12].Tokens=new[]{"FrontendLb","FrontendRb"};Check(conflicting.Issues().Length>0,"拒绝不可达的导航前缀组合");
conflicting=InputProfile.Defaults();conflicting.Bindings[12].Tokens=new[]{"FrontendLt","FrontendRt"};conflicting.Bindings[17].Tokens=new[]{"FrontendLt","FrontendRt"};Check(conflicting.Issues().Length>0,"拒绝Toggle和Accept相同弦");
conflicting=InputProfile.Defaults();conflicting.Bindings[1].Tokens=new[]{"ControlKey","F5"};Check(conflicting.Issues().Length>0,"拒绝普通键与修饰组合包含冲突");
conflicting=InputProfile.Defaults();conflicting.Bindings[0].Tokens=new[]{"Menu","F4"};Check(conflicting.Issues().Length>0,"拒绝系统保留组合");
Set(script,"category",5);Frame(pad:true);var mappingDirectory=Path.Combine(Gems.GameAssistant.Environment.Root,"GEMS","game-assistant","input-mappings-v1");
var tip=Directory.GetFiles(mappingDirectory,"input-profile-*.json").OrderBy(p=>p,StringComparer.Ordinal).Last();File.WriteAllText(tip,"{}");
Select("input-reload",true);PadPress("FrontendAccept");Check(Field<InputEditor>(script,"inputEditor").ReadFailed,"实际重新读取发现损坏记录");
Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[12].Tokens.Length==2,"损坏读取保留已生效内存映射");
Select("input-recover",true);PadPress("FrontendAccept");Check(ChinesePanel.Rows.Any(r=>r.Key=="input-recover"&&r.Label.StartsWith("确认")),"实际恢复预览明确需要第二次确认");
Check(File.Exists(tip),"恢复预览不移动损坏记录");PadPress("FrontendDown");PadPress("FrontendUp");Check(ChinesePanel.Rows.Any(r=>r.Key=="input-recover"&&!r.Label.StartsWith("确认")),"离开条目取消旧恢复确认");
PadPress("FrontendAccept");ChinesePanel.Legible=false;Frame(pad:true);PadPress("FrontendAccept");ChinesePanel.Legible=true;Frame(pad:true);PadPress("FrontendAccept");
Check(File.Exists(tip)&&Field<InputEditor>(script,"inputEditor").ReadFailed,"不可读恢复警告后的再次执行只能重建预览");
PadPress("FrontendAccept");Check(!Field<InputEditor>(script,"inputEditor").ReadFailed,"实际二次确认完成隔离并回读");
Check(!File.Exists(tip)&&Directory.GetFiles(mappingDirectory,Path.GetFileName(tip),SearchOption.AllDirectories).Any(p=>File.ReadAllText(p)=="{}"),"损坏原文件移入恢复区且原内容保留");
Check(Field<InputEditor>(script,"inputEditor").Active.Bindings[12].Tokens.Length==0,"恢复采用最后可信版本并更新实际映射");
Select("input-bind:0",true);PadPress("FrontendAccept");Frame(pad:true);Frame(buttons:new[]{"FrontendCancel"},pad:true);
Field<InputEditor>(script,"inputEditor").Capture(GtaInputPort.Frame,DateTime.UtcNow.AddSeconds(2));Check(!Field<InputEditor>(script,"inputEditor").Capturing,"长按当前返回键明确取消录入");Frame(pad:true);
Select("input-default",true);PadPress("FrontendAccept");Select("input-cancel",true);PadPress("FrontendAccept");Check(!Field<InputEditor>(script,"inputEditor").Dirty,"默认恢复预览可以取消");
Select("input-bind:0",true);PadPress("FrontendAccept");Frame();script.RaiseDown(Keys.F13);Frame();script.RaiseUp(Keys.F13);Check(!Field<InputEditor>(script,"inputEditor").Capturing&&Field<InputEditor>(script,"inputEditor").Message.Contains("不支持的键"),"不支持的按键立即明确反馈而不静默等超时");
Console.WriteLine("本次Stage4输入关联回归："+passed+"项通过；历史日志未覆盖。");
var motionStart = passed; PlayerMotionFlow.Run(Check);
Console.WriteLine("Stage5真实脚本移动链："+(passed-motionStart)+"项通过；GTA宿主/实体/输入/车辆世界等端口为夹具，实际Script/玩家controller/玩家port是生产代码，不代表游戏实测。");
var weaponStart=passed; WeaponFlow.Run(Check);
Console.WriteLine("Stage6真实脚本武器链："+(passed-weaponStart)+"项通过；实际Script/菜单/controller/SDK port/日志，GTA调用、游戏输入与绘图端为替身，不代表游戏实测。");
var actionsStart=passed; WeaponActionsFlow.Run(Check);
Console.WriteLine("Stage7真实脚本角色武器链："+(passed-actionsStart)+"项通过；实际Script/新菜单/controller/SDK port/v2日志，GTA宿主/调用/输入/绘图为替身，未游戏验证。");

var pedStart=passed;PedFlow.Run(Check);Console.WriteLine("Stage8真实脚本人物链："+(passed-pedStart)+"项通过；实际Script/菜单/controller/port/Journal/favorites，GTA/输入/绘图为替身，游戏待实测。");
