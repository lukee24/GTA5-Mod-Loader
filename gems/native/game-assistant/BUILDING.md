# Optional game assistant build

The desktop application and its core tests do not require this SDK. This public
repository contains the GEMS C# source and preserved upstream notices, but no
third-party runtime, SDK binary, game file, or prebuilt assistant DLL. The
assistant has not passed in-game validation; automatic installation stays disabled.

To build this optional component on Windows with the .NET 8 SDK:

1. Obtain `ScriptHookVDotNetEnhanced-v1.1.0.6.zip` from the upstream release linked
   in [SOURCE.md](third_party/shvdne/SOURCE.md). Review the upstream license and
   runtime requirements. GEMS does not download or install the runtime for you.
2. Save it locally as `third_party/shvdne/release.zip` relative to this directory.
   Check SHA-256 before extracting:
   `f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a`.
3. Extract the archive locally into `third_party/shvdne/package/`. The expected
   reference is `package/ScriptHookVDotNet3.dll`, SHA-256
   `1e4d0bc4d34d05a6038fc87eede492d3dc4265522de473ec19cdf6746b5b0e48`.
4. From `gems/`, run `./native/game-assistant/build.ps1`. The script checks both
   hashes, builds, and runs offline tests. NuGet restores the fixed .NET Framework
   reference assembly package defined in the project file.

The generated `artifacts/`, SDK archive and extracted runtime are ignored by Git
and rejected by the public source archive policy. Do not commit or upload them as
part of the source release. Building does not install the assistant into a game.

The original license notices in `third_party/shvdne/package/Licenses/` remain
upstream material, with their own terms. GEMS' MIT license covers GEMS code.

For the 0.1.81 input and mapping development checkpoint, the additional production
script, SDK adapter, real filesystem, GDI and final DLL checks are listed in
[STAGE4-0.1.81.md](STAGE4-0.1.81.md). The basic build script runs core checks only;
it does not certify these additional groups or actual game loading.

The 0.1.82 player movement checkpoint adds production script, typed player-port,
and GDI checks in [STAGE5-0.1.82.md](STAGE5-0.1.82.md). Its run/swim controls stop
their own per-frame requests; they do not read or restore another script's
unknown multiplier. This component remains unavailable for desktop installation
until actual game validation succeeds.
