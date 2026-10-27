using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;

namespace Gems.GameAssistant
{
    public enum MenuCommand { Toggle, Up, Down, PreviousCategory, NextCategory, Accept, Back, Increase, Decrease }
    [DataContract]
    public sealed class InputBinding
    {
        [DataMember(IsRequired = true)] public string Id = "";
        [DataMember(IsRequired = true)] public string Device = "";
        [DataMember(IsRequired = true)] public string Command = "";
        [DataMember(IsRequired = true)] public string[] Tokens = new string[0];
        public InputBinding Copy() => new InputBinding { Id = Id, Device = Device, Command = Command, Tokens = (string[])Tokens.Clone() };
        public string Display => Tokens.Length == 0 ? "未绑定（手动启用）" : string.Join(" + ", Tokens);
    }
    [DataContract]
    public sealed class InputProfile
    {
        [DataMember(IsRequired = true)] public int SchemaVersion = 1;
        [DataMember(IsRequired = true)] public InputBinding[] Bindings = new InputBinding[0];
        public InputProfile Copy() => new InputProfile { SchemaVersion = SchemaVersion, Bindings = Bindings.Select(b => b.Copy()).ToArray() };
        public static readonly string[] PadTokens = { "FrontendUp", "FrontendDown", "FrontendLeft", "FrontendRight", "FrontendAccept", "FrontendCancel", "FrontendLb", "FrontendRb", "FrontendLt", "FrontendRt" };
        public static readonly string[] Modifiers = { "ControlKey", "Menu", "ShiftKey" };
        public static readonly string[] KeyTokens = Enumerable.Range('A', 26).Select(i => ((char)i).ToString())
            .Concat(Enumerable.Range(0, 10).Select(i => "D" + i)).Concat(Enumerable.Range(1, 12).Select(i => "F" + i))
            .Concat(new[] { "Up", "Down", "Left", "Right", "Return", "Escape", "Space", "Tab", "Back", "Home", "End", "PageUp", "PageDown", "Insert", "Delete", "Add", "Subtract", "Oemplus", "OemMinus" }).Concat(Modifiers).ToArray();
        public static InputProfile Defaults()
        {
            var result = new List<InputBinding>();
            Action<string, string, MenuCommand, string[]> add = (id, device, command, tokens) => result.Add(new InputBinding { Id = id, Device = device, Command = command.ToString(), Tokens = tokens });
            var commands = new[] { MenuCommand.Toggle, MenuCommand.Up, MenuCommand.Down, MenuCommand.PreviousCategory, MenuCommand.NextCategory, MenuCommand.Accept, MenuCommand.Back, MenuCommand.Increase, MenuCommand.Decrease };
            var keys = new[] { "F5", "Up", "Down", "Left", "Right", "Return", "Escape", "Oemplus", "OemMinus" };
            var pad = new[] { "", "FrontendUp", "FrontendDown", "FrontendLb", "FrontendRb", "FrontendAccept", "FrontendCancel", "FrontendRight", "FrontendLeft" };
            for (var i = 0; i < commands.Length; i++) add("key-" + commands[i], "keyboard", commands[i], new[] { keys[i] });
            add("key-Toggle-alias", "keyboard", MenuCommand.Toggle, new[] { "Menu", "G" });
            add("key-Increase-alias", "keyboard", MenuCommand.Increase, new[] { "Add" });
            add("key-Decrease-alias", "keyboard", MenuCommand.Decrease, new[] { "Subtract" });
            for (var i = 0; i < commands.Length; i++) add("pad-" + commands[i], "gamepad", commands[i], pad[i] == "" ? new string[0] : new[] { pad[i] });
            return new InputProfile { Bindings = result.ToArray() };
        }
        public static string Label(string command)
        {
            switch (command) { case "Toggle": return "打开或关闭菜单"; case "Up": return "上一条"; case "Down": return "下一条"; case "PreviousCategory": return "上一分类"; case "NextCategory": return "下一分类"; case "Accept": return "执行或确认"; case "Back": return "返回"; case "Increase": return "增加数值"; case "Decrease": return "减少数值"; default: return "未知动作"; }
        }
        public static string[] Canonical(string device, IEnumerable<string> tokens)
        {
            var order = device == "keyboard" ? Modifiers.Concat(KeyTokens.Except(Modifiers)).ToArray() : PadTokens;
            return tokens.Distinct(StringComparer.Ordinal).OrderBy(t => Array.IndexOf(order, t)).ToArray();
        }
        public string[] Issues()
        {
            var issues = new List<string>(); var template = Defaults().Bindings;
            if (SchemaVersion != 1 || Bindings == null || Bindings.Length != template.Length) return new[] { "映射版本或槽位数量无效。" };
            for (var i = 0; i < Bindings.Length; i++)
            {
                var b = Bindings[i]; var t = template[i];
                if (b == null || b.Id != t.Id || b.Device != t.Device || b.Command != t.Command || b.Tokens == null) { issues.Add("映射槽位、设备或动作无效。"); continue; }
                var allowed = b.Device == "keyboard" ? KeyTokens : PadTokens;
                if (b.Tokens.Length > 4 || b.Tokens.Any(k => k == null || !allowed.Contains(k)) || b.Tokens.Distinct().Count() != b.Tokens.Length) { issues.Add("按键无效、重复或超过四键。"); continue; }
                if (b.Tokens.Length == 0 && b.Id != "pad-Toggle" && !b.Id.EndsWith("-alias", StringComparison.Ordinal)) issues.Add(Label(b.Command) + "不可清空。");
                if (b.Device == "keyboard" && b.Tokens.Length != 0 && b.Tokens.Count(k => !Modifiers.Contains(k)) != 1) issues.Add("键盘组合必须包含一个普通键及可选修饰键。");
                if (b.Device == "keyboard" && ((b.Tokens.Contains("Menu") && (b.Tokens.Contains("F4") || b.Tokens.Contains("Tab") || b.Tokens.Contains("Escape") || b.Tokens.Contains("Space"))) || (b.Tokens.Contains("ControlKey") && b.Tokens.Contains("Menu") && b.Tokens.Contains("Delete")) || (b.Tokens.Contains("ControlKey") && b.Tokens.Contains("Escape")))) issues.Add("组合属于已知系统保留键，未接受。");
                if (b.Id == "pad-Toggle" && b.Tokens.Length == 1) issues.Add("手柄打开菜单须明确配置至少两键组合；默认不占用。");
            }
            if (issues.Count != 0) return issues.Distinct().ToArray();
            for (var i = 0; i < Bindings.Length; i++) for (var j = i + 1; j < Bindings.Length; j++)
            {
                var a = Bindings[i]; var b = Bindings[j];
                if (a.Device != b.Device || a.Tokens.Length == 0 || b.Tokens.Length == 0) continue;
                if (a.Tokens.All(b.Tokens.Contains) || b.Tokens.All(a.Tokens.Contains)) issues.Add(Label(a.Command) + " 与 " + Label(b.Command) + " 组合相同或相互包含。");
            }
            return issues.Distinct().ToArray();
        }
        public void Validate() { var issues = Issues(); if (issues.Length != 0) throw new InvalidDataException(string.Join(" ", issues)); }
    }
}
