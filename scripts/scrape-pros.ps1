
$ProgressPreference='SilentlyContinue'
$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
$slugs = @('zywoo','m0nesy','donk','sh1ro','ropz','niko','device','b1t','w0nderful','magixx','stavn','apex','hunter-','karrigan','teses','jabbi','nertz','flamez','jame','s1mple')
$display = @{ 'zywoo'='ZywOo'; 'm0nesy'='m0NESY'; 'donk'='donk'; 'sh1ro'='sh1ro'; 'ropz'='ropz'; 'niko'='NiKo'; 'device'='device'; 'b1t'='b1t'; 'w0nderful'='w0nderful'; 'magixx'='magixx'; 'stavn'='stavn'; 'apex'='apEX'; 'hunter-'='huNter-'; 'karrigan'='karrigan'; 'teses'='TeSeS'; 'jabbi'='jabbi'; 'nertz'='nertZ'; 'flamez'='flameZ'; 'jame'='Jame'; 's1mple'='s1mple' }
function GetField($html, $field) {
  $m = [regex]::Match($html, '<tr class="[^"]*" data-field="' + [regex]::Escape($field) + '"><th>[^<]*</th><td>([^<]*)</td>')
  if ($m.Success) { return $m.Groups[1].Value.Trim() }
  return $null
}
$players = @()
foreach ($s in $slugs) {
  try {
    $html = (Invoke-WebRequest ('https://prosettings.net/players/' + $s + '/') -Headers @{ 'User-Agent' = $ua } -UseBasicParsing -TimeoutSec 20).Content
    $p = [ordered]@{
      slug = $s
      name = $display[$s]
      dpi = GetField $html 'dpi'
      sensitivity = GetField $html 'sensitivity'
      edpi = GetField $html 'edpi'
      zoom = GetField $html 'zoom_sensitivity_ratio_mouse'
      hz = GetField $html 'hz'
      style = GetField $html 'cl_crosshairstyle'
      length = GetField $html 'cl_crosshair_length'
      thickness = GetField $html 'cl_crosshair_thickness'
      gap = GetField $html 'cl_crosshair_gap'
      outline = GetField $html 'cl_crosshair_drawoutline'
      dot = GetField $html 'cl_crosshairdot'
      tstyle = GetField $html 'cl_crosshair_t'
      cr = GetField $html 'cl_crosshaircolor_r'
      cg = GetField $html 'cl_crosshaircolor_g'
      cb = GetField $html 'cl_crosshaircolor_b'
      ca = GetField $html 'cl_crosshaircolor_a'
      sniper = GetField $html 'cl_crosshair_sniper_width'
      vmfov = GetField $html 'viewmodel_fov'
      vmx = GetField $html 'viewmodel_offset_x'
      vmy = GetField $html 'viewmodel_offset_y'
      vmz = GetField $html 'viewmodel_offset_z'
      radar = GetField $html 'cl_radar_scale'
      maxfps = GetField $html 'max_fps'
      resolution = GetField $html 'resolution'
      aspect = GetField $html 'aspect_ratio'
    }
    $players += [pscustomobject]$p
    Write-Output ('OK ' + $s)
    Start-Sleep -Milliseconds 350
  } catch { Write-Output ('FAIL ' + $s + ' ' + $_.Exception.Message) }
}
$json = $players | ConvertTo-Json -Depth 4
[IO.File]::WriteAllText((Join-Path (Get-Location) 'src/renderer/data/proplayers.json'), '{"players":' + $json + '}', (New-Object System.Text.UTF8Encoding($false)))
Write-Output ('TOTAL ' + $players.Count)
