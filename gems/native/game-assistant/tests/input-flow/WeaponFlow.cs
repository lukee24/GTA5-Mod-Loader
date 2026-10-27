using Gems.GameAssistant;
using GTA;
using System.Reflection;
using System.Windows.Forms;
using System.Text.Json;
using System.Text;

public static class WeaponFlow
{
    public static void Run(Action<bool,string> check)
    {
        Gems.GameAssistant.Environment.Root=Path.Combine(Gems.GameAssistant.Environment.Root,"weapon83-"+Guid.NewGuid().ToString("N"));
        Game.Player = new Player(); Game.Allowed=true; Game.IsPaused=false; Game.Held.Clear(); GtaInputPort.Focused=true; GtaInputPort.AfterRead=null; Game.DuringMotion=null;
        Runtime.Clear(); Runtime.Definitions.Clear(); Runtime.DefinitionOverride=null;
        Runtime.Definitions[(uint)WeaponHash.Unarmed]=new Definition{Hash=(uint)WeaponHash.Unarmed,Slot=1,AmmoType=0,Name="空手"};
        Runtime.Definitions[(uint)WeaponHash.Pistol]=new Definition{Hash=(uint)WeaponHash.Pistol,Slot=2,AmmoType=22,Name="实际 API 手枪定义"};
        for(uint i=100;i<112;i++) Runtime.Definitions[i]=new Definition{Hash=i,Slot=(int)i,AmmoType=i+1000,Name="测试定义"+i};
        var script=new GemsAssistantScript();int number=4000;
        T Field<T>(string name)=>(T)typeof(GemsAssistantScript).GetField(name,BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(script)!;
        void Frame(string[]? keys=null,string[]? buttons=null,bool pad=false)
        {
            keys??=Array.Empty<string>();Game.Held=keys.Select(k=>(Keys)Enum.Parse(typeof(Keys),k)).ToHashSet();
            GtaInputPort.Frame=new InputFrame{Number=++number,Keys=keys,Buttons=buttons??Array.Empty<string>(),Gamepad=pad};script.RaiseTick();
        }
        void Press(string name){Frame();var key=(Keys)Enum.Parse(typeof(Keys),name);script.RaiseDown(key);Frame(new[]{name});script.RaiseUp(key);Frame();}
        void Pad(string name){Frame(pad:true);Frame(buttons:new[]{name},pad:true);Frame(pad:true);}
        void Open(){Frame();if(!Field<bool>("opened"))Press("F5");}
        void Select(string key,bool pad=false)
        {
            var index=Array.FindIndex(ChinesePanel.Rows,r=>r.Key==key);check(index>=0,"武器实际行 "+key);
            var view=Field<MenuViewport>("viewport");view.Reset(ChinesePanel.Rows.Length);view.Move(index);Frame(pad:pad);
        }
        int Writes(string name)=>Runtime.Writes.Count(w=>w.Method==name);
        Open();Press("Left");check(Field<int>("category")==6,"键盘经过人物反向分类到武器首页");
        var controller=Field<WeaponController>("weapons");var menu=Field<WeaponMenu>("weaponMenu");
        Select("weapon-refresh");Press("Return");check(controller.ReadValid&&controller.Definitions.Length==13,"真实脚本刷新通过实际武器SDK port");
        Select("weapon-page:2");Press("Return");check(ChinesePanel.Rows.Count(r=>r.Key.StartsWith("weapon-item:"))==5,"实际运行定义五条分页");
        Select("weapon-next");Press("Return");check(ChinesePanel.Rows.Any(r=>r.Key=="weapon-item:5"),"实际下一页列表");
        Select("weapon-search");Game.UserText="1b06d571";Press("Return");check(menu.Query=="1b06d571","实际系统文本返回进入搜索");
        check(ChinesePanel.Rows.Count(r=>r.Key.StartsWith("weapon-item:"))==1,"真实hash搜索定位单项");
        Select("weapon-search");Game.UserText="";Press("Return");check(menu.Query=="1b06d571","空输入取消保留搜索");
        Select("weapon-item:0");Press("Return");check(menu.Page==5,"真实武器详情可达");
        Select("weapon-grant");Press("Return");check(controller.Confirmation=="grant"&&Writes("Give")==0,"首次实际确认仅创建预览");
        ChinesePanel.Legible=false;Frame();Press("Return");ChinesePanel.Legible=true;Frame();check(Writes("Give")==0&&controller.Confirmation=="","不可读警告清除授权");
        Press("Return");check(Writes("Give")==0&&controller.Confirmation=="grant","新一帧只能重建预览");
        Press("Return");check(Writes("Give")==1&&controller.Owned.Single().Confirmed,"真实确认→asset→持久意图→Give0→读回");
        var give=Runtime.Writes.Single(w=>w.Method=="Give");check(give.Amount==0&&!give.Equip&&!give.Loaded,"真实SDK Give无弹药/不装备契约");
        Frame();Frame();check(Writes("Give")==1,"后续Tick不重复Give");
        Select("weapon-ammo",true);Pad("FrontendRight");check(ChinesePanel.Rows.Any(r=>r.Key=="weapon-ammo"&&r.Value=="+20"),"逻辑手柄独立调值实际武器行");
        Pad("FrontendAccept");check(controller.Confirmation=="ammo"&&Writes("ADD_AMMO_TO_PED")==0,"手柄一次性补弹预览");
        Pad("FrontendAccept");check(Writes("ADD_AMMO_TO_PED")==1&&Game.Player.Character.Pools[22]==20,"手柄确认调用命名ADD_AMMO_TO_PED");
        check(!Runtime.Writes.Any(w=>w.Method.Contains("AmmoSetter")),"没有Ammo setter隐式Give路径");
        Select("weapon-remove",true);Pad("FrontendAccept");check(controller.Confirmation=="remove"&&Writes("Remove")==0,"条件移除第二确认前不写");
        Pad("FrontendAccept");check(Writes("Remove")==1&&!Game.Player.Character.Items.ContainsKey((uint)WeaponHash.Pistol),"真实条件移除只目标");
        check(Game.Player.Character.Items.ContainsKey((uint)WeaponHash.Unarmed)&&Game.Player.Character.Pools[22]==20,"保留原有空手和残余弹药池");
        var journalDirectory=Path.Combine(Gems.GameAssistant.Environment.Root,"GEMS","game-assistant","weapon-actions-v1");
        check(Directory.GetFiles(journalDirectory,"*.intent").Length==3&&Directory.GetFiles(journalDirectory,"*.result").Length==3,"三动作真实磁盘意图/结果证据");
        // Existing pool must refuse grant; clearing below is fixture setup, never a production request.
        Select("weapon-grant");Press("Return");check(controller.Confirmation==""&&Writes("Give")==1,"残余池非零不能再获得安全新增票据");
        Game.Player.Character.Pools[22]=0;menu.Reset();Frame();Select("weapon-refresh");Press("Return");
        Select("weapon-page:2");Press("Return");Select("weapon-item:0");Press("Return");
        // Search persisted and still selects the same pistol.
        Select("weapon-grant");Runtime.Definitions[(uint)WeaponHash.Pistol].Loaded=false;Press("Return");Press("Return");
        check(controller.Pending&&Writes("Give")==1,"资源未加载时真实Tick不Give");
        Press("F5");Runtime.Definitions[(uint)WeaponHash.Pistol].Loaded=true;Frame();check(!controller.Pending&&Writes("Give")==1,"F5隐藏取消已确认等待，不重放");
        Open();Select("weapon-grant");Press("Return");Press("Return");check(Writes("Give")==2,"明确重新预览可重新发放");
        Select("weapon-remove");Press("Return");GtaInputPort.AfterRead=()=>GtaInputPort.Focused=false;Frame();GtaInputPort.AfterRead=null;GtaInputPort.Focused=true;Frame();Open();
        check(controller.Confirmation==""&&controller.UnownedCount>0,"焦点缺口清预览并保留失权记录");
        Select("weapon-remove");Press("Return");check(Writes("Remove")==1,"同actor恢复也不移除失权项目");
        // Show catalog rooted in a synthetic host executable; actual Win32 identity path remains production.
        menu.Reset();Frame();var fakeGame=Path.Combine(Gems.GameAssistant.Environment.Root,"synthetic host 中文");Directory.CreateDirectory(fakeGame);
        Gems.GameAssistant.Process.ExecutableFile=Path.Combine(fakeGame,"GTA5_Enhanced.exe");File.WriteAllText(Gems.GameAssistant.Process.ExecutableFile,"fixture; never executed");
        var packetDirectory=Path.Combine(Gems.GameAssistant.Environment.Root,"GEMS","bridge");Directory.CreateDirectory(packetDirectory);
        var actualRoot=WeaponGameIdentity.CanonicalGameRoot(fakeGame);var packet=new {schemaVersion=1,component="GEMS.WeaponCatalog",protocol="gems.weapon-catalog.v1",revision=new string('a',64),gameRoot=actualRoot,gameRootId=WeaponGameIdentity.GameRootId(actualRoot),targetGame="enhanced",requiresGameRestart=true,weapons=new[]{new{id=new string('b',64),modId="fixture",name="目录手枪",weaponName="WEAPON_PISTOL",hash="1b06d571",kind="addon",evidence=new[]{new{kind="weapons-meta",sourcePath="weapons.meta",sourceSha256=new string('c',64),sourceBytes=1,locator="Name"}},transactionId="tx-1",fileState="verified",registration="unknown",dependencies="unknown",issues=new[]{"需要实际效果检查"}}},issues=Array.Empty<string>()};
        File.WriteAllText(Path.Combine(packetDirectory,WeaponCatalog.FileName),JsonSerializer.Serialize(packet),new UTF8Encoding(false));
        Select("weapon-refresh");Press("Return");Select("weapon-page:3",true);Pad("FrontendAccept");check(ChinesePanel.Rows.Any(r=>r.Key=="weapon-item:0"),"GEMS独立目录由实际reader进入真实手柄列表");
        Select("weapon-item:0",true);Pad("FrontendAccept");check(ChinesePanel.Rows.Any(r=>r.Key=="weapon-source"&&r.Label.Contains("注册未知")),"目录未知注册始终可见不冒充加载");
        Select("weapon-ammo",true);Pad("FrontendAccept");check(controller.Confirmation=="ammo","匹配host/runtime允许未知元数据独立动作预览");
        File.AppendAllText(Path.Combine(packetDirectory,WeaponCatalog.FileName)," ");Pad("FrontendAccept");check(Writes("ADD_AMMO_TO_PED")==1&&controller.Confirmation=="","同revision不同字节在实际提交前拒绝");
        // Partial mutation and result journal failure remain audit failures, never replayed.
        menu.Reset();Frame();Select("weapon-refresh");Press("Return");Select("weapon-page:1");Press("Return");menu.Filter("1b06d571");Frame();Select("weapon-item:0");Press("Return");
        Select("weapon-ammo");Press("Return");Runtime.AfterWrite=w=>{if(w.Method=="ADD_AMMO_TO_PED")throw new IOException("after ammo mutation");};Press("Return");Runtime.AfterWrite=null;Frame();
        check(Writes("ADD_AMMO_TO_PED")==2&&controller.LastResult.Contains("未确认"),"真实底层调用后抛错保留可能部分生效");
        Frame();check(Writes("ADD_AMMO_TO_PED")==2,"异常后不重试一次性补弹");
        check(Directory.GetFiles(journalDirectory,"*.result").Any(file=>File.ReadAllText(file).Contains("state=unknown-partial")),"真实结果日志保留partial");
        script.RaiseAbort();check(!controller.Pending,"脚本退出不重放或自动清库存");
    }
}
