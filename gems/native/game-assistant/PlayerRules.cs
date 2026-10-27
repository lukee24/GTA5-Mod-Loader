using System;

namespace Gems.GameAssistant
{
    public static class PlayerRules
    {
        public static int Wanted(int value) => Math.Max(0, Math.Min(5, value));
        public static int AdjustWanted(int current, int delta) => (int)Math.Max(0L, Math.Min(5L, (long)current + delta));
        public static int Armor(int maximum)
        {
            if (maximum < 0 || maximum > 65535) throw new ArgumentOutOfRangeException(nameof(maximum));
            return maximum;
        }
    }
    public sealed class FrameRequest
    {
        public bool Enabled { get; private set; }
        private PlayerIdentity target;
        public void Toggle(PlayerIdentity identity) { Enabled = !Enabled; target = identity; }
        public void Stop() => Enabled = false;
        public bool Allows(bool guard, PlayerIdentity identity)
        {
            if (!guard || !target.Equals(identity)) Enabled = false;
            return Enabled;
        }
    }
}
