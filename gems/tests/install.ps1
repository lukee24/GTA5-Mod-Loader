param([switch]$ScaleCaptureOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $projectRoot ("release\GEMS-$version-x64-setup.exe")
$installRoot = Join-Path ([IO.Path]::GetTempPath()) ('gems-install-check-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $installRoot) { throw '隔离安装目录已存在，拒绝覆盖。' }
$userData = Join-Path $env:APPDATA 'GEMS\Studio'
New-Item -ItemType Directory -Force -Path $userData | Out-Null
$marker = Join-Path $userData ('installer-retention-check-' + [guid]::NewGuid().ToString('N') + '.txt')
$markerContent = 'GEMS 独立安装器保留数据检查'
[IO.File]::WriteAllText($marker, $markerContent)
$previousExe = $env:GEMS_PACKAGED_EXE
$installed = $false
try {
    $process = Start-Process -FilePath $installer -ArgumentList @('/S', ('/D=' + $installRoot)) -WindowStyle Hidden -PassThru -Wait
    if ($process.ExitCode -ne 0) { throw "安装器退出码：$($process.ExitCode)" }
    $executable = Join-Path $installRoot 'GEMS.exe'
    if (-not (Test-Path -LiteralPath $executable)) { throw '安装器未生成桌面程序。' }
    $installed = $true
    if ($env:GEMS_REQUIRE_SIGNATURES -eq '1') {
        foreach ($program in @($executable, (Join-Path $installRoot 'Uninstall GEMS.exe'))) {
            node (Join-Path $projectRoot 'scripts/verify-signatures.mjs') --file $program
            if ($LASTEXITCODE -ne 0) { throw '已安装程序或卸载器的可信签名检查失败。' }
        }
    }
    $env:GEMS_PACKAGED_EXE = $executable
    Push-Location $projectRoot
    try {
        if ($ScaleCaptureOnly) {
            $previousSmokeExe = $env:GEMS_SMOKE_EXE
            $previousSmokeScale = $env:GEMS_SMOKE_SCALE
            try {
                $env:GEMS_SMOKE_EXE = $executable
                $env:GEMS_SMOKE_SCALE = '1.2'
                node tests/smoke.mjs
            } finally {
                $env:GEMS_SMOKE_EXE = $previousSmokeExe
                $env:GEMS_SMOKE_SCALE = $previousSmokeScale
            }
        } else { npm run test:ui }
        if ($LASTEXITCODE -ne 0) { throw '已安装程序的真实 Electron UI/IPC 回归失败。' }
    } finally { Pop-Location }
    if ($ScaleCaptureOnly) { Write-Host "通过：NSIS 独立安装的程序启动与 120% 原生窗口截图：$installRoot。" }
    else { Write-Host "通过：NSIS 安装到新的独立目录 $installRoot；已安装 exe 回归通过。" }
} finally {
    $env:GEMS_PACKAGED_EXE = $previousExe
    if ($installed) {
        $uninstaller = Join-Path $installRoot 'Uninstall GEMS.exe'
        if (-not (Test-Path -LiteralPath $uninstaller)) { throw '未找到本次安装的卸载程序。' }
        if ($env:GEMS_REQUIRE_SIGNATURES -eq '1') {
            node (Join-Path $projectRoot 'scripts/verify-signatures.mjs') --file $uninstaller
            if ($LASTEXITCODE -ne 0) { throw '卸载器签名检查失败，保留隔离目录，拒绝执行。' }
        }
        $removed = Start-Process -FilePath $uninstaller -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
        if ($removed.ExitCode -ne 0) { throw "卸载退出码：$($removed.ExitCode)" }
        if (Test-Path -LiteralPath (Join-Path $installRoot 'GEMS.exe')) { throw '卸载后本次安装程序仍存在。' }
        if (-not (Test-Path -LiteralPath $marker) -or [IO.File]::ReadAllText($marker) -ne $markerContent) { throw '卸载未正确保留用户数据。' }
        Write-Host '通过：实际卸载移除程序，保留独立用户数据目录中的校验文件。'
    }
    if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker }
}
