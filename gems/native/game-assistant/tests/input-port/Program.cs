using Gems.GameAssistant;
using GTA;
using System.Windows.Forms;
var count=0;
void Check(bool ok,string name){if(!ok)throw new Exception(name);count++;Console.WriteLine("通过："+name);}
var allowed=false;var focus=true;var port=new GtaInputPort(()=>allowed,()=>focus);
Check(!port.Read("a").Eligible&&Game.Reads==0,"守卫失败不读取任何GTA输入");
allowed=true;focus=false;Check(!port.Read("a").Eligible&&Game.Reads==0,"失焦不读取GTA输入");
focus=true;Game.Paused=true;Check(!port.Read("a").Eligible&&Game.KeyReads==0,"暂停不读取按键");Game.Paused=false;
Game.HeldKeys.Add(Keys.F5);Game.Buttons.Add(GTA.Control.FrontendAccept);Game.Method=InputMethod.MouseAndKeyboard;
var frame=port.Read("a");Check(frame.Eligible&&frame.Keys.SequenceEqual(new[]{"F5"}),"实际端口准确收集有效键码");
Check(!frame.Gamepad&&frame.Buttons.Contains("FrontendAccept"),"切到键盘仍持续采样手柄逻辑控制用于释放");
Check(Game.Codes.All(c=>(int)c>=0&&(int)c<=255),"不会把Keys修饰标志当作键码");
Check(frame.PressedKeys.Length==0,"端口轮询不伪造KeyDown授权");
Game.HeldKeys.Clear();Game.Buttons.Clear();Game.Method=InputMethod.GamePad;frame=port.Read("a");Check(frame.Gamepad&&frame.Keys.Length==0&&frame.Buttons.Length==0,"真实端口设备及中立帧");
var router=new InputRouter();router.Poll(InputProfile.Defaults(),frame,true);Game.Frame++;Game.Buttons.Add(GTA.Control.FrontendAccept);Check(router.Poll(InputProfile.Defaults(),port.Read("a"),true)==MenuCommand.Accept,"真实端口加生产Router读取手柄边沿");
Game.Method=InputMethod.MouseAndKeyboard;Game.Frame++;router.Poll(InputProfile.Defaults(),port.Read("a"),true);Game.Method=InputMethod.GamePad;Game.Frame++;
Check(router.Poll(InputProfile.Defaults(),port.Read("a"),true)==null,"真实端口设备切换不重用旧按压");
Game.Writes.Clear();port.Suppress(InputProfile.Defaults());Check(Game.Writes.SequenceEqual(new[]{GTA.Control.All}),"模态菜单调用SDK全部逻辑控制逐帧抑制");Check(Game.Writes.Distinct().Count()==Game.Writes.Count,"每帧只请求一次抑制");
Game.Writes.Clear();allowed=false;port.Suppress(InputProfile.Defaults());Check(Game.Writes.Count==0,"守卫拒绝不抑制");allowed=true;focus=false;port.Suppress(InputProfile.Defaults());Check(Game.Writes.Count==0,"失焦不抑制");focus=true;Game.Paused=true;port.Suppress(InputProfile.Defaults());Check(Game.Writes.Count==0,"暂停不抑制");Game.Paused=false;
var checks=0;var changing=new GtaInputPort(()=>++checks<2,()=>true);Game.Writes.Clear();changing.Suppress(InputProfile.Defaults());changing.Suppress(InputProfile.Defaults());Check(Game.Writes.Count==1,"后续帧守卫失效停止抑制写入");
checks=0;changing=new GtaInputPort(()=>++checks<2,()=>true);Check(!changing.Read("b").Eligible,"采样结束守卫变化使快照失效");
var focusChecks=0;changing=new GtaInputPort(()=>true,()=>++focusChecks<2);Check(!changing.Read("b").Eligible,"采样结束失焦使快照失效");
Console.WriteLine("Stage4真实GtaInputPort："+count+"项通过；SDK宿主为夹具，非真实游戏/手柄。");
namespace GTA
{
 public enum InputMethod{MouseAndKeyboard,GamePad}
 public enum Control{FrontendUp,FrontendDown,FrontendLeft,FrontendRight,FrontendAccept,FrontendCancel,FrontendLb,FrontendRb,FrontendLt,FrontendRt,Attack,Aim,All}
 public static class Game
 {
  public static int Reads,KeyReads,Frame=1;public static bool Paused;public static InputMethod Method;
  public static HashSet<Keys> HeldKeys=new();public static HashSet<Control> Buttons=new();public static List<Keys> Codes=new();public static List<Control> Writes=new();
  public static bool IsPaused{get{Reads++;return Paused;}}public static int FrameCount{get{Reads++;return Frame;}}public static InputMethod LastInputMethod{get{Reads++;return Method;}}
  public static bool IsKeyPressed(Keys key){Reads++;KeyReads++;Codes.Add(key);return HeldKeys.Contains(key);}public static bool IsControlPressed(Control control){Reads++;return Buttons.Contains(control);}
  public static void DisableControlThisFrame(Control control)=>Writes.Add(control);
  public static void DisableAllControlsThisFrame()=>Writes.Add(Control.All);
 }
}
namespace GTA.Native { }
