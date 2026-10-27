using System.Reflection;
using System.Windows.Forms;
using Gems.GameAssistant;
using GTA;

public static class PedFlow
{
    public static void Run(Action<bool,string> check)
    {
        check(!GemsAssistantScript.ExperimentalPedsEnabled,"生产默认关闭高级人物运行入口");GemsAssistantScript.ExperimentalPedsEnabled=true;
        PedFixture.Clear();Game.Player=new Player{Character=new Ped{Position=new GTA.Math.Vector3(0,0,0),ForwardVector=new GTA.Math.Vector3(0,1,0)}};Game.Allowed=true;Game.IsPaused=false;GtaInputPort.Focused=true;ChinesePanel.Legible=true;
        Gems.GameAssistant.Environment.Root=Path.Combine(Gems.GameAssistant.Environment.Root,"ped-flow-"+Guid.NewGuid().ToString("N"));
        var script=new GemsAssistantScript();var n=20000;
        T Field<T>(string key)=>(T)typeof(GemsAssistantScript).GetField(key,BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(script)!;
        void Frame(string[]? held=null){var tokens=held??Array.Empty<string>();Game.Held=tokens.Select(k=>(Keys)Enum.Parse(typeof(Keys),k)).ToHashSet();GtaInputPort.Frame=new InputFrame{Number=++n,Keys=tokens};script.RaiseTick();}
        void Press(string token){Frame();var key=(Keys)Enum.Parse(typeof(Keys),token);script.RaiseDown(key);Frame(new[]{token});script.RaiseUp(key);Frame();}
        void Select(string key){var rows=ChinesePanel.Rows;var index=Array.FindIndex(rows,r=>r.Key==key);check(index>=0,"人物实际Script存在条目 "+key);var view=Field<MenuViewport>("viewport");view.Reset(rows.Length);view.Move(index);Frame();}
        void SelectPrefix(string prefix){var row=ChinesePanel.Rows.First(r=>r.Key.StartsWith(prefix,StringComparison.Ordinal));Select(row.Key);}
        Frame();Frame();Press("F5");for(int i=0;i<7;i++)Press("Right");check(Field<int>("category")==7,"统一键盘路由到第8个人物分类");
        Select("ped-refresh");Press("Return");check(ChinesePanel.Rows.Any(r=>r.Key.StartsWith("ped-item:builtin:",StringComparison.Ordinal)),"缺少MOD目录仍显示明确原版候选");
        Select("ped-filter");Press("Add");Press("Add");Press("Add");check(ChinesePanel.Rows.First(r=>r.Key=="ped-filter").Value=="军事","人物分类草稿经统一调值到军事");
        Game.UserText="marine";Select("ped-search");Press("Return");check(Field<PedMenu>("pedMenu").Query=="marine","实际游戏输入回到Script后保存人物查询");
        SelectPrefix("ped-item:");Press("Return");check(Field<PedMenu>("pedMenu").Page==1,"真实人物详情菜单可达");
        Select("ped-favorite");Press("Return");check(ChinesePanel.Rows.First(r=>r.Key=="ped-favorite").Value=="已收藏","游戏本地人物收藏通过真实文件发布");
        Select("ped-count");for(int i=0;i<5;i++)Press("Add");check(ChinesePanel.Rows.First(r=>r.Key=="ped-count").Value=="4","人物批次数量有界为4");
        Select("ped-create");Press("Return");check(PedFixture.Calls.All(c=>c!="CREATE_PED"),"人物第一次确认只产生预览");Press("Return");check(Field<PedController>("peds").Pending,"第二次确认进入逐Tick资源准备");
        check(PedFixture.Calls.Contains("RequestModel")&&PedFixture.Calls.Contains("RequestCollision"),"模型和碰撞分别发起无参请求");
        PedFixture.Loaded=true;PedFixture.Collision=false;Frame();Frame();check(PedFixture.Calls.All(c=>c!="CREATE_PED"),"仅模型已加载不能创建人物");
        PedFixture.Collision=true;for(int i=0;i<12&&Field<PedController>("peds").Pending;i++){var before=PedFixture.Calls.Count(c=>c=="CREATE_PED");Frame();check(PedFixture.Calls.Count(c=>c=="CREATE_PED")-before<=1,"每实际Tick最多一个人物提交");}
        var controller=Field<PedController>("peds");var quota=Field<SpawnQuota>("spawnQuota");check(!controller.Pending&&controller.Results.Count==4,"四项批次按项完成且退出等待");check(controller.Results.All(r=>r.State=="created-observed"&&r.AuditDurable),"四项有真实Journal结果与对象读回");check(quota.Charged==4,"人物和车辆共用的实例额度记4项");
        Press("Escape");Select("ped-results");Press("Return");SelectPrefix("ped-result:");Press("Return");var inspected=controller.Results.Last();
        Select("ped-style");Press("Return");check(ChinesePanel.Rows.Any(r=>r.Key.StartsWith("ped-style-row:")),"当前已创建人物服装组件只读行可达");Press("Escape");
        Select("ped-clean");Press("Return");check(!PedFixture.Calls.Contains("DELETE_ENTITY"),"条件清理第一次确认不删除");Press("Return");check(PedFixture.Calls.Count(c=>c=="DELETE_ENTITY")==1&&inspected.Deleted,"第二次确认直接命名DELETE并观察原对象消失");check(inspected.CleanupAuditDurable&&quota.Charged==3,"清理单独审计且仅实际消失释放一个额度");
        Press("Escape");Press("Escape");SelectPrefix("ped-item:");Press("Return");Select("ped-count");Press("Subtract");Press("Subtract");check(ChinesePanel.Rows.First(r=>r.Key=="ped-count").Value=="2","批次可减为2项");
        Select("ped-create");Press("Return");var vehicleReservation=quota.Reserve("vehicle",1);Press("Return");check(!controller.Pending&&PedFixture.Calls.Count(c=>c=="CREATE_PED")==4,"已有车辆预约时人物确认拒绝且零新增");quota.End(vehicleReservation);
        Press("Return");PedFixture.OnCreate=()=>PedFixture.Collision=false;Press("Return");for(int i=0;i<6&&PedFixture.Calls.Count(c=>c=="CREATE_PED")==4;i++)Frame();check(PedFixture.Calls.Count(c=>c=="CREATE_PED")==5&&controller.Pending,"第二项资源失效时批次保持一项已创建");
        Press("F5");check(!controller.Pending&&!Field<bool>("opened"),"隐藏菜单取消剩余人物提交");PedFixture.OnCreate=null;PedFixture.Collision=true;Frame();Frame();check(PedFixture.Calls.Count(c=>c=="CREATE_PED")==5&&quota.Charged==4,"取消不重放第一项，也不释放已提交对象额度");
        Press("F5");Select("ped-create");Press("Return");PedFixture.Loaded=false;Press("Return");check(controller.Pending,"再次确认可建立独立新批次");GtaInputPort.Focused=false;Frame();check(!controller.Pending&&controller.Results.All(r=>!r.Eligible),"失焦中断批次并撤销全部旧清理权限");check(quota.Charged==4,"会话失权没有伪造已回收的额度");GtaInputPort.Focused=true;Frame();
        Press("F5");Select("ped-create");Press("Return");Press("Return");check(controller.Pending,"当前会话仍可发起新资源准备");var beforeAbort=PedFixture.Calls.Count(c=>c=="CREATE_PED");script.RaiseAbort();check(!controller.Pending&&PedFixture.Calls.Count(c=>c=="CREATE_PED")==beforeAbort,"真实Aborted终止未提交项，不额外生成人物");
        check(PedFixture.Calls.All(c=>c!="SET_ENTITY_AS_MISSION_ENTITY"),"实际人物链没有主动夺归属调用");
        GemsAssistantScript.ExperimentalPedsEnabled=false;
    }
}
