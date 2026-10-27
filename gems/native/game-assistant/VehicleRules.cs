using System;
using System.Linq;
using System.Globalization;

namespace Gems.GameAssistant
{
    public static class VehicleRules
    {
        public static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
        public static bool Parked(float speed) => Finite(speed) && speed >= 0 && speed <= 0.5f;
        public static bool NearGround(float height) => Finite(height) && height >= 0 && height <= 2f;
        public static int PaintValue(string value)
        {
            if (value == null || value.Length != 6 || value.Any(c => !(c >= '0' && c <= '9') && !(c >= 'A' && c <= 'F') && !(c >= 'a' && c <= 'f')))
                throw new ArgumentException("请输入6位RGB十六进制颜色，例如FF0000。");
            return int.Parse(value, NumberStyles.HexNumber, CultureInfo.InvariantCulture);
        }
        public static string PlateValue(string value)
        {
            if (value == null || value.Length < 1 || value.Length > 8 || value.Any(c => !(c >= 'A' && c <= 'Z') && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9') && c != ' '))
                throw new ArgumentException("本版车牌仅接受1至8位英文字母、数字或空格。");
            return value.ToUpperInvariant();
        }
        public static int NextModIndex(int current, int count)
        {
            if (count <= 0 || current < -1 || current >= count) throw new ArgumentOutOfRangeException(nameof(current), "改装档位读回无效。");
            return current == count - 1 ? -1 : current + 1;
        }
        public static bool CanReposition(bool car, float speed, float height, float groundDelta, float terrainVariation, bool occupiedArea)
            => car && Finite(speed) && speed >= 0 && speed <= 0.5f && Finite(height) && height >= 0 && height <= 2f
                && Finite(groundDelta) && Math.Abs(groundDelta) <= 2f && Finite(terrainVariation) && terrainVariation >= 0 && terrainVariation <= 0.5f && !occupiedArea;
        public static float SpeedRequest(float currentMetersPerSecond, int step)
        {
            if (!Finite(currentMetersPerSecond) || currentMetersPerSecond < 0 || currentMetersPerSecond > 30f / 3.6f || step < -1 || step > 1)
                throw new ArgumentOutOfRangeException(nameof(currentMetersPerSecond), "只允许低于30km/h的有限速度请求。");
            return step == 0 ? 0 : Math.Max(0, Math.Min(30f / 3.6f, currentMetersPerSecond + step * (5f / 3.6f)));
        }
    }
    public sealed class ActionConfirmation
    {
        public string Key { get; private set; } = "";
        private PlayerIdentity target;
        private DateTime expires;
        public void Clear() { Key = ""; }
        public bool Confirm(string key, PlayerIdentity identity, DateTime now)
        {
            if (Key == key && target.Equals(identity) && now <= expires) { Clear(); return true; }
            Key = key; target = identity; expires = now.AddSeconds(10); return false;
        }
        public void Reconcile(bool guard, PlayerIdentity identity, DateTime now)
        { if (!guard || !target.Equals(identity) || now > expires) Clear(); }
    }
}
