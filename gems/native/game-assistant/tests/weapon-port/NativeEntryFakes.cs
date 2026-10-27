namespace GTA.Native
{
    public enum Hash { GET_PED_AMMO_TYPE_FROM_WEAPON, GET_PED_AMMO_BY_TYPE, GET_AMMO_IN_CLIP, GET_MAX_AMMO, ADD_AMMO_TO_PED, DOES_WEAPON_TAKE_WEAPON_COMPONENT, IS_PED_WEAPON_COMPONENT_ACTIVE, GET_PED_WEAPON_COMPONENT_TINT_INDEX }
    public sealed class OutputArgument : IDisposable { public object Value = 0; public T GetResult<T>() => (T)Value; public void Dispose() { } }
    public static class Function
    {
        public static T Call<T>(Hash hash, params object[] args) => WeaponNative.Call<T>(hash, args);
        public static void Call(Hash hash, params object[] args) => WeaponNative.Call(hash, args);
    }
}
