# Player motion port verification

Run from the application directory (`gems/`):

```powershell
dotnet run --project native/game-assistant/tests/player-port/PlayerPortCheck.csproj -c Release
```

The project compiles the real `GtaPlayerMotionPort.cs`, `PlayerMotion.cs`, and
`OwnedBooleanState.cs` through `Compile Include`. It does not copy the production
port or controller. The small GTA fixture records every property read and typed
API call and permits a state change or exception at a specified read/write
boundary. It has no Native hash API or game connection.

Coverage includes:

- Guard rejection before GTA access, stable sessions, exact player/parameter
  routing, finite `0..1.499` boundaries, and rejection of NaN/infinities.
- Eligibility loss between read and write; same-actor recovery cannot revive an
  old epoch. Pause, focus, and story denial are modeled through the injected
  eligibility callback, not through a real game window.
- Player handle, Ped handle, model, address, existence, death, and null-Ped
  changes; a return to the original identity still needs a fresh session.
- Explicit local forget, forged tokens, a changed actor inside the final
  eligibility callback, and failure in the second actor read.
- Exceptions before and after a typed API call, preventing later reuse of the
  old token. A call that threw after writing is not labeled rolled back.
- The real controller composed with the real port: disabled edits, all three
  routes, local stop, no automatic resumption, partial submission, and preventing
  old enabled flags from moving to a different actor during a toggle.

The fixture checks that stop does not issue `1.0` as an invented restoration.
An explicitly enabled multiplier of `1.0` remains a valid ordinary request.

This is offline software evidence. It does not verify actual run/swim speed,
super-jump behavior, ScriptHook loading, frame-reset behavior in a particular GTA
build, or interactions with another installed mod. Those require game tests.

The 2026-10-27 verification completed with **256 assertions, 19 cases, and zero
failures**. Production source SHA-256 values at that run were:

- `PlayerMotion.cs`: `954b53b9bd5ae101db9cb1287ee3d51975d54184aeb4b94d3de78c9d617b20ea`
- `GtaPlayerMotionPort.cs`: `d16f555a7d39bd2421ab19c0b3f7db20de8a73a2fccc64753cc1861007acd543`

These are injected synchronous boundary tests. They do not provide an atomic
transaction with the game engine or claim that another script cannot change
state after the final check. Native-call failure may mean a request was already
submitted; only local continuation and old-session reuse are prevented here.

