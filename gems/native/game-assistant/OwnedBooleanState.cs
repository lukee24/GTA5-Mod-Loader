using System;

namespace Gems.GameAssistant
{
    public readonly struct PlayerIdentity : IEquatable<PlayerIdentity>
    {
        public readonly int PlayerHandle, PedHandle, ModelHash;
        public readonly long Address;
        public PlayerIdentity(int playerHandle, int pedHandle, int modelHash, long address)
        { PlayerHandle = playerHandle; PedHandle = pedHandle; ModelHash = modelHash; Address = address; }
        public bool Equals(PlayerIdentity other) => PlayerHandle == other.PlayerHandle && PedHandle == other.PedHandle && ModelHash == other.ModelHash && Address == other.Address;
        public override bool Equals(object? value) => value is PlayerIdentity other && Equals(other);
        public override int GetHashCode() => PlayerHandle ^ PedHandle ^ ModelHash ^ Address.GetHashCode();
    }

    public enum StateOutcome { Unchanged, Applied, Restored, GuardDenied, TargetChanged, ExternalChange, ReadbackMismatch }

    /// <summary>Conditional restoration of one observable boolean; never continuously forces it.</summary>
    public sealed class OwnedBooleanState
    {
        public bool HasValue { get; private set; }
        public PlayerIdentity Target { get; private set; }
        public bool Original { get; private set; }
        public bool LastWritten { get; private set; }

        // write(expected, desired) must recheck guard, identity and expected value at the actual API boundary.
        public StateOutcome Set(bool allowed, PlayerIdentity target, bool desired, Func<bool> read, Action<bool, bool> write)
        {
            if (!allowed) return StateOutcome.GuardDenied;
            if (HasValue && !Target.Equals(target)) { HasValue = false; return StateOutcome.TargetChanged; }
            var current = read();
            if (HasValue && current != LastWritten) { HasValue = false; return StateOutcome.ExternalChange; }
            if (current == desired) return StateOutcome.Unchanged;
            // Keep the last successful write when a revert throws before or after the setter.
            if (HasValue && desired == Original) return Restore(allowed, target, read, write);
            if (!HasValue) { Target = target; Original = current; HasValue = true; }
            // Retain the intended write even when a setter throws after changing the actual field.
            LastWritten = desired;
            write(current, desired);
            if (read() != desired) return StateOutcome.ReadbackMismatch;
            if (desired == Original) HasValue = false;
            return StateOutcome.Applied;
        }

        public StateOutcome Restore(bool allowed, PlayerIdentity target, Func<bool> read, Action<bool, bool> write)
        {
            if (!HasValue) return StateOutcome.Unchanged;
            if (!allowed) return StateOutcome.GuardDenied;
            if (!Target.Equals(target)) { HasValue = false; return StateOutcome.TargetChanged; }
            var current = read();
            if (current == Original) { HasValue = false; return StateOutcome.Restored; }
            if (current != LastWritten) { HasValue = false; return StateOutcome.ExternalChange; }
            write(current, Original);
            if (read() != Original) return StateOutcome.ReadbackMismatch;
            HasValue = false; return StateOutcome.Restored;
        }
    }
}
