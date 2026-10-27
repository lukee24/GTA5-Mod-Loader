using System;
using System.Collections.Generic;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class WeaponController
    {
        private readonly IWeaponPort port;
        private readonly IWeaponJournal journal;
        private readonly Action<WeaponChoice, WeaponDefinition[]> validateSource;
        private readonly List<OwnedWeaponRecord> owned = new List<OwnedWeaponRecord>();
        private Plan? preview, pending;
        private DateTime deadline;
        private string? error;
        private bool writeFault;
        public string LastResidue { get; private set; } = "未读取";
        public WeaponDefinition[] Definitions { get; private set; } = new WeaponDefinition[0];
        public WeaponSnapshot? Inventory { get; private set; }
        public bool ReadValid { get; private set; }
        public bool Pending => pending != null;
        public string Confirmation => preview?.Action ?? "";
        public string LastResult { get; private set; } = "请主动刷新库存；目录与运行定义均不证明效果。";
        public string PreviewText => preview == null ? "" : preview.Warning;
        public IReadOnlyList<OwnedWeaponRecord> Owned => owned.AsReadOnly();
        public int UnconfirmedCount => journal.UnconfirmedCount;
        public int UnownedCount => owned.Count(o => !o.Removed && !o.Confirmed);
        private sealed class Plan
        {
            internal string Action = "", Warning = ""; internal int Amount;
            internal WeaponChoice Choice = new WeaponChoice(); internal WeaponSnapshot Before = new WeaponSnapshot();
            internal OwnedWeaponRecord? Owned;
        }
        public WeaponController(IWeaponPort port, IWeaponJournal journal, Action<WeaponChoice, WeaponDefinition[]> validateSource)
        { this.port = port; this.journal = journal; this.validateSource = validateSource; }
        public string? TakeError() { var value = error; error = null; return value; }
        private WeaponSession Session()
        { if (!port.TrySession(out var session)) throw new InvalidOperationException("故事模式、焦点或角色会话不可用。"); return session; }
        private WeaponSnapshot Stable(WeaponSession session, uint hash)
        {
            var first = port.Read(session, hash); var second = port.Read(session, hash);
            if (!first.Session.Equals(session) || first.Fingerprint != second.Fingerprint) throw new InvalidOperationException("连续读取的库存、槽位、弹药或配件不一致。");
            return second;
        }
        public string Refresh()
        {
            Cancel("用户刷新已取消旧预览和等待请求");
            try
            {
                var session = Session(); var definitions = port.Definitions(session);
                if (definitions.Length == 0 || definitions.Length > WeaponRules.MaxDefinitions || definitions.Select(d => d.Hash).Distinct().Count() != definitions.Length)
                    throw new InvalidOperationException("运行定义为空、重复或超限。");
                var snapshot = Stable(session, 0); Definitions = definitions; Inventory = snapshot; ReadValid = true;
                foreach (var item in owned.Where(o => !o.Removed && !o.Session.Equals(session))) { item.Confirmed = false; item.State = "会话中断，未移除"; }
                journal.Verify(); writeFault = false;
                LastResult = "已读取库存 " + snapshot.Items.Length + " 项与运行定义 " + definitions.Length + " 项；效果未实测。";
            }
            catch (Exception failure) { Fail("刷新失败", failure, true); }
            return LastResult;
        }
        public void Cancel(string reason)
        {
            var had = preview != null || pending != null; var release = pending; preview = pending = null;
            if (release != null)
                try { if (port.TrySession(out var session) && session.Equals(release.Before.Session)) port.ReleaseAsset(session, release.Choice.Hash); }
                catch (Exception failure) { error = "取消资源请求时未确认释放：" + failure.Message; }
            if (had) LastResult = reason + "；没有自动撤销已提交动作。";
        }
        public void Suspend(string reason)
        {
            var had = preview != null || pending != null;
            preview = pending = null; ReadValid = false; port.ForgetSession();
            foreach (var item in owned.Where(o => !o.Removed)) { item.Confirmed = false; item.State = "会话中断，原记录保留"; }
            if (had) LastResult = reason + "；已取消待提交请求，旧记录未恢复。";
        }
        public void InvalidateAuthority(string reason)
        {
            Cancel(reason); ReadValid = false;
            foreach (var item in owned.Where(o => !o.Removed)) { item.Confirmed = false; item.State = reason + "；原记录保留"; }
        }
        private void Fail(string stage, Exception failure, bool suspend)
        { error = stage + "：" + failure; LastResult = stage + "；未确认的结果见日志，未自动回滚。"; if (suspend) Suspend(stage); }
        private static WeaponChoice Copy(WeaponChoice choice) => new WeaponChoice { Hash = choice.Hash, Name = choice.Name, Source = choice.Source, SourceId = choice.SourceId, SourceToken = choice.SourceToken, Warning = choice.Warning, SourceAllowed = choice.SourceAllowed };
        private WeaponDefinition Definition(WeaponChoice choice, WeaponSession session)
        {
            var observed = port.InspectDefinition(session, choice.Hash);
            var current = new[] { observed };
            validateSource(choice, current);
            if (!choice.SourceAllowed) throw new InvalidOperationException("该来源尚未满足动作条件。");
            var definition = current.SingleOrDefault(d => d.Hash == choice.Hash && d.Valid);
            return definition ?? throw new InvalidOperationException("当前运行定义未匹配或 IsWeaponValid 拒绝。");
        }
        private void Validate(Plan plan)
        {
            if (writeFault) throw new InvalidOperationException("前次日志结果未确认；先修复记录问题并刷新。");
            var session = Session();
            if (!session.Equals(plan.Before.Session)) throw new InvalidOperationException("预览的连续角色会话已中断。");
            var definition = Definition(plan.Choice, session);
            var now = Stable(session, plan.Choice.Hash);
            if (now.Fingerprint != plan.Before.Fingerprint) throw new InvalidOperationException("预览后的库存、当前武器、弹药或配件已变化。");
            if (plan.Action == "grant") WeaponRules.Grant(now, definition);
            else if (plan.Action == "ammo") WeaponRules.SharedAddition(plan.Amount, now, plan.Choice.Hash);
            else if (plan.Action == "remove")
            {
                var record = plan.Owned ?? throw new InvalidOperationException("缺少本实例新增记录。");
                if (!record.Confirmed || record.Removed || !record.Session.Equals(session) || record.After.Fingerprint != now.Fingerprint || record.SourceToken != plan.Choice.SourceToken)
                    throw new InvalidOperationException("本助手新增项已变化或会话失效；未移除。");
                if (now.Current == plan.Choice.Hash || now.Find(plan.Choice.Hash) == null) throw new InvalidOperationException("请先在游戏中切换离开目标武器；当前项不移除。");
                var target = now.Find(plan.Choice.Hash)!;
                if (now.Items.Any(i => i.Hash != target.Hash && i.AmmoType == target.AmmoType)) throw new InvalidOperationException("出现共享弹药成员；禁止移除。");
            }
            else throw new InvalidOperationException("未知武器动作。");
        }
        public string Execute(string action, WeaponChoice choice, int amount, DateTime now)
        {
            try
            {
                if (pending != null) throw new InvalidOperationException("已有已确认请求在等待资源，请取消或等待。");
                if (preview != null && preview.Action == action && preview.Choice.Hash == choice.Hash && preview.Choice.SourceToken == choice.SourceToken && preview.Amount == amount)
                {
                    var ready = preview; preview = null; Validate(ready);
                    if (action == "grant")
                    { pending = ready; deadline = now.AddSeconds(5); port.RequestAsset(ready.Before.Session, choice.Hash); LastResult = "正在等待资源；5秒超时，返回或隐藏菜单取消。"; }
                    else Commit(ready);
                    return LastResult;
                }
                Cancel("旧武器预览已取消");
                var session = Session(); var before = Stable(session, choice.Hash);
                var plan = new Plan { Action = action, Choice = Copy(choice), Amount = amount, Before = before };
                if (action == "remove") plan.Owned = owned.LastOrDefault(o => o.Hash == choice.Hash && !o.Removed);
                Validate(plan); journal.Verify();
                var target = before.Find(choice.Hash);
                plan.Warning = action == "grant" ? "再次确认：零弹药发放，不自动装备；未知依赖可能失败。" : action == "ammo" ? "再次确认：+" + amount + " 弹药；共享 " + before.Items.Count(i => i.AmmoType == target!.AmmoType) + " 项，不自动扣回。" : "再次确认移除：同值接管/涂装不可辨；残余弹药不扣回。";
                preview = plan; LastResult = plan.Warning;
            }
            catch (Exception failure) { preview = null; if (pending != null) { pending = null; Suspend("资源请求失败"); } Fail("武器请求拒绝", failure, false); }
            return LastResult;
        }
        public void Tick(DateTime now)
        {
            if (preview != null || owned.Any(o => !o.Removed && o.Confirmed))
            {
                try
                {
                    var current = Session();
                    if ((preview != null && !preview.Before.Session.Equals(current)) || owned.Any(o => !o.Removed && o.Confirmed && !o.Session.Equals(current)))
                    { Suspend("武器连续会话改变"); return; }
                }
                catch (Exception failure) { Fail("武器连续会话检查失败", failure, true); return; }
            }
            if (pending == null) return;
            var plan = pending;
            try
            {
                if (!Session().Equals(plan.Before.Session)) throw new InvalidOperationException("等待资源期间连续会话改变。");
                if (now > deadline) throw new TimeoutException("武器资源5秒内未就绪。");
                if (!port.AssetLoaded(plan.Before.Session, plan.Choice.Hash)) return;
                pending = null;
                Commit(plan);
            }
            catch (Exception failure) { pending = null; Fail("武器等待中止", failure, true); }
            finally
            {
                if (pending == null)
                    try { if (port.TrySession(out var session) && session.Equals(plan.Before.Session)) port.ReleaseAsset(session, plan.Choice.Hash); }
                    catch (Exception failure) { error = (error ?? "") + "\n资源释放未确认：" + failure; }
            }
        }
        private void Commit(Plan plan)
        {
            string? id = null; WeaponSnapshot? after = null; var attempted = false; var verified = false; var detail = "";
            try
            {
                Validate(plan);
                if (plan.Action == "grant" && !port.AssetLoaded(plan.Before.Session, plan.Choice.Hash)) throw new InvalidOperationException("提交前资源不再可用。");
                id = journal.Begin(plan.Action, plan.Before, plan.Choice.Hash, plan.Amount, plan.Choice.SourceToken);
                Validate(plan);
                if (plan.Action == "grant" && !port.AssetLoaded(plan.Before.Session, plan.Choice.Hash)) throw new InvalidOperationException("记录后资源不再可用；未发放。");
                attempted = true;
                if (plan.Action == "grant") port.GiveZero(plan.Before.Session, plan.Before, plan.Choice.Hash);
                else if (plan.Action == "ammo") port.AddAmmo(plan.Before.Session, plan.Before, plan.Choice.Hash, plan.Amount);
                else port.RemoveOwned(plan.Before.Session, plan.Before, plan.Choice.Hash);
                after = Stable(plan.Before.Session, plan.Choice.Hash);
                if (plan.Action == "grant")
                {
                    var target = after.Find(plan.Choice.Hash);
                    verified = target != null && target.ClipKnown && target.Ammo == 0 && target.PoolAmmo == 0 && target.AmmoType == plan.Before.ProbeAmmoType && WeaponRules.ExistingUnchanged(plan.Before, after, plan.Choice.Hash);
                    detail = verified ? "新增对象和零弹药已读回；原项未观察到变化。" : "发放后状态不符合预览；未取得可移除所有权。";
                }
                else if (plan.Action == "ammo")
                {
                    var old = plan.Before.Find(plan.Choice.Hash)!; var target = after.Find(plan.Choice.Hash);
                    verified = target != null && after.Current == plan.Before.Current && after.Items.Length == plan.Before.Items.Length && after.Items.All(item => {
                        var previous = plan.Before.Find(item.Hash); if (previous == null) return false;
                        if (previous.AmmoType != old.AmmoType) return previous.Canonical == item.Canonical;
                        return item.PoolAmmo == previous.PoolAmmo + plan.Amount && item.Ammo == previous.Ammo + plan.Amount && item.Slot == previous.Slot && item.AmmoType == previous.AmmoType && item.ClipKnown == previous.ClipKnown && item.Clip == previous.Clip && item.Tint == previous.Tint && item.Components == previous.Components && item.MaxAmmo == previous.MaxAmmo;
                    });
                    detail = verified ? "共享弹药池增加量已读回；不提供自动扣回。" : "补弹后未能证明请求增量或关联状态；可能部分生效。";
                }
                else
                {
                    verified = after.Find(plan.Choice.Hash) == null && WeaponRules.ExistingUnchanged(plan.Before, after, plan.Choice.Hash);
                    LastResidue = after.ProbeAmmoType == plan.Before.ProbeAmmoType && after.ProbeAmmoType != 0 ? after.ProbePoolAmmo.ToString() : "未知（类型查询变化）";
                    detail = verified ? "目标已不存在；原有项未观察到变化，残余池=" + LastResidue + "，不称完整恢复。" : "移除后状态未确认；未继续写入。";
                }
            }
            catch (Exception failure) { detail = (attempted ? "调用可能部分生效；" : "尚未调用武器修改；") + failure; error = detail; }
            if (id != null)
                try { journal.Finish(id, verified ? "observed-not-game-tested" : attempted ? "unknown-partial" : "not-submitted", after, detail); }
                catch (Exception failure) { verified = false; writeFault = true; error = detail + "\n结果记录失败：" + failure; }
            if (plan.Action == "grant" && attempted)
                owned.Add(new OwnedWeaponRecord { Id = id ?? "unrecorded", Hash = plan.Choice.Hash, SourceId = plan.Choice.SourceId, SourceToken = plan.Choice.SourceToken, Session = plan.Before.Session, Before = plan.Before, After = after ?? plan.Before, Confirmed = verified, State = verified ? "条件所有权已记录" : "可能已新增，未确认" });
            else if (plan.Action == "remove" && plan.Owned != null) { plan.Owned.Removed = verified; plan.Owned.Confirmed = false; plan.Owned.State = verified ? "条件移除已读回" : "移除未确认"; }
            else if (plan.Action == "ammo")
                foreach (var record in owned.Where(o => o.Hash == plan.Choice.Hash && !o.Removed))
                { if (verified && record.Confirmed && record.After.Fingerprint == plan.Before.Fingerprint) record.After = after!; else { record.Confirmed = false; record.State = "弹药动作后未确认所有权"; } }
            if (verified)
            { Inventory = after; ReadValid = true; LastResult = plan.Action == "grant" ? "零弹药新增已读回；实际持握/效果待实测。" : plan.Action == "ammo" ? "补弹增量已读回；不自动扣回，效果待实测。" : "目标移除已读回；残余池 " + LastResidue + "，非完整恢复。"; }
            else { LastResult = attempted ? "武器调用结果未确认；可能部分生效，未回滚。" : "武器动作未提交；失败原因见本地日志。"; Suspend("武器动作中断"); }
            if (!verified && error == null) error = detail;
        }
    }
}
