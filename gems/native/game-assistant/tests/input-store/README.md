# Input profile persistence verification

This Windows-only test project links the production `InputProfile.cs` and
`InputProfileStore.cs`. It does not load GTA, invoke ScriptHook, or write a game
directory. Run it from the `gems/` application project directory (containing `package.json` and `native/`) with a **new**, dedicated fixture path:

```powershell
dotnet run --project native/game-assistant/tests/input-store/InputStoreCheck.csproj -c Release -- native/game-assistant/artifacts/0.1.81-stage4-store-your-new-run
```

The suite creates directory junctions only between locations in that fixture
directory. If the host denies junction creation, that case fails; it is never
silently counted as passing. The fixture directory and all evidence are retained.
No recursive cleanup is performed by the test program.

Final run `0.1.81-stage4-store-final-v2` recorded **389 passing assertions in 29
cases, zero failures, zero skipped cases**, on Windows 10.0.26300 and .NET 8.0.31.
This is software persistence evidence; it does not establish in-game input or
actual mod loading.

## API contract

- `Read()` returns `Profile`, `Revision`, and `Previous`. A missing store returns
  defaults, revision `empty`, and no previous version. The first saved version's
  previous state is the default baseline.
- `Save(expectedRevision, profile)` validates and copies the profile, then checks
  the expected revision under the exclusive store lock. Version files include the
  sequence and SHA-256 of their exact bytes; every version links to its predecessor.
  Existing snapshots are never overwritten. Restore previous/default is another
  explicit `Save`, not deletion of later history.
- The temporary file stays open without write/delete sharing. Windows
  `SetFileInformationByHandle(FileRenameInfo)` publishes that exact handle,
  with a terminated UTF-16 long path. Failed unpublished `.tmp` files are retained;
  subsequent operations do not delete them or treat them as committed versions.
- After a publication error, successful disk verification of the attempted
  revision returns the committed snapshot. An unverifiable outcome throws
  `InputProfileStoreException` with `OutcomeUnknown = true`; callers must refresh
  and must not claim rollback.
- `PreviewRecovery()` does not move records. Its plan exposes `LastTrusted`,
  `AffectedFiles`, `Fingerprint`, and `Resuming`. Both sides of a fork are rejected;
  the preview never arbitrarily selects a competing version.
- Only explicit `Recover(plan)` moves a damaged tail into a unique `recovery-*`
  subdirectory, preserving exact bytes and filenames. It verifies filename,
  content hash, and Windows file identity against the preview. It pins directory
  ancestors, holds the intent file read-only, and moves the original record
  handles without sharing delete access. No user file is deleted or overwritten.
- Durable intent is written before any move. Until a matching completion marker
  is published, normal `Read` and `Save` reject the partial state. A fresh
  `PreviewRecovery` and explicit `Recover` resume an interrupted operation. A
  verified complete recovery returns success even if its final acknowledgement
  failed.

## Limits and remaining boundaries

The store accepts at most 512 published snapshots, 64 KiB per normal snapshot,
and 512 recovery directories. Recovery capture is bounded to 4 MiB per file and
16 MiB total; its durable intent is bounded to 256 KiB before publication. The
store creates only the requested directory; its parent must already exist.

Unreadable or exclusively locked files, reparse points, an altered nonempty lock
file, competing pending recoveries, missing recovery files, and an externally
recreated original path remain explicit blockers. Recovery does not guess which
foreign object to delete. Windows file locks prevent concurrent replacement
during owned operations; hashes do not authenticate an entire history that a
privileged external actor replaces while the store is closed. Filesystem flush
and atomic rename are exercised, but physical power-loss durability was not
tested.

## Exercised failure cases

The suite uses real independent processes for `FileShare.None` and eight races
against a common revision. It also verifies malformed/external snapshots,
identity replacement, stale revisions, saved previous/default profiles,
100 exact Unicode filename publications, paths longer than 260 characters,
actual junction refusal, blocked ancestor replacement, temporary-file ownership,
corrupt-tail/fork recovery, interruption after intent and each partial move,
unknown outcomes, foreign source recreation, intent-file replacement protection,
and storage/read-memory limits.
