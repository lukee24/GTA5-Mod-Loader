using System;
using System.Collections.Generic;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class InputEditor
    {
        private readonly InputProfileStore store;
        private InputProfileSnapshot snapshot;
        private InputProfile draft;
        private int capture = -1;
        private bool captureReady;
        private readonly HashSet<string> captured = new HashSet<string>(StringComparer.Ordinal);
        private DateTime deadline;
        private DateTime? cancelStarted;
        private InputProfileRecoveryPlan? recovery;
        public string RecoveryAudit => recovery == null ? "" : recovery.Fingerprint + " | " + string.Join(" | ", recovery.AffectedFiles);
        public string Message { get; private set; } = "其他 MOD 按键冲突未知；手柄打开组合默认未绑定。";
        public InputProfile Active => snapshot.Profile.Copy();
        public bool Capturing => capture >= 0;
        public bool Dirty { get; private set; }
        public bool ReadFailed { get; private set; }
        public InputEditor(InputProfileStore store)
        {
            this.store = store;
            snapshot = new InputProfileSnapshot { Profile = InputProfile.Defaults(), Revision = "" };
            draft = snapshot.Profile.Copy();
            try { snapshot = store.Read(); draft = snapshot.Profile.Copy(); }
            catch (Exception error) { ReadFailed = true; Message = "配置读取失败；仅临时默认映射，未覆盖原文件：" + error.Message; }
        }
        public MenuRow[] Rows()
        {
            var bindings = draft.Bindings.Select((b, i) => new MenuRow("input-bind:" + i, (b.Device == "keyboard" ? "键盘·" : "手柄·") + InputProfile.Label(b.Command) + (b.Id.EndsWith("-alias", StringComparison.Ordinal) ? "备用" : ""),
                b.Tokens.Length == 0 ? "未绑定" : b.Tokens.Length == 1 ? Short(b.Tokens[0]) : b.Tokens.Length + "键组合"));
            return bindings.Concat(new[] {
                new MenuRow("input-apply", "应用并保存映射", Dirty ? "存在预览改动" : "无改动"),
                new MenuRow("input-cancel", "取消预览", "保持实际映射"),
                new MenuRow("input-previous", "预览上一版映射", snapshot.Previous == null ? "没有上一版" : "需另行应用", snapshot.Previous != null),
                new MenuRow("input-default", "预览默认映射", "需另行应用"),
                new MenuRow("input-reload", "重新读取磁盘映射", "取消未保存预览"),
                new MenuRow("input-recover", recovery == null ? "预览损坏记录恢复" : "确认隔离并恢复可信映射", recovery == null ? "保留原记录" : recovery.AffectedFiles.Length + "份；不删除"),
                new MenuRow("input-info", "外部 MOD 冲突未知", "没有全局按键登记表", false)
            }).ToArray();
        }
        public static string Short(string token)
        {
            switch (token) { case "ControlKey": return "Ctrl"; case "Menu": return "Alt"; case "ShiftKey": return "Shift"; case "Return": return "Enter"; case "Oemplus": return "+"; case "OemMinus": return "-";
                case "FrontendUp": return "Pad↑"; case "FrontendDown": return "Pad↓"; case "FrontendLeft": return "Pad←"; case "FrontendRight": return "Pad→";
                case "FrontendAccept": return "Pad确认"; case "FrontendCancel": return "Pad返回"; case "FrontendLb": return "LB"; case "FrontendRb": return "RB"; case "FrontendLt": return "LT"; case "FrontendRt": return "RT"; default: return token; }
        }
        public string Detail(int selected, bool gamepad = false)
        {
            if (Capturing) return "松开后录入，全部松开预览；长按 " + Hint(MenuCommand.Back, gamepad) + " 1秒取消；15秒超时取消。";
            if (selected < 0 || selected >= draft.Bindings.Length) return "外部 MOD 冲突未知；应用前可取消预览。";
            var binding = draft.Bindings[selected];
            return string.Join(" + ", binding.Tokens.Select(Short)) + (binding.Tokens.Length == 0 ? "未绑定；" : "；") + Hint(MenuCommand.Accept, gamepad) + " 录入。" +
                (binding.Id == "pad-Toggle" || binding.Id.EndsWith("-alias", StringComparison.Ordinal) ? Hint(MenuCommand.Decrease, gamepad) + " 可清空。" : "");
        }
        public void CancelCapture() { capture = -1; captured.Clear(); captureReady = false; cancelStarted = null; }
        public void Suspend()
        {
            ClearConfirmation();
            if (Capturing) { CancelCapture(); Message = "录入已中止；预览与实际映射保持原状。"; }
        }
        public void ClearConfirmation() { recovery = null; }
        public void Capture(InputFrame frame, DateTime now)
        {
            if (!Capturing) return;
            if (!frame.Eligible || now >= deadline) { Suspend(); return; }
            if (frame.UnsupportedKeys.Length != 0) { Suspend(); Message = "未录入：不支持的键 " + string.Join(" / ", frame.UnsupportedKeys) + "。原预览未修改。"; return; }
            var neutral = frame.Keys.Length == 0 && frame.Buttons.Length == 0;
            if (!captureReady) { if (neutral) captureReady = true; return; }
            var backHeld = snapshot.Profile.Bindings.Any(b => b.Command == "Back" && b.Tokens.Length != 0 &&
                (b.Device == "keyboard" ? b.Tokens.All(frame.Keys.Contains) : frame.Gamepad && b.Tokens.All(frame.Buttons.Contains)));
            if (backHeld) { if (!cancelStarted.HasValue) cancelStarted = now; if (now - cancelStarted.Value >= TimeSpan.FromSeconds(1)) { Suspend(); return; } }
            else cancelStarted = null;
            var binding = draft.Bindings[capture];
            if (binding.Device == "gamepad" && frame.Gamepad) foreach (var token in frame.Buttons) captured.Add(token);
            if (binding.Device == "keyboard" && frame.PressedKeys.Any(frame.Keys.Contains)) foreach (var token in frame.Keys) captured.Add(token);
            if (!neutral || captured.Count == 0) return;
            binding.Tokens = InputProfile.Canonical(binding.Device, captured);
            Dirty = true; CancelCapture();
            var issues = draft.Issues(); Message = issues.Length == 0 ? "组合已进入预览；尚未生效。可应用或取消。" : "冲突：" + issues[0];
        }
        public void Execute(string key, MenuCommand command, DateTime now)
        {
            if (key != "input-recover") ClearConfirmation();
            if (key.StartsWith("input-bind:", StringComparison.Ordinal))
            {
                var index = int.Parse(key.Substring(11), System.Globalization.CultureInfo.InvariantCulture);
                if (index < 0 || index >= draft.Bindings.Length) throw new ArgumentOutOfRangeException(nameof(key));
                var binding = draft.Bindings[index];
                if (command == MenuCommand.Decrease && (binding.Id == "pad-Toggle" || binding.Id.EndsWith("-alias", StringComparison.Ordinal)))
                { binding.Tokens = new string[0]; Dirty = true; Message = "已预览清空；应用后才生效。"; return; }
                if (command != MenuCommand.Accept) return;
                CancelCapture(); capture = index; deadline = now.AddSeconds(15); Message = "录入 " + InputProfile.Label(binding.Command) + "；游戏菜单动作暂时停止。"; return;
            }
            if (command != MenuCommand.Accept) return;
            switch (key)
            {
                case "input-cancel": draft = snapshot.Profile.Copy(); Dirty = false; Message = "预览已取消；没有写入文件。"; break;
                case "input-default": draft = InputProfile.Defaults(); Dirty = true; Message = "已预览默认映射；应用前实际映射保持不变。"; break;
                case "input-previous": if (snapshot.Previous != null) { draft = snapshot.Previous.Copy(); Dirty = true; Message = "已预览上一版；应用会保留当前版本作为历史。"; } break;
                case "input-reload":
                    try { var read = store.Read(); snapshot = read; draft = read.Profile.Copy(); Dirty = false; ReadFailed = false; Message = "已重新读取；磁盘版本成为实际映射。"; }
                    catch (Exception error) { ReadFailed = true; Message = "读取失败，实际映射未变：" + error.Message; } break;
                case "input-recover":
                    if (recovery == null)
                    {
                        try {
                            var plan = store.PreviewRecovery();
                            if (plan.AffectedFiles.Length == 0 && !plan.Resuming) { Message = "没有需要隔离的损坏记录。"; break; }
                            recovery = plan;
                            Message = (plan.Resuming ? "继续中断恢复：" : "恢复预览：") + "隔离保留" + plan.AffectedFiles.Length + "份；可信版 " + plan.LastTrusted.Revision.Substring(0, Math.Min(8, plan.LastTrusted.Revision.Length)) + "。再次执行确认。";
                        } catch (Exception error) { Message = "无法建立恢复计划：" + error.Message; }
                    }
                    else
                    {
                        var plan = recovery; recovery = null;
                        try { var restored = store.Recover(plan); snapshot = restored; draft = restored.Profile.Copy(); Dirty = false; ReadFailed = false; Message = "损坏记录已隔离保留；可信映射已回读。松开按键再使用。"; }
                        catch (Exception error) { ReadFailed = true; Message = "恢复未确认；实际映射未变。请重新预览：" + error.Message; }
                    }
                    break;
                case "input-apply":
                    if (!Dirty) { Message = "没有预览改动，未写入文件。"; break; }
                    if (ReadFailed) { Message = "磁盘读取状态异常；先重新读取，未覆盖原文件。"; break; }
                    var issues = draft.Issues(); if (issues.Length != 0) { Message = "无法应用：" + issues[0]; break; }
                    try { var saved = store.Save(snapshot.Revision, draft.Copy()); snapshot = saved; draft = saved.Profile.Copy(); Dirty = false; Message = "映射已保存并回读；松开全部按键后使用新映射。"; }
                    catch (Exception error) { ReadFailed = true; Message = "保存未确认；实际映射保持旧版，请重新读取：" + error.Message; } break;
            }
        }
        public string Hint(MenuCommand command, bool gamepad = false)
        {
            var bindings = snapshot.Profile.Bindings.Where(b => b.Command == command.ToString() && b.Device == (gamepad ? "gamepad" : "keyboard") && b.Tokens.Length != 0);
            return bindings.Select(b => string.Join("+", b.Tokens.Select(Short))).FirstOrDefault() ?? "未绑定";
        }
    }
}
