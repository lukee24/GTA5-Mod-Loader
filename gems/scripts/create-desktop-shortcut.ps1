param([switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$gemsRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$gemsRuntime = Join-Path $gemsRoot 'node_modules/electron/dist/electron.exe'
$gemsMain = Join-Path $gemsRoot 'dist/main.cjs'
$gemsIcon = Join-Path $gemsRoot 'assets/gems.ico'
foreach ($gemsFile in @($gemsRuntime, $gemsMain, $gemsIcon)) {
    if (-not (Test-Path -LiteralPath $gemsFile -PathType Leaf)) {
        throw "开发版文件缺失，请先完成依赖安装及 npm run build：$gemsFile"
    }
}
$gemsDesktop = [Environment]::GetFolderPath('Desktop')
if (-not $gemsDesktop -or -not (Test-Path -LiteralPath $gemsDesktop -PathType Container)) {
    throw '无法定位当前用户的桌面目录。'
}
$gemsShortcutPath = Join-Path $gemsDesktop 'GEMS（开发版）.lnk'
$gemsArguments = '"' + $gemsRoot + '"'
$gemsShell = New-Object -ComObject WScript.Shell
try {
    if (Test-Path -LiteralPath $gemsShortcutPath) {
        if (-not (Test-Path -LiteralPath $gemsShortcutPath -PathType Leaf)) { throw '桌面同名项目不是文件，停止创建。' }
        $gemsExisting = $gemsShell.CreateShortcut($gemsShortcutPath)
        if ($gemsExisting.TargetPath -ne $gemsRuntime -or $gemsExisting.Arguments -ne $gemsArguments -or $gemsExisting.WorkingDirectory -ne $gemsRoot) {
            throw '桌面已有指向其他位置的同名快捷方式，停止覆盖。'
        }
    } elseif ($VerifyOnly) {
        throw '桌面开发版快捷方式尚未创建。'
    }
    if (-not $VerifyOnly) {
        $gemsShortcut = $gemsShell.CreateShortcut($gemsShortcutPath)
        $gemsShortcut.TargetPath = $gemsRuntime
        $gemsShortcut.Arguments = $gemsArguments
        $gemsShortcut.WorkingDirectory = $gemsRoot
        $gemsShortcut.IconLocation = $gemsIcon + ',0'
        $gemsShortcut.Description = 'GEMS 全新工程开发版；更新后重新打开生效。正式签名发行版尚未交付。'
        $gemsShortcut.Save()
    }
    $gemsVerified = $gemsShell.CreateShortcut($gemsShortcutPath)
    if ($gemsVerified.TargetPath -ne $gemsRuntime -or $gemsVerified.Arguments -ne $gemsArguments -or $gemsVerified.WorkingDirectory -ne $gemsRoot) {
        throw '快捷方式目标核对失败。'
    }
    Write-Output "已核对开发版快捷方式：$gemsShortcutPath"
    Write-Output '指向本工程的现有 Electron 开发运行时；没有创建正式安装包或修改安全策略。'
} finally {
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($gemsShell)
}
