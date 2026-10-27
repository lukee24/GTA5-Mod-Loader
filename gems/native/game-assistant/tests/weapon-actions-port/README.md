# Stage7 production weapon action port checks

Run from the application directory (`gems/`):

```powershell
dotnet run --project native/game-assistant/tests/weapon-actions-port/WeaponActionsPortCheck.csproj -c Release
dotnet build native/game-assistant/GEMS.GameAssistant.csproj -c Release --no-restore
```

This executable links the actual `GtaWeaponActionsPort`, original `GtaWeaponPort`, action contracts, and action controller. GTA objects/native entry points and the controller journal are test substitutes. It does not load GTA, call native game code, establish game effects, test physical input, or validate durable journal recovery. Separate controller/journal and actual Script flow tests cover those respective application layers.

Observation has three scopes. Default reads mandatory bounded inventory hashes/current and actor identity. `diagnostics: true` additionally reads each inventory weapon's ammo type for shared-pool membership. `detailWeapon` reads one selected weapon's optional ammo, slot, tint, compatible component definitions, installed HAS, active IS, and component colour return. Other detail fields remain explicitly unknown. Default clear/clip verification does not depend on optional diagnostic stability.

The component collection in the pinned SDK is cached. For the one detail target, the port compares its hashes against the actual global component hashes and the named `DOES_WEAPON_TAKE_WEAPON_COMPONENT` results. Cache disagreement or a bound violation leaves components unknown and prevents component writes. It does not prevent an explicitly confirmed identity-based clear.

This stage permits at most 1024 global component definitions for a detail scan. A list of 1025 or more is rejected whole with `global-definitions-exceed-1024`; it is never truncated into an apparently complete list. A shared 75 ms elapsed budget covers definition/compatibility, installed HAS, active IS, and raw livery observations. Before each next query the port checks the budget. On expiry it discards the entire component result, records `elapsed-budget-75ms`, and retains no usable partial component array. A synchronous native call cannot be interrupted, so one slow call can exceed 75 ms before control returns and the next budget check stops work. This is a bounded-detail support limit, not a claim to support every loaded component registry or a guarantee of GTA responsiveness.

The SDK's `WeaponComponent.Active` getter is the installed HAS query. The separate named IS query is recorded independently. The pinned named component-tint getter returns an integer without a documented applicability/success flag. Installed, compatible components retain that raw integer, including zero/negative returns; `Livery` remains unknown and `ComponentLivery` rejects writes. `TintCount` is used only for weapon tint. Neither component attachment point nor a nonnegative return is treated as proof of a restorable colour.

Primary API references already captured by the project audit:

- [Component activity](https://github.com/citizenfx/natives/blob/master/WEAPON/IsPedWeaponComponentActive.md)
- [Component compatibility](https://github.com/citizenfx/natives/blob/master/WEAPON/DoesWeaponTakeWeaponComponent.md)
- [Livery read](https://github.com/citizenfx/natives/blob/master/WEAPON/GetPedWeaponLiveryColor.md)
- [Infinite pool scope](https://github.com/citizenfx/natives/blob/master/WEAPON/SetPedInfiniteAmmo.md)
- [Infinite clip scope](https://github.com/citizenfx/natives/blob/master/WEAPON/SetPedInfiniteAmmoClip.md)

The pinned SDK compilation checks typed `RemoveAll`, `InfiniteAmmo`, `InfiniteAmmoClip`, component setter, and weapon tint APIs against the actual .NET Framework assembly. Fake-boundary tests check exact requested ped/weapon/component/value parameters, current actor and inventory changes, optional failure versus lost eligibility, shared-pool membership changes, incomplete definitions, transient target changes, and exceptions before/after a possible mutation. There are no retry loops or implicit false/restore writes in the port. Native game state changes are not atomic with these checks.

Evidence is retained under `native/game-assistant/artifacts/0.1.84-stage7-*`. The first final-guard regression reproduced an inventory addition during the final eligibility callback that previously reached `RemoveAll`. The fix performs the inventory/current check after that callback, then rechecks the captured/current actor without opening another eligibility callback window. The before-fix log is `actions-port-depth-candidate.txt`; the passing regression is `actions-port-final-guard-fix.txt`.

The budget-enforced log records each case and budget. Counts named `Native.*` measure explicit native calls in this fake boundary; typed SDK members and identity getters are additional calls represented separately in total boundary reads. Fixture milliseconds are not GTA timings. At the permitted maximum of 512 inventory entries, 1024 global definitions, and 512 target components, default observation performs no component scan. Detailed requests can still perform substantial bounded work through repeated confirmation/revalidation; the actual controller's two-confirmation path is measured, not just the final setter. The maximum-count fixtures use the internal timestamp hook to prevent load-dependent timeouts, while separate injected boundary clocks and one real Stopwatch case with a 90 ms test-only delay verify expiry. Physical game responsiveness remains untested.
