using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class PedMenu
    {
        private readonly PedController controller;private readonly PedCatalogBridge bridge;private readonly PedFavoriteStore favorites;private readonly SpawnQuota quota;
        private PedFavoritesSnapshot saved=new PedFavoritesSnapshot("empty",new Dictionary<string,string>());private string favoriteError="尚未读取人物收藏";
        private PedChoice? selected;private PedReceipt? result;private int page,offset,filter,count=1;private string query="";
        private static readonly string[] Filters={"全部候选","原版NPC","MOD人物","军事","警察","平民","动物","收藏人物"};
        private static readonly string[] Tags={"","","","military","police","civilian","animal",""};
        public int Page=>page;public string Query=>query;public string Detail=>"逐个提交；取消保留已创建对象；清理有条件，效果未实测。";
        public PedMenu(PedController controller,PedCatalogBridge bridge,PedFavoriteStore favorites,SpawnQuota quota){this.controller=controller;this.bridge=bridge;this.favorites=favorites;this.quota=quota;}
        public void Cancel()=>controller.Cancel("人物选择/页面已变化，停止未提交项");
        public void Reset(){Cancel();page=offset=0;selected=null;result=null;}
        public bool Back(){Cancel();if(page==0)return false;page=page==4?3:page==3?2:0;offset=0;return true;}
        public void Filter(string text){Cancel();query=(text??"").Trim();if(query.Length>64)query=query.Substring(0,64);offset=0;}
        private static string Short(string value,int length=11){var info=new StringInfo(value??"");return info.LengthInTextElements<=length?value:info.SubstringByTextElements(0,length)+"…";}
        private bool Favorite(PedChoice c)=>favoriteError==""&&saved.Has(c);
        private PedChoice[] List(){IEnumerable<PedChoice> choices=BuiltinPeds.Choices.Concat(bridge.Choices);if(filter==1)choices=choices.Where(c=>c.Source=="builtin");else if(filter==2)choices=choices.Where(c=>c.Source=="catalog");else if(filter==7)choices=choices.Where(c=>Favorite(c)||c.DesktopFavorite);else if(filter>=3)choices=choices.Where(c=>c.Tags.Contains(Tags[filter]));if(query!="")choices=choices.Where(c=>c.Name.IndexOf(query,StringComparison.OrdinalIgnoreCase)>=0||c.Hash.ToString("x8").Contains(query.ToLowerInvariant()));return choices.ToArray();}
        private static string State(PedReceipt r)=>r.Deleted?"已观察删除":r.State=="created-observed"?"已观察创建":r.State=="not-submitted"?"未提交":"结果未知";
        public MenuRow[] Rows()
        {
            if(page==1&&selected!=null)return new[]{new MenuRow("ped-info",Short(selected.Name),selected.Hash.ToString("X8"),false),new MenuRow("ped-source",selected.Source=="builtin"?"固定原版候选":"GEMS目录（来源快照）",selected.Allowed?"效果待测":"禁止动作",false),new MenuRow("ped-count","本批数量（+/-）",count.ToString()),new MenuRow("ped-create",controller.Confirming?"再次确认本批生成":"预览本批并确认",count+"个，非原子",selected.Allowed&&!controller.Pending),new MenuRow("ped-favorite","游戏本地收藏",Favorite(selected)?"已收藏":"未收藏",favoriteError==""),new MenuRow("ped-desktop-favorite","桌面导出收藏",selected.DesktopFavorite?"有":"无",false),new MenuRow("ped-cancel","取消未提交项",controller.Pending?"正在等待":""),new MenuRow("ped-back","返回人物列表")};
            if(page==3&&result!=null)return new[]{new MenuRow("ped-result-status","对象观测",State(result),false),new MenuRow("ped-result-issued","请求/返回",(result.NativeIssued?"是":"否")+"/"+(result.CallReturned?"是":"否"),false),new MenuRow("ped-result-audit","创建/清理日志",(result.AuditDurable?"已确认":"未确认")+"/"+(result.CleanupAuditDurable?"已确认":"未确认"),false),new MenuRow("ped-style","读取服装组件（只读）"),new MenuRow("ped-clean",controller.Confirming?"再次确认条件删除":"预览本实例条件清理","不可撤销",result.Eligible&&!result.Deleted),new MenuRow("ped-result-detail","完整结果写入本地日志"),new MenuRow("ped-back","返回结果列表")};
            if(page==4&&result!=null){var rows=new List<MenuRow>{new MenuRow("ped-back","返回此对象结果")};rows.AddRange(result.Style.Split(';').Where(s=>s.Length>0).Select((s,i)=>new MenuRow("ped-style-row:"+i,Short(s,22),"只读",false)));return rows.ToArray();}
            if(page==2){var items=controller.Results.Reverse().ToArray();if(offset>=items.Length)offset=0;return new[]{new MenuRow("ped-back","返回人物列表")}.Concat(items.Skip(offset).Take(5).Select(r=>new MenuRow("ped-result:"+r.Id,"本实例 "+r.Model.ToString("X8"),State(r)))).Concat(new[]{new MenuRow("ped-next","下一页结果",items.Length.ToString())}).ToArray();}
            var list=List();if(offset>=list.Length)offset=0;var output=new List<MenuRow>{new MenuRow("ped-refresh","刷新人物目录与收藏"),new MenuRow("ped-filter","人物分类（+/-）",Filters[filter]),new MenuRow("ped-search","搜索名称 / hash",query==""?"全部":Short(query)),new MenuRow("ped-clear-query","清空搜索条件")};
            output.AddRange(list.Skip(offset).Take(5).Select(c=>new MenuRow("ped-item:"+c.Id+":"+c.Token,Short(c.Name),(c.Source=="builtin"?"原版":"MOD")+(Favorite(c)?"·本地收藏":c.DesktopFavorite?"·桌面收藏":""))));
            if(list.Length==0)output.Add(new MenuRow("ped-empty","没有匹配人物；收藏损坏见诊断","",false));
            output.Add(new MenuRow("ped-next","下一页人物",list.Length==0?"0/0":(offset/5+1)+"/"+((list.Length+4)/5)));
            output.Add(new MenuRow("ped-results","本实例创建结果",controller.Results.Count+"项 / 额度"+quota.Charged));
            var available=new HashSet<string>(BuiltinPeds.Choices.Concat(bridge.Choices).Select(c=>c.Id+":"+c.Token));var orphan=saved.Entries.Count(e=>!available.Contains(e.Key+":"+e.Value));if(orphan>0)output.Add(new MenuRow("ped-orphan","旧版本收藏不可用于当前来源",orphan+"项",false));
            return output.ToArray();
        }
        public string Execute(string key,int direction)
        {
            if(key=="ped-refresh"){Reset();bridge.Refresh();try{saved=favorites.Read();favoriteError="";}catch(Exception ex){favoriteError=ex.ToString();}return bridge.Status+(favoriteError==""?" 收藏已读取。":" 收藏读取失败，旧文件保留。");}
            if(key=="ped-back"){Back();return "已返回，未提交项已取消。";}
            if(key=="ped-filter"){Cancel();filter=(filter+(direction<0?7:1))%8;offset=0;return "分类："+Filters[filter]+"；MOD分类来自导出用户标签。";}
            if(key=="ped-clear-query"){Filter("");return "已清空人物搜索。";}
            if(key=="ped-next"){Cancel();var length=page==2?controller.Results.Count:List().Length;offset=offset+5>=length?0:offset+5;return "已切换人物列表页。";}
            if(key=="ped-results"){Cancel();page=2;offset=0;return "实际提交结果按项保留；未知不等于未创建。";}
            if(key.StartsWith("ped-item:",StringComparison.Ordinal)){Cancel();selected=List().SingleOrDefault(c=>key=="ped-item:"+c.Id+":"+c.Token)??throw new InvalidOperationException("人物条目来源已变化。");page=1;return selected.Allowed?"生成会逐个检查，游戏效果待实测。":selected.Reason;}
            if(key.StartsWith("ped-result:",StringComparison.Ordinal)){Cancel();result=controller.Results.Single(r=>r.Id==key.Substring(11));page=3;return State(result);}
            if(key=="ped-count"){Cancel();count=Math.Max(1,Math.Min(4,count+(direction<0?-1:1)));return "批次草稿 "+count+"，未提交。";}
            if(key=="ped-cancel"){Cancel();return controller.Notice;}
            if(direction!=0)return "此项只接受确认键。";
            if(key=="ped-create"&&selected!=null)return controller.PrepareOrConfirm(selected,count);
            if(key=="ped-favorite"&&selected!=null){Cancel();if(favoriteError!="")throw new InvalidOperationException(favoriteError);saved=favorites.Toggle(saved.Revision,selected);return "游戏本地人物收藏已保存；未同步回桌面。";}
            if(key=="ped-clean"&&result!=null)return controller.Cleanup(result.Id);
            if(key=="ped-style"&&result!=null){controller.ReadStyle(result.Id);page=4;return "只读当前人物组件；SDK配饰0代表未戴。";}
            if(key=="ped-result-detail"&&result!=null)return result.Reason+"; 创建审计="+result.AuditDurable+"; 清理审计="+result.CleanupAuditDurable;
            return "请选择可用的人物操作。";
        }
        public string Diagnostics=>bridge.Detail+"\n"+favoriteError;
    }
}
