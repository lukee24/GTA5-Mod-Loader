# Weapon port verification

Run from the application directory (gems/):

```powershell
dotnet run --project native/game-assistant/tests/weapon-port/WeaponPortCheck.csproj -c Release
```

The project links the real production port, contracts, controller and identity
contract. `WeaponSdkFakes.cs` supplies only weapon SDK types and a named-native
dispatcher. `EntityFakes.cs` supplies Game/Player/Ped; `NativeEntryFakes.cs` supplies
the standalone native entry points; `Fixtures.cs` builds isolated mutable state
and a journal spy. The production implementation is not copied.

The suite checks eligibility before API access, changing player identity and
session epochs, complete fixture inventory capture, malformed enumerations,
native success flags, bounded ammo/components, stale previews, exact Give/Remove
and named ammo call parameters, partial exceptions, explicit confirmation,
journal ordering, asset waiting/cancellation, shared ammo limits and consistency,
and conditional removal. The final readiness regression injects resource loss
while journal intent is being written.

The final 2026-10-27 run passed **168 assertions in 14 cases** after the production
owner added a readiness check following journal intent and another check at the
port write boundary. The originally failing readiness scenario was rerun
unchanged. Failure and retest evidence are retained in
`../../artifacts/0.1.83-stage6-weapon-port-before-fix.txt` and
`../../artifacts/0.1.83-stage6-weapon-port-after-fix.txt`.

Special inventory states are not interchangeable: a false `GET_MAX_AMMO` result
rejects the entire read, while an unavailable clip reading is currently retained
as `ClipKnown=false`. The latter is an unknown value, not a verified zero or a
demonstrated rejection of all actions. The final source requires known clip
data before ammo addition and confirmed grant readback. AmmoType zero is rejected by grant and
ammo-addition rules; it does not by itself cause an existing inventory row to be
discarded or the entire inventory to fail. These conservative/unknown boundaries
must be reflected in gameplay acceptance; this suite does not test every special
weapon in a game.

For the actual script-flow tests, reuse only `WeaponSdkFakes.cs`. The existing
Ped must expose `HandleValue`, `Items`, `Pools`, `CurrentValue`, `HashOverride`,
and `Weapons`; register it in `Runtime.Peds`. The existing native entry point can
delegate weapon calls to `WeaponNative.Call<T>(Hash, params object[])` and its
void overload. The five enum values and OutputArgument fixture are shown in
`NativeEntryFakes.cs`. The SDK fixture has no Game/Player/Ped/Function/Hash/
OutputArgument/Fixture declarations to conflict with those test definitions.

This is software evidence at injected boundaries. It does not establish native
ABI behavior, live inventory completeness, gameplay effects, physical asset
loading, atomicity with the game engine or safe recovery in a real GTA session.
The journal spy verifies call order only; durable file behavior belongs to the
separate production-journal tests. No game PASS can be inferred here.
