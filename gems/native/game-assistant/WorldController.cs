using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    // Runs unchanged against the production port and the offline call-recording fixture.
    public sealed class WorldController
    {
        private readonly IWorldPort port;
        private readonly Func<DateTime> now;
        private bool active;
        private WorldSession session;
        private TimeSpan? previousTime;
        private readonly Dictionary<PlayerIdentity, bool> frozen = new Dictionary<PlayerIdentity, bool>();
        private readonly HashSet<PlayerIdentity> managed = new HashSet<PlayerIdentity>();
        private readonly List<PlayerIdentity> plan = new List<PlayerIdentity>();
        private int abandoned;
        private int unconfirmed;
        private string confirmation = "";
        private DateTime deadline, planDeadline;
        public WorldView View { get; } = new WorldView();
        public WorldController(IWorldPort port, Func<DateTime>? now = null) { this.port = port; this.now = now ?? (() => DateTime.UtcNow); }
        private string Say(string text) { View.Notice = text; port.Log("世界控制", text); return text; }
        private void GlobalRequest() { if (View.GlobalRequestCount < int.MaxValue) View.GlobalRequestCount++; }
        public void ClearConfirmation() { confirmation = ""; }
        private bool Confirm(string key)
        {
            if (confirmation == key && now() <= deadline) { confirmation = ""; return true; }
            confirmation = key; deadline = now().AddSeconds(10); return false;
        }
        private WorldSession Check()
        {
            if (!port.TrySession(out var current)) { Suspend(); throw new InvalidOperationException("故事模式守卫拒绝；未继续访问世界接口。"); }
            if (active && !session.Equals(current)) Suspend();
            if (!active) { session = current; active = true; View.Build = current.Build; port.Log("世界上下文", "build=" + current.Build + "; actor=" + current.Actor.PlayerHandle + "; model=" + current.Actor.ModelHash + "; gameValidation=not-tested"); }
            return session;
        }
        private void ClearPlan() { plan.Clear(); View.PlanCount = 0; View.PlanKind = ""; confirmation = ""; }
        public void Suspend()
        {
            View.PedActive = View.TrafficActive = false; ClearPlan();
            if (!active) return;
            active = false; abandoned += frozen.Count; frozen.Clear(); managed.Clear();
            View.FrozenCount = abandoned + unconfirmed; View.ManagedCount = 0; previousTime = null; View.HasPreviousTime = false;
            View.InterruptedFrozenCount = abandoned;
            View.PreviousSessionPending |= abandoned > 0 || unconfirmed > 0 || View.GlobalRequestCount > 0;
            Say("会话中断：持续请求已停；冻结未恢复 " + abandoned + "；一次性世界设置未自动重设。");
        }
        public void Tick()
        {
            try
            {
                var current = Check(); ValidateDrafts();
                if (View.PedActive) port.SetPedDensity(current, View.PedPercent / 100f);
                if (View.TrafficActive) { Check(); port.SetTrafficDensity(current, View.TrafficPercent / 100f); }
                if (plan.Count > 0 && now() > planDeadline) ClearPlan();
            }
            catch { View.PedActive = View.TrafficActive = false; ClearPlan(); throw; }
        }
        public void Abort()
        {
            View.PedActive = View.TrafficActive = false; ClearPlan();
            if (!active) return;
            if (!port.TrySession(out var current) || !session.Equals(current)) { Suspend(); return; }
            RestoreFrozen();
            Say("助手退出：已停止密度请求；冻结未恢复 " + View.FrozenCount + "；一次性时钟/速度/重力/警方设置不自动重设。");
        }
        private static void ValidateTime(TimeSpan time)
        {
            if (time < TimeSpan.Zero || time >= TimeSpan.FromDays(1) || time.Ticks % TimeSpan.TicksPerSecond != 0)
                throw new InvalidOperationException("游戏时刻无效，未以异常读取建立恢复记录。");
        }
        private string ChangeTime(TimeSpan value, bool restoring)
        {
            ValidateTime(value); var current = Check(); var before = port.ReadTime(current); ValidateTime(before);
            if (!previousTime.HasValue && !restoring) { previousTime = before; View.HasPreviousTime = true; }
            // Keep the before-time even if the setter changes state and then throws.
            GlobalRequest(); port.SetTime(current, value);
            var readback = port.ReadTime(current); ValidateTime(readback);
            View.Clock = readback.ToString(@"hh\:mm\:ss", CultureInfo.InvariantCulture);
            return Say("调时请求完成；读取 " + View.Clock + "；不恢复日期/任务，光照待实测。");
        }
        private static int Adjust(int value, int delta, int min, int max)
            => (int)Math.Max(min, Math.Min(max, (long)value + delta));
        private void ValidateDrafts()
        {
            if (View.Hour < 0 || View.Hour > 23 || View.Minute < 0 || View.Minute > 59 || View.PedPercent < 0 || View.PedPercent > 100 ||
                View.TrafficPercent < 0 || View.TrafficPercent > 100 || View.SpeedPercent < 10 || View.SpeedPercent > 100 || View.GravityIndex < 0 || View.GravityIndex >= WorldOptions.Gravity.Length)
                throw new ArgumentOutOfRangeException("draft", "世界参数超出本版允许范围。");
        }
        public string Execute(string key, int delta = 0)
        {
            if (delta < -1 || delta > 1) throw new ArgumentOutOfRangeException(nameof(delta));
            var current = Check(); ValidateDrafts();
            if (key == "time-hour" || key == "time-minute")
            {
                ClearConfirmation(); if (key == "time-hour") View.Hour = Adjust(View.Hour, delta, 0, 23); else View.Minute = Adjust(View.Minute, delta, 0, 59);
                return Say("调时草稿 " + View.Hour.ToString("00") + ":" + View.Minute.ToString("00") + "；选择应用后写入。");
            }
            if (key == "time-apply") return ChangeTime(new TimeSpan(View.Hour, View.Minute, 0), false);
            if (key == "time-day") return ChangeTime(new TimeSpan(12, 0, 0), false);
            if (key == "time-night") return ChangeTime(new TimeSpan(22, 0, 0), false);
            if (key == "time-previous")
            {
                if (!previousTime.HasValue) return Say("本会话没有可用的调整前时刻。");
                if (!Confirm(key)) return Say("再次确认：重设调整前时刻；不补偿经过时间或恢复日期。");
                return ChangeTime(previousTime.Value, true);
            }
            if (key == "time-pause" || key == "time-resume")
            {
                if (!Confirm(key)) return Say(key == "time-pause" ? "再次确认冻结时钟；原暂停状态未知，不自动恢复。" : "再次确认解除时钟暂停；也可能解除其他脚本暂停。");
                GlobalRequest(); port.PauseClock(current, key == "time-pause"); View.PauseRequested = key == "time-pause";
                return Say("时钟" + (View.PauseRequested ? "冻结" : "解除") + "请求已发送；未读取原暂停状态，效果待观察。");
            }
            if (key == "density-ped" || key == "density-traffic")
            {
                ClearConfirmation();
                if (key == "density-ped") { if (delta == 0) View.PedActive = !View.PedActive; else View.PedPercent = Adjust(View.PedPercent, delta * 10, 0, 100); }
                else { if (delta == 0) View.TrafficActive = !View.TrafficActive; else View.TrafficPercent = Adjust(View.TrafficPercent, delta * 10, 0, 100); }
                return Say("密度为本助手逐帧请求；停止请求不删除实体，也不读取原倍率。");
            }
            if (key == "speed-scale") { ClearConfirmation(); View.SpeedPercent = Adjust(View.SpeedPercent, delta * 10, 10, 100); return Say("世界速度草稿；应用为一次性设置，不自动重设原倍率。"); }
            if (key == "gravity-choice") { ClearConfirmation(); View.GravityIndex = (View.GravityIndex + (delta < 0 ? 3 : 1)) % 4; return Say("重力预设草稿；应用不恢复已发生的物理运动。"); }
            if (key == "speed-apply" || key == "gravity-apply")
            {
                var id = key + ":" + (key == "speed-apply" ? View.SpeedPercent : View.GravityIndex);
                if (!Confirm(id)) return Say("再次确认一次性" + (key == "speed-apply" ? "世界速度" : "重力") + "设置；原值未知，不自动恢复。");
                GlobalRequest(); if (key == "speed-apply") port.SetTimeScale(current, View.SpeedPercent / 100f); else port.SetGravity(current, WorldOptions.Gravity[View.GravityIndex]);
                return Say("世界设置请求已发送；未读取原值，实际效果待实测。");
            }
            if (key.StartsWith("police-", StringComparison.Ordinal))
            {
                if (key != "police-ignore-on" && key != "police-ignore-off" && key != "police-dispatch-on" && key != "police-dispatch-off") throw new ArgumentException("未知警方动作。");
                if (!Confirm(key)) return Say(key == "police-ignore-on" ? "再次确认：忽略玩家并停止NPC警车；停车运动不能还原。" : "再次确认警方一次性设置；原状态未知，不自动还原。");
                GlobalRequest(); if (key.StartsWith("police-ignore-", StringComparison.Ordinal)) port.SetPoliceIgnore(current, key.EndsWith("-on", StringComparison.Ordinal));
                else port.SetPoliceDispatch(current, key.EndsWith("-on", StringComparison.Ordinal));
                return Say("警方设置请求已发送；无可靠原值读回，行为待实测。");
            }
            if (key == "weather-read") { ClearConfirmation(); View.Weather = port.ReadWeather(current); return Say("读取 " + View.Weather + "；不代表完整过渡或版本支持。"); }
            if (key.StartsWith("weather:", StringComparison.Ordinal))
            {
                var id = key.Substring(8); if (!WorldOptions.Weather.Any(choice => choice.Id == id)) throw new ArgumentException("未知天气候选。");
                if (!Confirm(key)) return Say("再次确认 SDK 天气候选；当前版本未实测，不恢复天气脚本状态。");
                GlobalRequest(); port.SetWeather(current, id); View.Weather = port.ReadWeather(current);
                port.Log("天气候选请求", "build=" + current.Build + "; candidate=" + id + "; " + View.Weather + "; effect=not-tested");
                return Say("天气请求已发送；" + View.Weather + "；天空/雨雪效果待观察。");
            }
            if (key == "entities-preview-freeze" || key == "entities-preview-clean") return Preview(key.EndsWith("clean", StringComparison.Ordinal));
            if (key == "entities-apply-freeze") return ApplyFreeze();
            if (key == "entities-restore") { ClearPlan(); return RestoreFrozen(); }
            if (key == "entities-clean") return Clean();
            throw new ArgumentException("未知世界菜单动作：" + key);
        }
        private static bool Safe(WorldEntity item, bool own)
        {
            if (item.Identity.Address == 0 || !WorldOptions.Finite(item.Distance) || item.Distance < 0 || item.Distance > 10 || !WorldOptions.Finite(item.Speed) || item.Speed > 0.5f || item.Speed < 0) return false;
            if (item.IsPlayer || item.IsPlayerVehicle || item.Occupied || item.Attached) return false;
            if (own) return item.Kind == "vehicle" && item.OwnedByScript && item.Persistent;
            return (item.Kind == "vehicle" || item.Kind == "ped") && !item.OwnedByScript && !item.Persistent;
        }
        public void RegisterManaged(WorldSession expected, PlayerIdentity identity)
        {
            if (!Check().Equals(expected)) throw new InvalidOperationException("创建期间会话已变化。");
            if (identity.Address == 0 || managed.Count >= 16) throw new InvalidOperationException("本实例临时车辆记录已满或身份无效。");
            managed.Add(identity); View.ManagedCount = managed.Count;
            port.Log("登记临时实体", identity.PedHandle + " / " + identity.ModelHash + "；只在当前脚本实例管理。");
        }
        private string Preview(bool clean)
        {
            ClearPlan(); var current = Check(); var skipped = 0;
            var candidates = new List<WorldEntity>();
            if (clean)
            {
                foreach (var id in managed.ToArray())
                {
                    var item = port.ReadEntity(current, id);
                    if (item == null || !item.Identity.Equals(id)) { managed.Remove(id); skipped++; }
                    else candidates.Add(item);
                }
                View.ManagedCount = managed.Count;
            }
            else candidates.AddRange(port.Nearby(current, 10, 128));
            var items = candidates.ToArray();
            foreach (var item in items)
            {
                if (plan.Count >= 32 || (!clean && plan.Count + frozen.Count >= 32) || !Safe(item, clean) || (clean && !managed.Contains(item.Identity)) || item.Frozen || plan.Contains(item.Identity)) { skipped++; continue; }
                plan.Add(item.Identity);
            }
            View.PlanKind = clean ? "clean" : "freeze"; View.PlanCount = plan.Count; planDeadline = now().AddSeconds(10);
            return Say((clean ? "清理" : "冻结") + "预览：10米内 " + plan.Count + " 个，跳过 " + skipped + "；10秒有效，执行前重查。");
        }
        private void RequirePlan(string kind)
        {
            Check(); if (View.PlanKind != kind || plan.Count == 0 || now() > planDeadline) { ClearPlan(); throw new InvalidOperationException("计划为空或过期，请重新预览。"); }
        }
        private string ApplyFreeze()
        {
            RequirePlan("freeze"); var current = session; var done = 0; var skipped = 0; var failed = 0;
            var targets = plan.ToArray(); ClearPlan();
            foreach (var target in targets)
            {
                try
                {
                    if (!Check().Equals(current)) { failed++; break; }
                    var item = port.ReadEntity(current, target);
                    if (item == null || !item.Identity.Equals(target) || !Safe(item, false) || item.Frozen) { skipped++; continue; }
                    frozen[target] = false; // Record before write: a throwing setter may have applied.
                    View.FrozenCount = frozen.Count + abandoned + unconfirmed;
                    port.SetFrozen(current, target, false, true);
                    var after = port.ReadEntity(current, target);
                    if (after == null || !after.Identity.Equals(target) || !after.Frozen) { failed++; continue; }
                    done++;
                }
                catch (Exception error) { failed++; port.Log("冻结未确认", target.PedHandle + ": " + error.Message); if (!active) break; }
            }
            View.FrozenCount = frozen.Count + abandoned + unconfirmed;
            return Say("冻结：读回 " + done + "，跳过 " + skipped + "，失败/未确认 " + failed + "；效果待实测。");
        }
        private string RestoreFrozen()
        {
            var current = Check(); var restored = 0; var failed = 0; var skipped = 0;
            foreach (var target in frozen.Keys.ToArray())
            {
                try
                {
                    if (!Check().Equals(current)) break;
                    var item = port.ReadEntity(current, target);
                    if (item == null || !item.Identity.Equals(target)) { frozen.Remove(target); skipped++; unconfirmed++; View.UnconfirmedFrozenCount = unconfirmed; continue; }
                    if (!item.Frozen) { frozen.Remove(target); restored++; continue; }
                    // Do not unfreeze entities that became owned, occupied or otherwise unsafe.
                    if (!Safe(item, false)) { failed++; continue; }
                    port.SetFrozen(current, target, true, false);
                    var after = port.ReadEntity(current, target);
                    if (after != null && after.Identity.Equals(target) && !after.Frozen) { frozen.Remove(target); restored++; } else failed++;
                }
                catch (Exception error) { failed++; port.Log("解冻未确认", error.Message); if (!active) break; }
            }
            View.FrozenCount = frozen.Count + abandoned + unconfirmed;
            return Say("条件解冻 " + restored + "，失败 " + failed + "，身份失效累计 " + unconfirmed + "，会话中断遗留 " + abandoned + "。");
        }
        private string Clean()
        {
            RequirePlan("clean"); if (!Confirm("clean:" + string.Join(",", plan.Select(id => id.PedHandle)))) return Say("再次确认删除本实例临时车辆；不可撤销，乘员/任务变化将跳过。");
            var current = session; var targets = plan.ToArray(); ClearPlan(); var done = 0; var skipped = 0; var failed = 0;
            foreach (var target in targets)
            {
                try
                {
                    if (!Check().Equals(current)) { failed++; break; }
                    var item = port.ReadEntity(current, target);
                    if (item == null) { managed.Remove(target); skipped++; continue; }
                    if (!managed.Contains(target) || !item.Identity.Equals(target) || !Safe(item, true) || item.Frozen) { skipped++; continue; }
                    port.DeleteManaged(current, target);
                    if (port.ReadEntity(current, target) == null) { managed.Remove(target); done++; } else failed++;
                }
                catch (Exception error) { failed++; port.Log("清理未确认", error.Message); if (!active) break; }
            }
            View.ManagedCount = managed.Count;
            return Say("清理：已消失 " + done + "，跳过 " + skipped + "，失败/未确认 " + failed + "；仅本实例记录。");
        }
    }
}
