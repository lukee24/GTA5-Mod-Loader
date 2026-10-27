using System;
using System.Collections.Generic;
using System.Globalization;

namespace Gems.GameAssistant
{
    public sealed class MenuViewport
    {
        public const int Capacity = 8;
        public int Count { get; private set; }
        public int Selected { get; private set; } = -1;
        public int First { get; private set; }
        public int VisibleCount => Math.Min(Capacity, Count - First);
        public int VisibleSelection => Selected < 0 ? -1 : Selected - First;
        public void SetCount(int count)
        {
            if (count < 0 || count > 4096) throw new ArgumentOutOfRangeException(nameof(count));
            Count = count;
            Selected = count == 0 ? -1 : Math.Max(0, Math.Min(Selected, count - 1));
            KeepVisible();
        }
        public void Reset(int count) { SetCount(count); Selected = count == 0 ? -1 : 0; First = 0; }
        public void Move(int delta)
        {
            if (Count == 0) return;
            Selected = (int)(((long)Selected + delta) % Count + Count) % Count;
            KeepVisible();
        }
        private void KeepVisible()
        {
            if (Count == 0) { First = 0; return; }
            First = Math.Min(First, Math.Max(0, Count - Capacity));
            if (Selected < First) First = Selected;
            if (Selected >= First + Capacity) First = Selected - Capacity + 1;
        }
    }

    public sealed class KeyEdges
    {
        private readonly HashSet<int> held = new HashSet<int>();
        public bool Press(int key) => held.Add(key);
        // Release is purely local and must also run while the story guard refuses access.
        public void Release(int key) => held.Remove(key);
        public void Reconcile(Func<int, bool> isPressed)
        {
            foreach (var key in new List<int>(held)) if (!isPressed(key)) held.Remove(key);
        }
    }

    public sealed class MenuRow
    {
        public string Key { get; }
        public string Label { get; }
        public string Value { get; }
        public bool Enabled { get; }
        public MenuRow(string key, string label, string value = "", bool enabled = true)
        { Key = key; Label = label; Value = value; Enabled = enabled; }
    }

    // A render acknowledgement binds execution to the exact row actually shown.
    public sealed class MenuAcknowledgement
    {
        private string? renderedKey;
        private string? renderedLabel, renderedValue;
        public void Clear() => renderedKey = null;
        public void Record(MenuRow row, bool legible)
        { renderedKey = legible && row.Enabled ? row.Key : null; renderedLabel = row.Label; renderedValue = row.Value; }
        public bool Allows(MenuRow row) => row.Enabled && renderedKey != null && renderedKey == row.Key && renderedLabel == row.Label && renderedValue == row.Value;
    }

    public sealed class GlyphBudget
    {
        public const string Fallback = "□";
        public const int Maximum = 2048;
        private readonly int maximum;
        private readonly HashSet<string> known = new HashSet<string>(StringComparer.Ordinal);
        public int Count => known.Count;
        public GlyphBudget(int maximum = Maximum)
        {
            if (maximum < 2 || maximum > Maximum) throw new ArgumentOutOfRangeException(nameof(maximum));
            this.maximum = maximum; known.Add(Fallback);
        }
        public bool Admit(string glyph)
        {
            if (!Valid(glyph)) return false;
            if (known.Contains(glyph)) return true;
            if (known.Count >= maximum) return false;
            known.Add(glyph); return true;
        }
        public static bool Valid(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length > 8) return false;
            for (var i = 0; i < value.Length; i++)
            {
                if (char.IsControl(value[i])) return false;
                if (char.IsHighSurrogate(value[i])) { if (++i >= value.Length || !char.IsLowSurrogate(value[i])) return false; }
                else if (char.IsLowSurrogate(value[i])) return false;
            }
            return StringInfo.ParseCombiningCharacters(value).Length == 1;
        }
        public static IEnumerable<string> Elements(string value)
        {
            var text = StringInfo.GetTextElementEnumerator(value ?? "");
            var count = 0;
            while (count++ < 1024 && text.MoveNext()) yield return text.GetTextElement();
        }
        public static string FileKey(string glyph)
        {
            if (!Valid(glyph)) throw new ArgumentException("无效字形", nameof(glyph));
            var result = ""; foreach (var character in glyph) result += ((int)character).ToString("X4", CultureInfo.InvariantCulture);
            return "glyph-" + result + ".png";
        }
        public static string? FromFileKey(string filename)
        {
            if (!filename.StartsWith("glyph-", StringComparison.Ordinal) || !filename.EndsWith(".png", StringComparison.Ordinal)) return null;
            var hex = filename.Substring(6, filename.Length - 10);
            if (hex.Length == 0 || hex.Length > 32 || hex.Length % 4 != 0) return null;
            var value = "";
            for (var i = 0; i < hex.Length; i += 4)
            {
                if (!ushort.TryParse(hex.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var character)) return null;
                value += (char)character;
            }
            return Valid(value) && FileKey(value) == filename ? value : null;
        }
    }
}
