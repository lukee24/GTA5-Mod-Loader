using Gems.GameAssistant;
public static class VehicleInputTests
{
    public static void Run(Action<bool,string> check)
    {
        void Reject(Action action,string title) { try { action(); throw new Exception("未拒绝: "+title); } catch(ArgumentException) { check(true,title); } }
        check(VehicleRules.PaintValue("ff00Aa") == 0xff00aa, "RGB输入大小写归一");
        foreach(var value in new[]{" FF00 ","#FF0000","00000","1000000","GG0000","-10000","ＦＦ0000","\n00000"}) Reject(()=>VehicleRules.PaintValue(value),"拒绝非六位HEX: "+value);
        check(VehicleRules.PlateValue("gems 79") == "GEMS 79", "车牌明确转为ASCII大写");
        foreach(var value in new[]{"","123456789","中文","AB\nC","A_B","🚗"}) Reject(()=>VehicleRules.PlateValue(value),"拒绝非法或超长车牌");
        check(VehicleRules.NextModIndex(-1,3)==0 && VehicleRules.NextModIndex(2,3)==-1,"悬挂在原厂与有效档位间循环");
        foreach(var pair in new[]{(-2,3),(3,3),(-1,0),(int.MaxValue,3)}) Reject(()=>VehicleRules.NextModIndex(pair.Item1,pair.Item2),"无效改装读回不写入");
        check(!VehicleRules.Parked(float.NaN) && !VehicleRules.Parked(-1) && !VehicleRules.NearGround(float.NaN) && !VehicleRules.NearGround(-1),"停车和接地检查拒绝NaN与负值");
        var rows=VehicleMenu.Build(0,true,false,false,0,false,"");
        check(rows.Length==17 && rows.Select(row=>row.Key).Distinct().Count()==17,"真实车辆菜单16功能加独立恢复项");
        check(VehicleMenu.Build(0,false,false,false,0,false,"").Count(row=>row.Enabled)==1,"无当前车辆时仅允许恢复旧车记录");
        check(VehicleMenu.Build(0,true,false,false,0,false,"performance")[3].Label.StartsWith("确认"),"一次性改装有明确确认行");
        for(var page=1;page<=3;page++) check(VehicleMenu.Build(page,true,false,false,0,false,"").Last().Key=="vehicle-back","车辆子页返回 "+page);
    }
}
