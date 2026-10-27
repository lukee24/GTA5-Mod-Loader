using Gems.GameAssistant;
using GTA;

internal sealed class Fixture
{
    public readonly GtaWorldPort Port;
    public readonly Ped Player;
    public readonly List<string> Logs = new();
    public bool Allowed = true;
    public int Guards;
    public Action<int>? BeforeGuard;
    public readonly WorldSession Session;
    public Fixture()
    {
        Runtime.Clear(); Player = new Ped { HandleValue = 10, AddressValue = new IntPtr(10000), ModelValue = new Model(123), PlayerValue = true };
        Game.PlayerValue = new Player { CharacterValue = Player }; Game.VersionValue = new Version(1, 0, 1013, 33);
        World.Entities = Array.Empty<Entity>();
        GTA.Chrono.GameClock.HourValue = 6; GTA.Chrono.GameClock.MinuteValue = 7; GTA.Chrono.GameClock.SecondValue = 8;
        Port = new GtaWorldPort(() => { Guards++; BeforeGuard?.Invoke(Guards); return Allowed; }, (operation, details) => Logs.Add(operation + ":" + details));
        if (!Port.TrySession(out Session)) throw new Exception("fixture initialization failed");
        Clear();
    }
    public void Clear() { Runtime.Clear(); Guards = 0; BeforeGuard = null; }
    public static Vehicle Vehicle(int handle, bool own = false) => new() { HandleValue = handle, AddressValue = new IntPtr(20000 + handle), ModelValue = new Model(400 + handle), PositionValue = new Vector3(2, 0, 0), OwnedValue = own, ShvdnOwnedValue = own, PersistentValue = own };
    public static PlayerIdentity Id(Entity entity) => new(0, entity.HandleValue, entity.ModelValue.Hash, entity.AddressValue.ToInt64());
    public void Observe(params Entity[] entities) { World.Entities = entities; Port.Nearby(Session, 10, 128); Clear(); }
}
