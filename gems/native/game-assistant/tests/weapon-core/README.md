# Weapon controller and durable journal checks

From the application directory (gems/), run:

    dotnet run --project native/game-assistant/tests/weapon-core/WeaponCoreCheck.csproj -c Release

The suite links the production controller, contracts, menu, bridge, strict reader,
root identity and append-only journal. A fake game port models state and injected
failures; real Windows files exercise durable intent/result, file locking,
replacement refusal, changed history, partial writes, missing result recovery,
an ordinary file blocking a directory, and a directory containing 2049 records.
Fixtures remain beneath native/game-assistant/artifacts/0.1.83-stage6-fixtures.
No cleanup traverses or removes user files. IO exceptions injected by the journal
hook are not physical disk-full or power-loss tests.

Unknown results survive reopening. History never authorizes cross-restart weapon
removal. Readiness, sharing/slots, exact readback, source/root/revision/content
changes and conditional ownership are checked separately. This is software
evidence only; no GTA process is started and no game files are written.

The journal also rejects oversized intent/result records before creating unreadable files (1 MiB each), reserves a result before mutation, and enforces a 16 MiB aggregate history/read budget. A large result after possible mutation leaves a readable unconfirmed intent. All original oversized-file failures are retained as evidence.
