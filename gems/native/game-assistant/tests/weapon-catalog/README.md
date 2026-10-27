# Weapon catalogue reader verification

Both projects compile the production `WeaponCatalog.cs` and
`WeaponGameIdentity.cs` directly. They reference the fixed SDK DLL; only its
managed `StringHash.AtStringHashUtf8` helper and enum values are used. There is
no fake reader, game invocation, deployment, or game-directory write.

From the application directory (gems/):

```powershell
dotnet run --project native/game-assistant/tests/weapon-catalog/WeaponCatalogCheck.csproj -c Release -- artifacts/0.1.83-weapon-ui-working-3-verified-catalog.json
dotnet build native/game-assistant/tests/weapon-catalog/WeaponCatalogNet48Check.csproj -c Release
& native/game-assistant/tests/weapon-catalog/bin-net48/net48/WeaponCatalogNet48Check.exe artifacts/0.1.83-weapon-ui-working-3-verified-catalog.json
```

The optional argument to the first project is a real TypeScript producer
packet. The second project requires a packet and runs on the installed .NET
Framework CLR. These tests retain isolated fixtures beneath this test directory.
The link test creates an actual hard link and directory junction there; inability
to create them is a failure, never an inferred pass. No fixture cleanup traverses
a junction or removes user directories.

The final 2026-10-27 run passed **291 assertions in 14 cases**. It covered all required
fields, extra/duplicate fields, wrong types, controls, UTF-8 and UTF-16 validity,
source paths, enums, identifiers, name/hash consistency, row/evidence/issue and
byte limits, immutable results, raw content fingerprints, root canonicalization,
real Windows path resolution, directory pinning, exclusive file locks, real
hard links/junctions, and Unicode paths longer than 260 characters.

The actual .NET Framework CLR `4.0.30319.42000` also read the earlier producer's
23 rows and the final producer's one row. The final test added the producer's
`verified`/non-null transaction constraint and compared five actual NTFS paths
against Node's `fs.realpath.native` results, including case aliases and distinct
composed/decomposed Unicode directories. Both runtimes returned identical revision/content digests and rejected the real
non-GTA test process. The producer's temporary game root had already been
removed: this is protocol evidence, not evidence of matching a live GTA host.
The final fixture and root vectors are under the workspace's
`.oss-private/acceptance/next-weapons-0.1.83/`; pass `producer-catalog-v1.json`
and `actual-root-vectors.json` as the first project's two arguments to repeat
the 291-assertion run. The retained root vector directories are read-only inputs.

`ContentDigest` hashes the original UTF-8 bytes. The reader does not trust a
self-declared `Revision` as proof of unchanged content, recompute the producer's
JSON revision convention, or maintain a global revision cache. Consumers must
bind action confirmations to both values and recheck the actual host identity.
Unknown registration/dependencies and every file state are preserved; parsing
does not authorize a game operation.

Full run summary and source hashes are in
`../../artifacts/0.1.83-stage6-catalog-tests.txt`; fixed-SDK method evidence and
vectors are in `sdk-hash-evidence.txt`. The .NET 8 build had zero warnings. The
.NET Framework build had no source warnings and reported NU1900 because its
NuGet vulnerability audit endpoint was inaccessible. Compilation still succeeded;
the package audit was not verified.

Actual game loading, inventory behavior, effects, rollback, and interactions
with other mods remain untested by these projects.
