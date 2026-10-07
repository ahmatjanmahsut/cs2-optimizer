param([switch]$Apply, [switch]$Restore)
$bkFile = Join-Path $PSScriptRoot 'mouse-backup.json'
$reg = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Control Panel\Mouse', $true)
function GetV($n) { $v = $reg.GetValue($n); if ($v -eq $null) { return '' } return [string]$v }
function SetV($n, $v) { $reg.SetValue($n, $v, [Microsoft.Win32.RegistryValueKind]::String) }
if ($Apply) {
  if (-not (Test-Path $bkFile)) {
    $snap = @{ MouseSpeed = (GetV 'MouseSpeed'); MouseThreshold1 = (GetV 'MouseThreshold1'); MouseThreshold2 = (GetV 'MouseThreshold2') }
    ($snap | ConvertTo-Json -Compress) | Set-Content -Path $bkFile -Encoding UTF8
  }
  SetV 'MouseSpeed' '0'; SetV 'MouseThreshold1' '0'; SetV 'MouseThreshold2' '0'
  Write-Output 'MOUSE-OK'
} elseif ($Restore) {
  if (-not (Test-Path $bkFile)) { Write-Output 'NO-BACKUP'; exit 0 }
  $j = Get-Content $bkFile -Raw | ConvertFrom-Json
  SetV 'MouseSpeed' ([string]$j.MouseSpeed); SetV 'MouseThreshold1' ([string]$j.MouseThreshold1); SetV 'MouseThreshold2' ([string]$j.MouseThreshold2)
  Write-Output 'MOUSE-RESTORED'
} else {
  Write-Output ("STATE " + (GetV 'MouseSpeed') + " " + (GetV 'MouseThreshold1') + " " + (GetV 'MouseThreshold2'))
}
$reg.Close()