param([string]$JsonFile)
$ErrorActionPreference = 'Stop'
function HexU([string]$h) { $h = $h -replace '^0x', ''; return [Convert]::ToUInt32($h, 16) }
[void](Add-Type -TypeDefinition (Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'nvapi-csharp.txt')) -ReferencedAssemblies 'System.Runtime')
$req = [IO.File]::ReadAllText($JsonFile) | ConvertFrom-Json
$st = [CStuner.Drv]::Init()
if ($st -ne 0) { Write-Output ('{"ok":false,"reason":"nvapi-init","code":' + $st + '}'); exit 0 }
$sess = [IntPtr]::Zero
$oc = [CStuner.Drv]::SessOpen([ref]$sess)
if ($oc -ne 0) { Write-Output ('{"ok":false,"reason":"create-session","code":' + $oc + '}'); exit 0 }
[void][CStuner.Drv]::Load($sess)
$profile = [IntPtr]::Zero
$isGlobal = ($req.target -eq 'global')
$createdProfile = $false
if ($isGlobal) {
  $bc = [CStuner.Drv]::BaseProfile($sess, [ref]$profile)
  if ($bc -ne 0) { [CStuner.Drv]::SessClose($sess); Write-Output ('{"ok":false,"reason":"no-base-profile","code":' + $bc + '}'); exit 0 }
} else {
  $fc = [CStuner.Drv]::ProfileFind($sess, [string]$req.profile, [ref]$profile)
  if ($fc -ne 0) {
    if ([string]$req.mode -eq 'remove' -or [string]$req.mode -eq 'read') {
      [CStuner.Drv]::SessClose($sess)
      Write-Output ('{"ok":true,"profileExists":false,"items":[]}')
      exit 0
    }
    $pc = [CStuner.Drv]::ProfileCreate($sess, [string]$req.profile, [ref]$profile)
    if ($pc -ne 0) { [CStuner.Drv]::SessClose($sess); Write-Output ('{"ok":false,"reason":"create-profile","code":' + $pc + '}'); exit 0 }
    $createdProfile = $true
    [void][CStuner.Drv]::AppCreate($sess, $profile, [string]$req.appName)
  }
}
$items = @()
foreach ($s in $req.settings) {
  $sid = HexU([string]$s.id)
  $val = 0; $pre = -1
  $rc = [CStuner.Drv]::SettingRead($sess, $profile, $sid, [ref]$val, [ref]$pre)
  if ([string]$req.mode -eq 'read') {
    $items += [pscustomobject]@{ id = [string]$s.id; found = ($rc -eq 0); current = ('0x' + $val.ToString('X8')); predefined = $pre }
    continue
  }
  $backup = $null
  if ($rc -eq 0) { $backup = [pscustomobject]@{ id = [string]$s.id; value = ('0x' + $val.ToString('X8')); predefined = $pre } }
  else { $backup = [pscustomobject]@{ id = [string]$s.id; absent = $true } }
  if ([string]$req.mode -eq 'restore') {
    $r = $s.restore
    $code = -1
    if ($r) {
      if ($r.absent -or [int]$r.predefined -eq 1) { $code = [CStuner.Drv]::SettingDelete($sess, $profile, $sid) }
      else { $code = [CStuner.Drv]::SettingApply($sess, $profile, $sid, (HexU([string]$r.value))) }
    }
    $items += [pscustomobject]@{ id = [string]$s.id; set = ($code -eq 0); code = $code; backup = $backup }
    continue
  }
  $code = [CStuner.Drv]::SettingApply($sess, $profile, $sid, (HexU([string]$s.value)))
  $items += [pscustomobject]@{ id = [string]$s.id; set = ($code -eq 0); code = $code; backup = $backup }
}
$saved = $null
if ([string]$req.mode -eq 'apply' -or [string]$req.mode -eq 'restore') {
  $sr = [CStuner.Drv]::Save($sess)
  $saved = ($sr -eq 0)
}
if ([string]$req.mode -eq 'remove' -and -not $isGlobal) {
  $dc = [CStuner.Drv]::ProfileDelete($sess, $profile)
  if ($dc -eq 0) { [void][CStuner.Drv]::Save($sess) }
  $saved = ($dc -eq 0)
}
[CStuner.Drv]::SessClose($sess)
$result = [pscustomobject]@{ ok = $true; mode = [string]$req.mode; createdProfile = $createdProfile; saved = $saved; profile = [string]$req.profile; items = $items }
Write-Output ($result | ConvertTo-Json -Compress -Depth 6)
