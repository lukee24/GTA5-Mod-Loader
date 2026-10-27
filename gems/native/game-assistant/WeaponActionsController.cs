using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class WeaponChangeRecord
    {
        public string Id = "", Action = "", State = ""; public uint Weapon, Component;
        public WeaponActionSnapshot Before = new WeaponActionSnapshot(), After = new WeaponActionSnapshot();
        public bool Eligible, Restored;
    }
    // Actual Stage7 dispatcher. No persistent native flags are sampled or inferred from requests.
    public sealed class WeaponActionsController
    {
        private readonly IWeaponActionsPort port; private readonly IWeaponActionJournal journal;
        private readonly Action<string> revokePrevious;
        private readonly List<WeaponChangeRecord> changes = new List<WeaponChangeRecord>();
        private readonly List<WeaponRequestRecord> requests = new List<WeaponRequestRecord>();
        private Plan? preview; private ClearWait? clearWait; private bool auditFault; private string? error;
        public WeaponActionSnapshot? Snapshot { get; private set; }
        public string LastResult { get; private set; } = "请刷新角色操作观察；实际游戏效果未验证。";
        public string PreviewText => preview?.Warning ?? "";
        public string Confirmation => preview?.Action ?? "";
        public bool Pending => clearWait != null;
        public IReadOnlyList<WeaponChangeRecord> Changes => changes.AsReadOnly();
        public IReadOnlyList<WeaponRequestRecord> Requests => requests.AsReadOnly();
        public int UnconfirmedCount => journal.UnconfirmedCount;
        public const uint Unarmed = 0xa2719263;
        private sealed class Plan
        {
            internal string Action = "", Warning = ""; internal uint Weapon, Component; internal int Value;
            internal WeaponActionSnapshot Before = new WeaponActionSnapshot(); internal WeaponChangeRecord? Restore;
        }
        private sealed class ClearWait
        {
            internal Plan Plan = new Plan(); internal string Id = ""; internal DateTime Until; internal int Reads, StableReads;
            internal string Last = "";
        }
        public WeaponActionsController(IWeaponActionsPort port, IWeaponActionJournal journal, Action<string> revokePrevious)
        { this.port = port; this.journal = journal; this.revokePrevious = revokePrevious; }
        public string? TakeError() { var result = error; error = null; return result; }
        private WeaponSession Session()
        { if (!port.TrySession(out var result)) throw new InvalidOperationException("当前角色、故事模式或输入资格不可用。"); return result; }
        private WeaponActionSnapshot Stable(WeaponSession session, bool detailed, uint weapon = 0, bool diagnostics = false)
        {
            var a = port.Observe(session, detailed ? weapon : 0, diagnostics || detailed); var b = port.Observe(session, detailed ? weapon : 0, diagnostics || detailed);
            if (!a.Session.Equals(session) || !b.Session.Equals(session) || (detailed ? a.Fingerprint != b.Fingerprint : a.Identity != b.Identity))
                throw new InvalidOperationException("角色或库存连续观察不一致。");
            return b;
        }
        public string Refresh()
        {
            Cancel("刷新取消旧预览");
            try { Snapshot = Stable(Session(), false); journal.Verify(); auditFault = false; LastResult = "已观察角色库存 " + Snapshot.Items.Length + " 项；unknown不是0，效果待实测。"; }
            catch (Exception ex) { error = ex.ToString(); LastResult = "观察失败，未执行修改；详情见日志。"; Suspend("刷新中断"); }
            return LastResult;
        }
        public void Inspect(uint weapon)
        {
            Cancel("读取所选武器详情"); Snapshot = Stable(Session(), true, weapon);
        }
        private void Revoke(string reason)
        {
            foreach (var record in changes.Where(c => c.Eligible)) { record.Eligible = false; record.State = reason; }
            revokePrevious(reason);
        }
        public void Cancel(string reason)
        {
            var had = preview != null; preview = null;
            if (clearWait != null) EndClear(null, false, reason + "；清除请求已提交，未完成后续观察，不重发。");
            else if (had) LastResult = reason + "；仅取消未提交预览。";
        }
        public void Suspend(string reason)
        {
            Cancel(reason); Revoke(reason + "；旧恢复资格失效，历史保留");
            foreach (var record in requests) record.CurrentSession = false;
            port.ForgetSession(); Snapshot = null;
            const string persistent = "；无限请求可能仍生效，未自动关闭。";
            if (requests.Count > 0 && !LastResult.Contains(persistent)) LastResult += persistent;
        }
        private static bool Infinite(string action) => action == "pool-on" || action == "pool-off" || action == "clip-on" || action == "clip-off";
        private static bool Detailed(string action) => action == "component-install" || action == "component-remove" || action == "tint" || action == "restore";
        private static WeaponActionItem Item(WeaponActionSnapshot snapshot, uint hash)
        { if (hash == Unarmed) throw new InvalidOperationException("空手没有此操作。"); return snapshot.Find(hash) ?? throw new InvalidOperationException("目标不在当前库存。"); }
        private static WeaponComponentObservation Component(WeaponActionItem item, uint hash)
        {
            if (!item.ComponentsKnown) throw new InvalidOperationException("兼容组件定义未确认：" + item.ComponentIssue);
            var component = item.Find(hash) ?? throw new InvalidOperationException("目标组件已不在兼容定义中。");
            if (!component.Compatible) throw new InvalidOperationException("引擎兼容查询拒绝组件。");
            return component;
        }
        private void Validate(Plan p)
        {
            if (auditFault) throw new InvalidOperationException("结果日志失败；先处理记录问题再刷新。");
            var session = Session(); if (!session.Equals(p.Before.Session)) throw new InvalidOperationException("预览连续会话已失效。");
            var current = Stable(session, Detailed(p.Action), p.Weapon, p.Action.StartsWith("pool-", StringComparison.Ordinal));
            if ((Detailed(p.Action) ? current.Fingerprint != p.Before.Fingerprint : current.Identity != p.Before.Identity))
                throw new InvalidOperationException("预览后库存或组件状态已改变。");
            if (p.Action.StartsWith("pool-", StringComparison.Ordinal))
            {
                var before = Item(p.Before, p.Weapon); var target = Item(current, p.Weapon);
                if (!before.AmmoType.Known || before.AmmoType.Value == 0 || !target.AmmoType.Known || before.AmmoType.Value != target.AmmoType.Value)
                    throw new InvalidOperationException("弹药类型未知或改变；未提交池请求。");
                string Members(WeaponActionSnapshot s) => string.Join(",", s.Items.Where(i => i.AmmoType.Known && i.AmmoType.Value == before.AmmoType.Value).Select(i => i.Hash).OrderBy(i => i));
                if (current.Items.Any(i => i.Hash != Unarmed && !i.AmmoType.Known) || Members(current) != Members(p.Before))
                    throw new InvalidOperationException("共享弹药成员未确认或改变。");
            }
            else if (p.Action == "component-install" || p.Action == "component-remove") Component(Item(current, p.Weapon), p.Component);
            else if (p.Action == "tint")
            {
                var target = Item(current, p.Weapon);
                if (!target.Tint.Known || !target.TintCount.Known || p.Value < 0 || p.Value >= target.TintCount.Value) throw new InvalidOperationException("武器颜色范围未知或超限。");
            }
            else if (p.Action == "restore")
            {
                var r = p.Restore ?? throw new InvalidOperationException("没有本实例恢复记录。");
                if (!r.Eligible || r.Restored || r.After.Fingerprint != current.Fingerprint) throw new InvalidOperationException("当前状态与本次已确认after不符，未覆盖外部变化。");
            }
            else if (p.Action != "clear" && !Infinite(p.Action)) throw new InvalidOperationException("未知角色武器动作。");
        }
        public string Execute(string action, uint weapon, uint component, int value, string definition, DateTime now)
        {
            try
            {
                if (clearWait != null) throw new InvalidOperationException("清除已提交，正在只读观察；请等待或取消观察。");
                if (preview != null && preview.Action == action && preview.Weapon == weapon && preview.Component == component && preview.Value == value)
                { var ready = preview; preview = null; Validate(ready); Submit(ready, now); return LastResult; }
                Cancel("选择新动作");
                var before = Stable(Session(), Detailed(action), weapon, action.StartsWith("pool-", StringComparison.Ordinal));
                if (weapon != 0 && Detailed(action) && definition != Item(before, weapon).Definition) throw new InvalidOperationException("已显示的武器组件定义已改变，请刷新重新选择。");
                var p = new Plan { Action = action, Weapon = weapon, Component = component, Value = value, Before = before };
                Validate(p); journal.Verify();
                if (action == "clear" && before.Items.All(i => i.Hash == Unarmed)) { LastResult = "已观察到仅有空手；未调用清除。"; return LastResult; }
                if ((action == "component-install" || action == "component-remove") && Component(Item(before, weapon), component).Installed == (action == "component-install"))
                { LastResult = "组件安装状态已符合请求；未提交修改。"; return LastResult; }
                if (action == "tint" && Item(before, weapon).Tint.Value == value) { LastResult = "武器颜色已符合请求；未写入。"; return LastResult; }
                p.Warning = action == "clear" ? "再确认清除原有/MOD武器；无完整自动恢复，可能随游戏保存。"
                    : Infinite(action) ? (action.StartsWith("pool-", StringComparison.Ordinal) ? "当前共享弹药池" : "本角色全部武器弹匣") + (action.EndsWith("on", StringComparison.Ordinal) ? "请求开启；" : "强制关闭；") + "原值未知，不自动还原。"
                    : action == "tint" ? "再确认武器颜色 " + value + "；只提供已观测字段条件恢复。"
                    : "再确认组件" + (action == "component-install" ? "安装" : "移除") + "；可能互斥/改变弹药，非完整恢复。";
                preview = p;
                // A lightweight flag preview must not discard the selected component/tint observation.
                if (Snapshot == null || before.DetailWeapon != 0 || Snapshot.Identity != before.Identity) Snapshot = before;
                LastResult = p.Warning;
            }
            catch (Exception ex) { preview = null; error = ex.ToString(); LastResult = "角色操作未提交；请看具体诊断。"; }
            return LastResult;
        }
        public string PreviewRestore(string id, DateTime now)
        {
            try
            {
                if (clearWait != null) throw new InvalidOperationException("正在观察清除结果。");
                if (preview?.Action == "restore" && preview.Restore?.Id == id)
                { var ready = preview; preview = null; Validate(ready); Restore(ready); return LastResult; }
                Cancel("选择恢复");
                var record = changes.SingleOrDefault(r => r.Id == id) ?? throw new InvalidOperationException("恢复记录不存在。");
                var p = new Plan { Action = "restore", Weapon = record.Weapon, Component = record.Component, Before = Stable(Session(), true, record.Weapon), Restore = record,
                    Warning = "再确认恢复已观测组件/颜色；未知涂装及外部同值接管不能保证。" };
                Validate(p); journal.Verify(); preview = p; LastResult = p.Warning;
            }
            catch (Exception ex) { preview = null; error = ex.ToString(); LastResult = "条件恢复拒绝；历史保留，未覆盖当前状态。"; }
            return LastResult;
        }
        private bool Finish(string id, string state, WeaponActionSnapshot? after, string detail)
        {
            try { journal.FinishAction(id, state, after?.Canonical, detail); return true; }
            catch (Exception ex) { auditFault = true; error = (error ?? "") + "\n结果日志失败：" + ex; return false; }
        }
        private void Submit(Plan p, DateTime now)
        {
            string? id = null; var attempted = false; var returned = false; var observed = false; WeaponActionSnapshot? after = null; var detail = "";
            WeaponRequestRecord? request = null;
            try
            {
                Validate(p); id = journal.BeginAction(p.Action, p.Before.Canonical, p.Warning); Validate(p);
                // Authorization is consumed by the caller before this method. Old history stays, only authority is revoked.
                Revoke("新明确动作即将提交；旧恢复/移除资格失效");
                attempted = true;
                if (p.Action == "clear")
                {
                    port.Clear(p.Before.Session, p.Before); returned = true;
                    clearWait = new ClearWait { Id = id, Plan = p, Until = now.AddSeconds(3) };
                    LastResult = "清除请求已提交；只读核对中，不重发，不自动恢复。"; return;
                }
                if (Infinite(p.Action))
                {
                    request = new WeaponRequestRecord { Id = id, Scope = p.Action.StartsWith("pool-", StringComparison.Ordinal) ? "pool" : "ped-clip", Desired = p.Action.EndsWith("on", StringComparison.Ordinal),
                        Session = p.Before.Session, Weapon = p.Weapon, AmmoType = p.Weapon == 0 ? 0 : Item(p.Before, p.Weapon).AmmoType.Value, At = now, Submission = "may-have-applied", CurrentSession = true };
                    requests.Add(request);
                    if (request.Scope == "pool") port.InfinitePool(p.Before.Session, p.Before, p.Weapon, request.Desired);
                    else port.InfiniteClip(p.Before.Session, p.Before, request.Desired);
                    returned = true; request.Submission = "returned"; detail = "一次调用已返回；实际flag未知，原值未知，关闭不是恢复。";
                }
                else
                {
                    if (p.Action == "tint") port.WeaponTint(p.Before.Session, p.Before, p.Weapon, p.Value);
                    else port.Component(p.Before.Session, p.Before, p.Weapon, p.Component, p.Action == "component-install");
                    returned = true; after = Stable(p.Before.Session, true, p.Weapon); observed = ExpectedChange(p, p.Before, after);
                    detail = observed ? "请求字段已读回；仅已观测字段，未证明游戏效果或隐藏状态。" : "读回出现非预期差异/无效果；可能部分生效，未自动逆转。";
                }
            }
            catch (Exception ex) { detail = (attempted ? "调用可能已生效；" : "未进入原生修改；") + ex; error = detail; }
            var durable = id != null && Finish(id, Infinite(p.Action) && returned ? "request-returned-effect-unknown" : observed ? "observed-not-game-tested" : attempted ? "unknown-partial" : "not-submitted", after, detail);
            if (request != null) request.AuditDurable = durable;
            if (attempted && !Infinite(p.Action) && p.Action != "clear")
                changes.Add(new WeaponChangeRecord { Id = id ?? "", Action = p.Action, Weapon = p.Weapon, Component = p.Component, Before = p.Before, After = after ?? p.Before,
                    Eligible = observed && durable, State = observed && durable ? "已观测；可申请条件恢复" : "未确认；不提供猜测恢复" });
            Snapshot = after ?? Snapshot;
            LastResult = Infinite(p.Action) && returned ? "请求调用已返回；实际状态未知，可能持续生效；" + (durable ? "已记录。" : "结果记录失败。")
                : observed && durable ? "已读回组件/颜色；效果待实测，非完整恢复保证。" : attempted ? "操作可能部分生效；未回滚，详情见日志。" : "动作未提交；旧历史保留。";
            if (attempted && (!returned || (!Infinite(p.Action) && !observed) || !durable)) Suspend("操作结果未确认");
        }
        private static bool SameExceptComponent(WeaponActionSnapshot before, WeaponActionSnapshot after, uint hash)
            => before.Identity == after.Identity && before.Items.Where(i => i.Hash != hash).All(i => after.Find(i.Hash)?.Canonical == i.Canonical);
        private static bool ExpectedChange(Plan p, WeaponActionSnapshot before, WeaponActionSnapshot after)
        {
            if (!SameExceptComponent(before, after, p.Weapon)) return false;
            var a = Item(before, p.Weapon); var b = Item(after, p.Weapon);
            if (a.Definition != b.Definition) return false;
            if (p.Action == "tint")
            {
                if (!b.Tint.Known || b.Tint.Value != p.Value) return false;
                var original = b.Tint; b.Tint = a.Tint;
                try { return a.Canonical == b.Canonical; } finally { b.Tint = original; }
            }
            if (a.Fields != b.Fields || !a.ComponentsKnown || !b.ComponentsKnown) return false;
            var target = Component(a, p.Component); var actual = Component(b, p.Component);
            if (actual.Installed != (p.Action == "component-install")) return false;
            foreach (var original in a.Components)
            {
                var current = b.Find(original.Hash); if (current == null) return false;
                if (original.Hash == p.Component) continue;
                // A compatible sibling may be removed by a mutually exclusive install. All such changes are recorded.
                if (p.Action == "component-install" && original.Installed && original.Attachment == target.Attachment && !current.Installed) continue;
                if (original.Canonical != current.Canonical) return false;
            }
            return true;
        }
        private void EndClear(WeaponActionSnapshot? after, bool verified, string detail)
        {
            var wait = clearWait; clearWait = null; if (wait == null) return;
            var durable = Finish(wait.Id, verified ? "observed-not-game-tested" : "unknown-partial", after, detail);
            Snapshot = after; LastResult = verified && durable ? "观测库存只剩空手；实际游戏待测，无完整自动恢复。" : "清除已请求，结果未确认；不重试、不自动恢复。";
        }
        public void Tick(DateTime now)
        {
            if (clearWait != null)
            {
                var wait = clearWait;
                try
                {
                    if (!Session().Equals(wait.Plan.Before.Session)) throw new InvalidOperationException("清除观察会话中断。");
                    var after = port.Observe(wait.Plan.Before.Session); wait.Reads++;
                    if (after.Identity == wait.Last) wait.StableReads++; else { wait.Last = after.Identity; wait.StableReads = 1; }
                    if (after.Items.Length == 1 && after.Items[0].Hash == Unarmed && after.Current == Unarmed && wait.StableReads >= 2)
                        EndClear(after, true, "两个独立Tick观察只剩空手；不证明隐藏状态或完整恢复。");
                    else if (now >= wait.Until || wait.Reads >= 120) EndClear(after, false, "有界观察结束，结果未确认；不重复清除。");
                }
                catch (Exception ex) { error = ex.ToString(); EndClear(null, false, "观察失败：" + ex.Message); Suspend("清除观察中断"); }
            }
            if (preview != null || changes.Any(r => r.Eligible) || requests.Any(r => r.CurrentSession))
                try
                {
                    var session = Session();
                    if ((preview != null && !preview.Before.Session.Equals(session)) || changes.Any(r => r.Eligible && !r.After.Session.Equals(session)) || requests.Any(r => r.CurrentSession && !r.Session.Equals(session))) Suspend("角色连续会话改变");
                }
                catch (Exception ex) { error = ex.ToString(); Suspend("角色资格中断"); }
        }
        private void Restore(Plan plan)
        {
            var record = plan.Restore!; var current = plan.Before; var completed = 0; var attempted = false;
            try
            {
                Validate(plan); var old = Item(record.Before, record.Weapon); var present = Item(current, record.Weapon);
                var steps = new List<Tuple<string, uint, int>>();
                if (record.Action == "tint")
                { if (!old.Tint.Known) throw new InvalidOperationException("没有已知原武器颜色。"); steps.Add(Tuple.Create("tint", 0u, old.Tint.Value)); }
                else
                {
                    if (!old.ComponentsKnown || old.Definition != present.Definition) throw new InvalidOperationException("原组件定义未知或已变化。");
                    foreach (var c in present.Components.Where(c => c.Installed && !old.Find(c.Hash)!.Installed)) steps.Add(Tuple.Create("component-remove", c.Hash, 0));
                    foreach (var c in old.Components.Where(c => c.Installed && !present.Find(c.Hash)!.Installed)) steps.Add(Tuple.Create("component-install", c.Hash, 1));
                    foreach (var c in old.Components.Where(c => c.Installed && c.Livery.Known))
                        if (present.Find(c.Hash)!.Livery.Canonical != c.Livery.Canonical) steps.Add(Tuple.Create("livery", c.Hash, c.Livery.Value));
                }
                if (steps.Count == 0) throw new InvalidOperationException("没有可提交的已知逆操作。");
                foreach (var step in steps)
                {
                    string? id = null; var stepAttempted = false; WeaponActionSnapshot? after = null; var good = false;
                    try
                    {
                        if (!Session().Equals(current.Session) || Stable(current.Session, true, record.Weapon).Fingerprint != current.Fingerprint) throw new InvalidOperationException("恢复步骤间状态变化。");
                        id = journal.BeginAction("restore-" + step.Item1, current.Canonical, "from=" + record.Id + ";known fields only");
                        if (!Session().Equals(current.Session) || Stable(current.Session, true, record.Weapon).Fingerprint != current.Fingerprint) throw new InvalidOperationException("恢复意图写入后状态变化。");
                        Revoke("条件恢复已开始；原票据已消费");
                        attempted = stepAttempted = true;
                        if (step.Item1 == "tint") port.WeaponTint(current.Session, current, record.Weapon, step.Item3);
                        else if (step.Item1 == "livery") port.ComponentLivery(current.Session, current, record.Weapon, step.Item2, step.Item3);
                        else port.Component(current.Session, current, record.Weapon, step.Item2, step.Item1 == "component-install");
                        after = Stable(current.Session, true, record.Weapon);
                        if (step.Item1 == "livery")
                        {
                            var component = Item(after, record.Weapon).Find(step.Item2);
                            good = component != null && component.Livery.Known && component.Livery.Value == step.Item3 && SameExceptComponent(current, after, record.Weapon);
                        }
                        else good = ExpectedChange(new Plan { Action = step.Item1, Weapon = record.Weapon, Component = step.Item2, Value = step.Item3 }, current, after);
                        if (!good) throw new InvalidOperationException("恢复单步读回不符合计划，未继续。");
                    }
                    catch (Exception ex)
                    {
                        if (id != null) Finish(id, stepAttempted ? "unknown-partial" : "not-submitted", after, ex.ToString());
                        throw;
                    }
                    if (!Finish(id!, "observed-not-game-tested", after, "单步已观测；整体仍待最终核对")) throw new InvalidOperationException("恢复结果记录失败。");
                    current = after!; completed++;
                }
                Snapshot = current;
                // Do not erase unknowns or forgive an active/livery mismatch merely because installation flags match.
                record.Restored = current.Fingerprint == record.Before.Fingerprint;
                record.Eligible = false; record.State = record.Restored ? "已观测字段恢复匹配，非隐藏状态保证" : "逆步骤已执行；部分观测仍不同，未称完整恢复";
                LastResult = record.State; if (!record.Restored) error = record.State;
            }
            catch (Exception ex)
            { error = (error == null ? "" : error + "\n") + "恢复停止：" + ex; LastResult = "恢复停止：已完成 " + completed + " 步，" + (attempted ? "当前步骤可能生效；未回滚。" : "当前步骤未提交。"); if (attempted) Suspend("恢复中断"); }
        }
    }
}

