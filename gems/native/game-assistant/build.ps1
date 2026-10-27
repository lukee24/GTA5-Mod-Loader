param([switch]$SkipTests)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$releasePath = Join-Path $projectRoot 'third_party\shvdne\release.zip'
$expectedHash = 'F10DA8819FA6814FB0A04553567D2516934EAC96B16AF06AD8F315F0DA00473A'
if (-not (Test-Path -LiteralPath $releasePath -PathType Leaf)) { throw 'Optional SDK is not distributed with GEMS source. Follow native/game-assistant/BUILDING.md to obtain and verify the pinned upstream archive.' }
if ((Get-FileHash -LiteralPath $releasePath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'SHVDNE 编译 SDK 下载包校验失败。' }
$referencePath = Join-Path $projectRoot 'third_party\shvdne\package\ScriptHookVDotNet3.dll'
if (-not (Test-Path -LiteralPath $referencePath -PathType Leaf)) { throw 'Extract the verified SDK archive as described in BUILDING.md.' }
if ((Get-FileHash -LiteralPath $referencePath -Algorithm SHA256).Hash -ne '1E4D0BC4D34D05A6038FC87EEDE492D3DC4265522DE473EC19CDF6746B5B0E48') { throw 'SHVDNE 编译引用与固定版本不一致。' }
dotnet build (Join-Path $projectRoot 'GEMS.GameAssistant.csproj') -c Release --nologo
if ($LASTEXITCODE -ne 0) { throw '游戏助手编译失败。' }
if (-not $SkipTests) {
    dotnet run --project (Join-Path $projectRoot 'tests\GEMS.GameAssistant.Tests.csproj') -c Release --nologo
    if ($LASTEXITCODE -ne 0) { throw '游戏助手离线检查失败。' }
}
$artifactRoot = Join-Path $projectRoot 'artifacts'
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'bin\Release\net48\GEMS.GameAssistant.dll') -Destination $artifactRoot -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'capabilities.json') -Destination $artifactRoot -Force
Write-Host '已生成开发测试 DLL。未进行 Enhanced 游戏内验证，桌面自动安装入口保持禁用。'
