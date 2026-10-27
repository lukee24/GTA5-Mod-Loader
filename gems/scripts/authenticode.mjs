import {execFileSync} from 'node:child_process';

export function authenticode(file) {
  if (process.platform !== 'win32') throw new Error('必须在 Windows 上执行真实 Authenticode 检查。');
  // 调用系统提供的只读证书命令；不载入项目脚本，不改变 ExecutionPolicy 或信任库。
  const command = "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop; "
    + `Get-AuthenticodeSignature -LiteralPath '${file.replaceAll("'", "''")}' -ErrorAction Stop | Select-Object `
    + "@{n='status';e={$_.Status.ToString()}}, @{n='publisher';e={if($_.SignerCertificate){$_.SignerCertificate.GetNameInfo('SimpleName',$false)}}}, "
    + "@{n='thumbprint';e={$_.SignerCertificate.Thumbprint}}, @{n='selfIssued';e={if($_.SignerCertificate){$_.SignerCertificate.Subject -eq $_.SignerCertificate.Issuer}}}, "
    + "@{n='codeSigningEku';e={$_.SignerCertificate.Extensions.EnhancedKeyUsages.Value -contains '1.3.6.1.5.5.7.3.3'}}, @{n='timestamp';e={$null -ne $_.TimeStamperCertificate}} | ConvertTo-Json -Compress";
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8', timeout: 30000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  }).trim());
}

