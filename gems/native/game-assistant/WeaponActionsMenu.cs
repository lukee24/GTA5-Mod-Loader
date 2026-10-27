using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class WeaponActionsMenu
    {
        private readonly WeaponActionsController controller;
        private int page, offset, tint; private uint weapon, component; private string definition = "";
        public int Page => page;
        public string Detail => controller.PreviewText.Length != 0 ? "" : "效果待测；无限状态未知，不自动关闭。";
        public WeaponActionsMenu(WeaponActionsController controller) { this.controller = controller; }
        public void Cancel() => controller.Cancel("离开条目或隐藏菜单");
        public void Reset() { Cancel(); page = offset = 0; weapon = component = 0; definition = ""; }
        public bool Back()
        {
            Cancel(); if (page == 0) return false;
            page = page == 4 ? 3 : page == 3 ? 2 : page == 2 ? 1 : 0; offset = 0; return true;
        }
        private static string Key(uint hash) => hash.ToString("x8");
        private static string Flag(WeaponReading<bool> value) => value.Known ? value.Value ? "是" : "否" : "未知";
        private static string ActionLabel(string action) => action == "tint" ? "颜色" : action == "component-install" ? "安装" : "移除";
        private WeaponActionItem? Selected => controller.Snapshot?.Find(weapon);
        private bool Confirm(string action) => controller.Confirmation == action;
        public MenuRow[] Rows()
        {
            if (page == 0) return new[] {
                new MenuRow("wa-refresh","刷新当前角色观察（含未知字段）"),
                new MenuRow("wa-clear",Confirm("clear")?"再确认清除全部武器":"清除本角色全部武器","一次性"),
                new MenuRow("wa-clip-on",Confirm("clip-on")?"再确认全角色弹匣开启":"全角色弹匣：请求开启","未知"),
                new MenuRow("wa-clip-off",Confirm("clip-off")?"再确认全角色弹匣关闭":"全角色弹匣：强制关闭","未知"),
                new MenuRow("wa-inventory","库存组件、颜色、弹药池",controller.Snapshot?.Items.Length.ToString()??"须刷新"),
                new MenuRow("wa-records","组件/颜色操作与条件恢复",controller.Changes.Count.ToString()),
                new MenuRow("wa-request-log","最近无限请求",RequestSummary()),
                new MenuRow("wa-cancel","取消预览 / 停止后读",controller.Pending?"已请求":""),
                new MenuRow("wa-back","返回武器首页")
            };
            if (page == 1)
            {
                var items=(controller.Snapshot?.Items??new WeaponActionItem[0]).Where(i=>i.Hash!=WeaponActionsController.Unarmed).ToArray();
                var rows=new List<MenuRow>{new MenuRow("wa-back","返回角色操作")};
                rows.AddRange(items.Skip(offset).Take(5).Select(i=>new MenuRow("wa-item:"+Key(i.Hash)+":"+WeaponActionSnapshot.Digest(i.Definition),"库存 "+Key(i.Hash),"组件"+(i.ComponentsKnown?i.Components.Length.ToString():"未知"))));
                if(items.Length==0)rows.Add(new MenuRow("wa-empty","暂无已观察条目；先刷新","",false));
                rows.Add(new MenuRow("wa-next","下一页",PageText(items.Length))); return rows.ToArray();
            }
            var item=Selected;
            if(page==2 && item!=null) return new[] {
                new MenuRow("wa-name","已观察库存武器",Key(weapon),false),
                new MenuRow("wa-pool-on",Confirm("pool-on")?"再确认共享池开启":"共享弹药池：请求开启","未知"),
                new MenuRow("wa-pool-off",Confirm("pool-off")?"再确认共享池关闭":"共享弹药池：强制关闭","未知"),
                new MenuRow("wa-components","兼容组件管理",item.ComponentsKnown?item.Components.Length.ToString():"查看原因"),
                new MenuRow("wa-tint",Confirm("tint")?"再确认武器颜色":"武器颜色 +/- 草稿",tint+"/"+item.TintCount.Display,item.Tint.Known&&item.TintCount.Known),
                new MenuRow("wa-raw","弹药池/弹匣",item.Pool.Display+"/"+item.Clip.Display,false),
                new MenuRow("wa-back","返回库存列表")
            };
            if(page==3 && item!=null)
            {
                var rows=new List<MenuRow>{new MenuRow("wa-back","返回此武器")};
                rows.AddRange(item.Components.Skip(offset).Take(5).Select(c=>new MenuRow("wa-component:"+Key(c.Hash)+":"+WeaponActionSnapshot.Digest(item.Definition),Key(c.Hash),"安装"+(c.Installed?"是":"否")+" 活动"+Flag(c.Active))));
                rows.Add(new MenuRow("wa-next","下一页",PageText(item.Components.Length))); return rows.ToArray();
            }
            if(page==4 && item?.Find(component)!=null)
            {
                var part=item.Find(component)!;
                var restore=controller.Changes.LastOrDefault(r=>r.Weapon==weapon&&r.Eligible);
                return new[] {
                    new MenuRow("wa-part","组件 "+Key(component),"挂点"+part.Attachment,false),
                    new MenuRow("wa-installed","安装 / 活动",(part.Installed?"是":"否")+"/"+Flag(part.Active),false),
                    new MenuRow("wa-livery","色返回 / 可恢复值",part.LiveryRaw.Display+"/"+part.Livery.Display,false),
                    new MenuRow("wa-install",Confirm("component-install")?"再次确认安装组件":"安装此组件","可能互斥"),
                    new MenuRow("wa-remove",Confirm("component-remove")?"再次确认移除组件":"移除此组件","非完整还原"),
                    new MenuRow("wa-livery-limit","任意组件新色范围","接口未确认",false),
                    new MenuRow(restore==null?"wa-no-restore":"wa-restore:"+restore.Id,"恢复本次观测状态",restore==null?"无记录":"条件检查",restore!=null),
                    new MenuRow("wa-back","返回组件列表")
                };
            }
            if(page==5)
            {
                var items=controller.Changes.Reverse().ToArray();
                var rows=new List<MenuRow>{new MenuRow("wa-back","返回角色操作")};
                rows.AddRange(items.Skip(offset).Take(5).Select(r=>new MenuRow("wa-restore:"+r.Id,Key(r.Weapon)+" "+ActionLabel(r.Action),r.Eligible?"条件恢复":r.Restored?"已观察恢复":"失权/未确认",r.Eligible)));
                rows.Add(new MenuRow("wa-next","下一页",PageText(items.Length)));return rows.ToArray();
            }
            return new[]{new MenuRow("wa-back","当前目标已不可读，返回刷新")};
        }
        private string PageText(int count)=>count==0?"0/0":(offset/5+1)+"/"+((count+4)/5);
        private string RequestSummary()
        {
            var r=controller.Requests.LastOrDefault();
            return r==null?"无；实际未知":(r.CurrentSession?"本会话":"旧会话")+":"+(r.Desired?"开":"关")+"，状态未知";
        }
        public string Execute(string key,int direction,DateTime now)
        {
            if(key=="wa-refresh") return controller.Refresh();
            if(key=="wa-back"){Back();return "已返回，未隐式恢复已提交请求。";}
            if(key=="wa-cancel"){Cancel();return controller.LastResult;}
            if(key=="wa-request-log")
            {
                var r=controller.Requests.LastOrDefault();
                return r==null?"无请求记录；实际状态未知。":"上次"+r.Scope+"请求"+(r.Desired?"开启":"关闭")+"；"+r.Submission+"；实际未知，记录"+(r.AuditDurable?"已写":"未确认")+"。";
            }
            if(key=="wa-inventory"||key=="wa-records"||key=="wa-components")
            {
                Cancel();
                if(key=="wa-components"&&Selected?.ComponentsKnown!=true)
                {
                    var reason=Selected?.ComponentIssue??"";
                    return reason.Contains("elapsed-budget") ? "组件详情超过单次75毫秒预算；未返回部分定义。"
                        : reason.Contains("exceed-1024") ? "全局组件定义超过1024项；未返回截断结果。"
                        : "组件定义或读数无法确认；请刷新后重试。";
                }
                page=key=="wa-inventory"?1:key=="wa-records"?5:3;offset=0;return "仅已观测字段；未知项不冒充0，游戏效果未测。";
            }
            if(key=="wa-next")
            {Cancel();int count=page==1?(controller.Snapshot?.Items.Count(i=>i.Hash!=WeaponActionsController.Unarmed)??0):page==3?(Selected?.Components.Length??0):controller.Changes.Count;offset=offset+5>=count?0:offset+5;return "分页已切换，旧确认取消。";}
            if(key.StartsWith("wa-item:",StringComparison.Ordinal))
            {
                Cancel();var split=key.Split(':');var hash=uint.Parse(split[1],NumberStyles.HexNumber,CultureInfo.InvariantCulture);
                var item=controller.Snapshot?.Find(hash)??throw new InvalidOperationException("库存条目已改变。");
                if(split.Length!=3||WeaponActionSnapshot.Digest(item.Definition)!=split[2])throw new InvalidOperationException("已显示定义不符，请刷新。");
                controller.Inspect(hash); item=controller.Snapshot!.Find(hash)??throw new InvalidOperationException("详情读取后目标消失。");
                weapon=hash;definition=item.Definition;tint=item.Tint.Known?item.Tint.Value:0;page=2;offset=0;return "已选 "+Key(weapon)+"；当前库存不证明MOD来源。";
            }
            if(key.StartsWith("wa-component:",StringComparison.Ordinal))
            {
                Cancel();var split=key.Split(':');var hash=uint.Parse(split[1],NumberStyles.HexNumber,CultureInfo.InvariantCulture);
                if(Selected==null||split.Length!=3||WeaponActionSnapshot.Digest(Selected.Definition)!=split[2]||Selected.Find(hash)==null)throw new InvalidOperationException("组件定义已变，请刷新。");
                component=hash;page=4;return "组件 "+Key(hash)+"；安装与活动分别读取，实际效果待测。";
            }
            if(direction!=0)
            {
                if(key=="wa-tint"&&Selected?.TintCount.Known==true){Cancel();tint=Math.Max(0,Math.Min(Selected.TintCount.Value-1,tint+Math.Sign(direction)));return "武器颜色草稿 "+tint+"；未写入。";}
                return "此动作只接受确认，不按未知状态反转。";
            }
            if(key.StartsWith("wa-restore:",StringComparison.Ordinal))return controller.PreviewRestore(key.Substring(11),now);
            if(key=="wa-clear"||key=="wa-clip-on"||key=="wa-clip-off")return controller.Execute(key.Substring(3),0,0,0,"",now);
            if(key=="wa-pool-on"||key=="wa-pool-off")return controller.Execute(key.Substring(3),weapon,0,0,definition,now);
            if(key=="wa-install"||key=="wa-remove")return controller.Execute(key=="wa-install"?"component-install":"component-remove",weapon,component,0,definition,now);
            if(key=="wa-tint")return controller.Execute("tint",weapon,0,tint,definition,now);
            return "此条目是诊断信息，不会写入。";
        }
    }
}

