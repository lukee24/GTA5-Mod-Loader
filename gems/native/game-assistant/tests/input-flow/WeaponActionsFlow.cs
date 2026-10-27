using Gems.GameAssistant;
using GTA;
using System.Reflection;
using System.Windows.Forms;

public static class WeaponActionsFlow
{
    public static void Run(Action<bool,string> check)
    {
        Gems.GameAssistant.Environment.Root=Path.Combine(Gems.GameAssistant.Environment.Root,"weapon84-"+Guid.NewGuid().ToString("N"));
        Game.Player=new Player();Game.Allowed=true;Game.IsPaused=false;Game.Held.Clear();GtaInputPort.Focused=true;GtaInputPort.AfterRead=null;Game.DuringMotion=null;
        Runtime.Clear();Runtime.Definitions.Clear();Runtime.DefinitionOverride=null;Runtime.ComponentOverride=null;Runtime.Compatibility.Clear();
        Runtime.Definitions[(uint)WeaponHash.Unarmed]=new Definition{Hash=(uint)WeaponHash.Unarmed,Slot=1,Name="空手"};
        var ped=Game.Player.Character;
        for(uint hash=100;hash<108;hash++){Runtime.Definitions[hash]=new Definition{Hash=hash,Slot=(int)hash,AmmoType=hash+1000};ped.Items[hash]=new Item{Hash=hash,Ammo=10,Clip=3};ped.Pools[hash+1000]=10;}
        var item=ped.Items[100];item.Components.Add(new WeaponComponent{HashValue=(WeaponComponentHash)11,AttachmentValue=WeaponAttachmentPoint.GunRoot,ActiveValue=false,EnabledValue=false});
        item.Components.Add(new WeaponComponent{HashValue=(WeaponComponentHash)12,AttachmentValue=WeaponAttachmentPoint.GunRoot,ActiveValue=true,EnabledValue=true,LiveryValue=4});
        var script=new GemsAssistantScript();int number=9000;
        T Field<T>(string name)=>(T)typeof(GemsAssistantScript).GetField(name,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(script)!;
        void Frame(string[]? keys=null,string[]? buttons=null,bool pad=false){keys??=Array.Empty<string>();Game.Held=keys.Select(k=>(Keys)Enum.Parse(typeof(Keys),k)).ToHashSet();GtaInputPort.Frame=new InputFrame{Number=++number,Keys=keys,Buttons=buttons??Array.Empty<string>(),Gamepad=pad};script.RaiseTick();}
        void Key(string name){Frame();var key=(Keys)Enum.Parse(typeof(Keys),name);script.RaiseDown(key);Frame(new[]{name});script.RaiseUp(key);Frame();}
        void Pad(string name){Frame(pad:true);Frame(buttons:new[]{name},pad:true);Frame(pad:true);}
        void Select(string key,bool pad=false){Frame(pad:pad);var index=Array.FindIndex(ChinesePanel.Rows,r=>r.Key==key);check(index>=0,"Stage7真实菜单行 "+key);var view=Field<MenuViewport>("viewport");view.Reset(ChinesePanel.Rows.Length);view.Move(index);Frame(pad:pad);}
        void Act(string key,bool pad=false){Select(key,pad);if(pad)Pad("FrontendAccept");else Key("Return");}
        int Count(string method)=>Runtime.Writes.Count(w=>w.Method==method);
        Frame();Key("F5");Key("Left");Act("weapon-actions");Act("wa-refresh");
        var c=Field<WeaponActionsController>("weaponActions");var menu=Field<WeaponMenu>("weaponMenu");
        check(c.Snapshot?.Items.Length==9&&Count("RemoveAll")==0,"实际新观察不经83严格MaxAmmo门槛");
        Act("wa-clip-on");check(c.Confirmation=="clip-on"&&Count("InfiniteAmmoClip")==0,"全角色开启第一确认仅预览");
        Key("Return");check(Count("InfiniteAmmoClip")==1&&c.Requests.Last().Desired&&c.Requests.Last().ActualState=="unknown","真实全角色开启typed setter状态未知");
        Act("wa-clip-off",true);Pad("FrontendAccept");check(Count("InfiniteAmmoClip")==2&&Runtime.Writes.Last(w=>w.Method=="InfiniteAmmoClip").Desired==false,"逻辑手柄全角色明确关闭");
        var nativeBefore=Runtime.Writes.Count;Key("F5");Frame();check(Runtime.Writes.Count==nativeBefore,"隐藏不写无限false");Key("F5");
        Act("wa-inventory");check(ChinesePanel.Rows.Count(r=>r.Key.StartsWith("wa-item:"))==5,"真实新库存五条分页");
        Act("wa-next",true);check(ChinesePanel.Rows.Any(r=>r.Key.StartsWith("wa-item:00000069:")),"手柄第二页稳定hash键");Act("wa-next");
        var first=ChinesePanel.Rows.First(r=>r.Key.StartsWith("wa-item:00000064:")).Key;Act(first);
        check(menu.Page==102&&c.Snapshot?.DetailWeapon==100,"实际所选目标深读而非全库组件扫描");
        Act("wa-pool-on");Key("Return");check(Count("InfiniteAmmo")==1&&Runtime.Writes.Last(w=>w.Method=="InfiniteAmmo").Hash==100,"选定库存实际池开启");
        Act("wa-pool-off",true);Pad("FrontendAccept");check(Count("InfiniteAmmo")==2&&!c.Requests.Last().Desired,"逻辑手柄池强制关闭是独立命令");
        Act("wa-tint");Key("Add");check(Count("Weapon.Tint")==0&&menu.Page==102&&ChinesePanel.Rows.Any(r=>r.Key=="wa-tint"&&r.Value.StartsWith("1/")),"颜色实际加号映射只改草稿并取消旧确认");Key("Return");Key("Return");
        check(Count("Weapon.Tint")==1&&item.Tint==1,"实际武器本体颜色提交");
        // Re-enter target refreshes detail snapshot; definition remains stable.
        Act("wa-components");var partKey=ChinesePanel.Rows.First(r=>r.Key.StartsWith("wa-component:0000000b:")).Key;Act(partKey);
        check(ChinesePanel.Rows.Any(r=>r.Key=="wa-livery"&&r.Value.Contains("未知")),"组件原始读数与可恢复原值不混淆");
        Act("wa-install");ChinesePanel.Legible=false;Frame();Key("Return");ChinesePanel.Legible=true;Frame();check(Count("Component.Active")==0&&c.Confirmation=="","不可读组件警告取消授权");
        Key("Return");Key("Return");check(Count("Component.Active")==1&&item.Components[0].ActiveValue,"真实安装组件调用");
        var restore=ChinesePanel.Rows.First(r=>r.Key.StartsWith("wa-restore:")).Key;Act(restore,true);Pad("FrontendAccept");
        check(Count("Component.Active")==2&&!item.Components[0].ActiveValue&&c.Changes.Last().Restored,"手柄条件恢复实际单项安装");
        Act("wa-remove");Key("Return");check(Count("Component.Active")==2,"已经移除的组件是无需操作");
        // Selected definition changes after its visible row: do not retarget the stale component key.
        item.Components.Add(new WeaponComponent{HashValue=(WeaponComponentHash)13,AttachmentValue=WeaponAttachmentPoint.GunRoot});
        Act("wa-install");check(Count("Component.Active")==2&&c.Confirmation=="","兼容定义变更撤销已显示组件确认");
        menu.Reset();Frame();Act("weapon-actions");Act("wa-refresh");
        Act("wa-clear");check(c.Confirmation=="clear"&&Count("RemoveAll")==0,"真实全清首次确认无原生修改");
        GtaInputPort.AfterRead=()=>GtaInputPort.Focused=false;Frame();GtaInputPort.AfterRead=null;GtaInputPort.Focused=true;Frame();Key("F5");
        check(c.Confirmation==""&&Count("RemoveAll")==0,"输入后失焦清除预览失效");
        Act("wa-clear");Key("Return");check(Count("RemoveAll")==1&&ped.Items.Count==1,"真实Script至typed RemoveAll一次调用");
        Frame();Frame();check(!c.Pending&&c.LastResult.Contains("只剩空手"),"真实多Tick后读结束，仅观察不称游戏通过");
        nativeBefore=Runtime.Writes.Count;script.RaiseAbort();check(Runtime.Writes.Count==nativeBefore,"退出无隐式clear/Give/无限false");
        var dir=Path.Combine(Gems.GameAssistant.Environment.Root,"GEMS","game-assistant","weapon-actions-v1");var results=Directory.GetFiles(dir,"*.result");
        check(results.Any(f=>File.ReadAllText(f).Contains("GEMS.WeaponAction.v2"))&&results.Any(f=>File.ReadAllText(f).Contains("request-returned-effect-unknown")),"实际磁盘v2审计记录无限请求unknown语义");
        check(!Directory.GetFiles(dir,"*.intent").Except(results.Select(r=>Path.ChangeExtension(r,".intent"))).Any(),"正常脚本链所有意图有结果记录");
    }
}

