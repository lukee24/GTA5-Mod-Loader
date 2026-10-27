using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class WeaponMenu
    {
        private readonly WeaponController controller;
        private readonly WeaponCatalogBridge bridge;
        private readonly WeaponActionsMenu? actions;
        private WeaponChoice? selected;
        private int page, returnPage, offset, amount = 10;
        private string query = "";
        public int Page => page == 10 ? 100 + actions!.Page : page;
        public string Query => query;
        public string Detail => page == 10 ? actions!.Detail : controller.PreviewText.Length != 0 ? "" : page == 5 && selected != null
            ? (selected.SourceAllowed ? "条件动作，不保证加载；同值外部接管无法辨认。" : "来源未满足条件，禁止动作；详细原因见日志。")
            : actions == null ? "单项条件操作；此接线未包含角色操作页。" : "角色操作页已接入清除/无限请求/组件；实际效果未测。";
        public WeaponMenu(WeaponController controller, WeaponCatalogBridge bridge, WeaponActionsMenu? actions = null) { this.controller = controller; this.bridge = bridge; this.actions = actions; }
        public void Cancel() { controller.Cancel("离开条目已取消武器预览和等待请求"); actions?.Cancel(); }
        public void Reset() { Cancel(); actions?.Reset(); page = offset = 0; selected = null; }
        public bool Back()
        {
            Cancel(); if (page == 0) return false;
            if (page == 10) { if (!actions!.Back()) page = 0; return true; }
            page = page == 5 ? returnPage : 0; selected = null; return true;
        }
        public void Filter(string value)
        {
            Cancel(); query = (value ?? "").Trim();
            if (query.Length > 64) query = query.Substring(0, 64);
            offset = 0;
        }
        private static string Short(string value, int length = 10)
        {
            if (string.IsNullOrEmpty(value)) return "名称未提供";
            var text = new StringInfo(value ?? "").SubstringByTextElements(0, Math.Min(new StringInfo(value ?? "").LengthInTextElements, length));
            return text.Length == value?.Length ? text : text + "…";
        }
        private WeaponChoice Runtime(uint hash)
        {
            var definition = controller.Definitions.FirstOrDefault(d => d.Hash == hash);
            return new WeaponChoice { Hash = hash, Name = definition?.Name ?? "", Source = "runtime", SourceToken = "runtime:" + hash.ToString("x8"), SourceAllowed = definition?.Valid == true,
                Warning = "仅当前运行定义；不证明来源、兼容或游戏效果。" };
        }
        private WeaponChoice[] List()
        {
            IEnumerable<WeaponChoice> result;
            if (page == 1) result = (controller.Inventory?.Items ?? new WeaponState[0]).Select(w => Runtime(w.Hash));
            else if (page == 2) result = controller.Definitions.Select(w => Runtime(w.Hash));
            else if (page == 3) result = bridge.Choices;
            else result = controller.Owned.Where(w => !w.Removed).Select(w => {
                var origin = bridge.Choices.FirstOrDefault(c => c.SourceId == w.SourceId && c.SourceToken == w.SourceToken);
                if (w.SourceId.Length != 0) return origin ?? new WeaponChoice { Hash = w.Hash, Name = w.State, Source = "catalog", SourceId = w.SourceId, SourceToken = w.SourceToken, SourceAllowed = false };
                return Runtime(w.Hash);
            });
            if (query.Length != 0) result = result.Where(w => w.Name.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0 || w.Hash.ToString("x8").IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0);
            return result.ToArray();
        }
        public MenuRow[] Rows()
        {
            if (page == 10) return actions!.Rows();
            if (page == 0) return new[] {
                new MenuRow("weapon-refresh", "刷新库存、运行定义与目录"),
                new MenuRow("weapon-page:1", "当前角色库存", controller.ReadValid ? "已读快照" : "须刷新"),
                new MenuRow("weapon-page:2", "运行定义", controller.Definitions.Length.ToString()),
                new MenuRow("weapon-page:3", "GEMS 武器目录", bridge.Choices.Length.ToString()),
                new MenuRow("weapon-page:4", "本实例新增记录", controller.Owned.Count(w => !w.Removed).ToString()),
                new MenuRow("weapon-audit", "审计未确认 / 会话失权", controller.UnconfirmedCount + "/" + controller.UnownedCount),
                actions == null ? new MenuRow("weapon-limit", "全清/无限弹药/配件修改", "未接入", false) : new MenuRow("weapon-actions", "角色清除 / 无限请求 / 组件", "实验性，效果未测")
            };
            if (page == 5 && selected != null)
            {
                var state = controller.Inventory?.Find(selected.Hash);
                return new[] {
                    new MenuRow("weapon-name", selected.Hash.ToString("X8"), Short(selected.Name), false),
                    new MenuRow("weapon-source", selected.Source == "catalog" ? "GEMS目录：注册未知" : "运行定义：不证明来源", selected.SourceAllowed ? "需再检查" : "动作禁止", false),
                    new MenuRow("weapon-state", "库存/弹药池（读取快照）", state == null ? "未持有" : state.Ammo + "/" + state.PoolAmmo, false),
                    new MenuRow("weapon-ownership", "本实例记录", controller.Owned.LastOrDefault(o => o.Hash == selected.Hash)?.State ?? "无", false),
                    new MenuRow("weapon-grant", controller.Confirmation == "grant" ? "再次确认零弹药新增" : "单项零弹药新增", "不装备", selected.SourceAllowed),
                    new MenuRow("weapon-ammo", controller.Confirmation == "ammo" ? "再次确认一次性补弹" : "一次性补弹（+/-调值）", "+" + amount, selected.SourceAllowed),
                    new MenuRow("weapon-remove", controller.Confirmation == "remove" ? "再次确认条件移除" : "条件移除本实例新增项", "不扣残余弹药", selected.SourceAllowed),
                    new MenuRow("weapon-cancel", "取消预览或资源等待", controller.Pending ? "正在等待" : ""),
                    new MenuRow("weapon-back", "返回列表")
                };
            }
            var items = List(); if (offset >= items.Length) offset = 0;
            var rows = new List<MenuRow> { new MenuRow("weapon-back", "返回武器首页"), new MenuRow("weapon-search", "搜索名称 / hash", query.Length == 0 ? "全部" : Short(query, 10)), new MenuRow("weapon-search-clear", "清空搜索条件") };
            rows.AddRange(items.Skip(offset).Take(5).Select((choice, index) => new MenuRow("weapon-item:" + (offset + index), Short(choice.Name), choice.Hash.ToString("X8"))));
            if (items.Length == 0) rows.Add(new MenuRow("weapon-empty", "无匹配条目；可刷新或清空搜索", "", false));
            rows.Add(new MenuRow("weapon-next", "下一页", items.Length == 0 ? "0/0" : (offset / 5 + 1) + "/" + ((items.Length + 4) / 5)));
            return rows.ToArray();
        }
        public string Execute(string key, int direction, DateTime now)
        {
            if (key == "weapon-actions" && actions != null) { Cancel(); actions.Reset(); page = 10; return "先刷新角色观察；一次操作不承诺完整自动恢复。"; }
            if (page == 10 && actions != null) { if (key == "wa-back" && actions.Page == 0) { Back(); return "已返回武器首页。"; } return actions.Execute(key, direction, now); }
            if (key == "weapon-refresh") { bridge.Refresh(); return controller.Refresh(); }
            if (key == "weapon-back") { Back(); return "已返回；旧预览已取消。"; }
            if (key == "weapon-cancel") { Cancel(); return controller.LastResult; }
            if (key == "weapon-search-clear") { Filter(""); return "搜索条件已清空。"; }
            if (key == "weapon-audit") return "审计未确认 " + controller.UnconfirmedCount + "；会话失权 " + controller.UnownedCount + "；详细目录诊断见日志。";
            if (key.StartsWith("weapon-page:", StringComparison.Ordinal))
            { Cancel(); page = int.Parse(key.Substring(12), CultureInfo.InvariantCulture); if (page < 1 || page > 4) throw new ArgumentException("未知武器页"); offset = 0; return page == 3 ? bridge.Status : "请选择条目；显示快照不能证明加载。"; }
            if (key == "weapon-next") { Cancel(); var count = List().Length; offset = count == 0 ? 0 : (offset + 5 >= count ? 0 : offset + 5); return "已切换武器列表页。"; }
            if (key.StartsWith("weapon-item:", StringComparison.Ordinal))
            {
                Cancel(); var index = int.Parse(key.Substring(12), CultureInfo.InvariantCulture); var items = List();
                if (index < 0 || index >= items.Length) throw new InvalidOperationException("条目已变化，请重新选择。");
                selected = items[index]; returnPage = page; page = 5; return selected.SourceAllowed ? "来源/注册/效果未验证；修改前还需独立运行时检查。" : "来源未满足动作条件；详见本地武器诊断日志。";
            }
            if (selected == null) throw new InvalidOperationException("未选择武器。");
            if (key == "weapon-ammo" && direction != 0)
            { Cancel(); amount = Math.Max(1, Math.Min(WeaponRules.MaxAddition, amount + Math.Sign(direction) * 10)); return "补弹草稿 +" + amount + "；尚未提交，仍需二次确认。"; }
            if (direction != 0) return "此动作仅接受确认键。";
            if (key == "weapon-grant" || key == "weapon-ammo" || key == "weapon-remove")
                return controller.Execute(key.Substring(7), selected, key == "weapon-ammo" ? amount : 0, now);
            return "请选择可操作条目。";
        }
    }
}
