# Stage7 real GDI menu checks

Run from the application directory (`gems/`):

```powershell
dotnet run --project native/game-assistant/tests/weapon-actions-visual/WeaponActionsVisualCheck.csproj -- native/game-assistant/artifacts native/game-assistant/artifacts/0.1.84-stage7-new-gdi-fixture
```

This runs actual .NET Framework 4.8 GDI, production WeaponActionsMenu, controller and ChinesePanel. The game port and sprite sink are substitutes. It checks every row across reachable pages, complete clear/infinite/component/restoration notices, Chinese installed/active values, rejection of an unreadable mandatory warning and stable textures across 1000 draft frames. Four PNGs are offline drawings, never game screenshots. Test output is versioned for Stage7; do not run older visual suites into their frozen output filenames.
