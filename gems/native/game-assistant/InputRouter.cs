using System;
using System.Collections.Generic;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class InputFrame
    {
        public int Number;
        public bool Eligible;
        public bool Gamepad;
        public string[] PressedKeys = new string[0];
        public string[] UnsupportedKeys = new string[0];
        public string Session = "";
        public string[] Keys = new string[0], Buttons = new string[0];
    }
    public sealed class InputRouter
    {
        private bool barrier = true;
        private string? session;
        private int? consumedFrame;
        private bool? lastDevice;
        public void Suspend() { barrier = true; session = null; lastDevice = null; }
        public void RequireRelease() { barrier = true; }
        public bool Neutral(InputFrame frame) => frame.Keys.Length == 0 && frame.Buttons.Length == 0;
        public MenuCommand? Poll(InputProfile profile, InputFrame frame, bool opened)
        {
            if (!frame.Eligible) { Suspend(); return null; }
            if (session != frame.Session) { session = frame.Session; barrier = true; }
            if (lastDevice != frame.Gamepad) { lastDevice = frame.Gamepad; barrier = true; }
            if (barrier) { if (Neutral(frame)) barrier = false; return null; }
            if (consumedFrame == frame.Number || Neutral(frame)) return null;
            var matches = profile.Bindings.Where(b => b.Tokens.Length != 0 && (opened || b.Command == "Toggle") &&
                (b.Device == "keyboard" ? b.Tokens.Any(frame.PressedKeys.Contains) && b.Tokens.All(frame.Keys.Contains) && InputProfile.Modifiers.All(m => frame.Keys.Contains(m) == b.Tokens.Contains(m))
                 : frame.Gamepad && b.Tokens.All(frame.Buttons.Contains))).ToArray();
            if (matches.Length == 0) return null;
            // Validated bindings never contain another binding. A simultaneous cross-device toggle wins and consumes this frame.
            var toggle = matches.FirstOrDefault(b => b.Command == "Toggle");
            var commands = matches.Select(b => b.Command).Distinct().ToArray();
            consumedFrame = frame.Number; barrier = true;
            if (toggle != null) return MenuCommand.Toggle;
            return commands.Length == 1 ? (MenuCommand?)Enum.Parse(typeof(MenuCommand), commands[0]) : null;
        }
    }
}
