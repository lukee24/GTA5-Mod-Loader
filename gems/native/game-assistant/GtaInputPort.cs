using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using GTA;
using GTA.Native;

namespace Gems.GameAssistant
{
    public sealed class GtaInputPort
    {
        private readonly Func<bool> allowed;
        private readonly Func<bool> focused;
        [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
        public GtaInputPort(Func<bool> allowed, Func<bool>? focused = null) { this.allowed = allowed; this.focused = focused ?? Foreground; }
        private static bool Foreground()
        {
            var window = GetForegroundWindow(); if (window == IntPtr.Zero) return false;
            GetWindowThreadProcessId(window, out var pid); return pid == (uint)Process.GetCurrentProcess().Id;
        }
        public bool Eligible() => allowed() && focused() && !Game.IsPaused;
        public InputFrame Read(string session)
        {
            var result = new InputFrame { Session = session };
            if (!Eligible()) return result;
            result.Number = Game.FrameCount;
            result.Keys = InputProfile.KeyTokens.Where(k => Game.IsKeyPressed((Keys)Enum.Parse(typeof(Keys), k))).ToArray();
            result.Gamepad = Game.LastInputMethod == InputMethod.GamePad;
            // Disabled-control samples remain needed for release detection even after the last input device changes.
            result.Buttons = InputProfile.PadTokens.Where(k => Game.IsControlPressed((GTA.Control)Enum.Parse(typeof(GTA.Control), k))).ToArray();
            result.Eligible = Eligible();
            return result;
        }
        public void Suppress(InputProfile profile)
        {
            // Modal menu: a custom keyboard key can map to any game action, not just Frontend*.
            // The SDK applies this request only to this frame; never force-enable another script's controls.
            if (Eligible()) Game.DisableAllControlsThisFrame();
        }
    }
}
