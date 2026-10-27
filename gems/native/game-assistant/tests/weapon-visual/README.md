# Weapon menu GDI checks

From the application directory (gems/), run:

    dotnet run --project native/game-assistant/tests/weapon-visual/WeaponVisualCheck.csproj -c Release -- native/game-assistant/artifacts native/game-assistant/artifacts/0.1.83-stage6-visual-fixture

This executes the real .NET Framework 4.8 WeaponMenu and ChinesePanel rasterizer,
with a fake inventory/controller port and offline sprite sink. The strict reader
is compiled but this visual fixture never supplies a catalog; its hash seam throws
if unexpectedly invoked. Real catalog/hash checks are in weapon-catalog.

The check covers long/empty runtime names, visible hash and confirmation warnings,
shared-ammo and removal limits, lost-session records, unreadable-warning refusal,
and 1000 changing amount frames with no texture-path growth. Generated images are
offline GDI renders, not game screenshots or proof of SDK/game texture behavior.
