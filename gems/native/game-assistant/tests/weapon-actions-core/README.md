# Stage7 action/controller and journal tests

Run from the application directory (`gems/`):

```powershell
dotnet run --project native/game-assistant/tests/weapon-actions-core/WeaponActionsCoreCheck.csproj
```

The suite compiles the production action controller, menu, contracts and journal. It uses a stateful game-port substitute and a journal spy for deterministic submission boundaries, then exercises the production journal on real files. It checks consume-before-call clear, bounded observation/cancellation, unknown results, independent infinite requests, component/tint restoration, partial steps, original failure diagnostics, visible budget limits, v1/v2 mixed history, oversized encoded records, held-handle release and copied-intent rejection.

Each real-file run creates a fresh GUID under `artifacts/0.1.84-stage7-core-fixtures`; it does not remove earlier fixtures. Fault injection proves handling of that exception boundary, not physical power-loss behavior. Passing assertions do not establish native game effects, full inventory restoration, physical input or external-MOD compatibility.
