param([switch]$Apply)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DispApi {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
    public int dmFields;
    public int dmPositionX, dmPositionY, dmDisplayOrientation, dmDisplayFixedOutput;
    public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels;
    public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
    public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType;
    public int dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
  }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool EnumDisplayDevices(string lp, int i, ref DISPLAY_DEVICE d, int flags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int EnumDisplaySettings(string device, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int ChangeDisplaySettingsEx(string device, ref DEVMODE dm, IntPtr hwnd, int flags, IntPtr param);
  public const int ENUM_CURRENT = -1;
  public const int DM_DISPLAYFREQUENCY = 0x400000;
}
'@
$dev = New-Object DispApi+DISPLAY_DEVICE
$dev.cb = [Runtime.InteropServices.Marshal]::SizeOf($dev)
$target = $null
$i = 0
while ($i -lt 8) {
  $d2 = New-Object DispApi+DISPLAY_DEVICE
  $d2.cb = [Runtime.InteropServices.Marshal]::SizeOf($d2)
  if (-not [DispApi]::EnumDisplayDevices($null, $i, [ref]$d2, 0)) { break }
  if (($d2.StateFlags -band 4) -ne 0 -and -not $target) { $target = $d2.DeviceName }
  if (-not $target) { $target = $d2.DeviceName }
  $i++
}
if (-not $target) { Write-Output 'READFAIL nodevice'; exit 0 }
$dm = New-Object DispApi+DEVMODE
$dm.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($dm)
if (([DispApi]::EnumDisplaySettings($target, [DispApi]::ENUM_CURRENT, [ref]$dm)) -eq 0) { Write-Output ("READFAIL enumcur " + $target); exit 0 }
$cur = [int]$dm.dmDisplayFrequency
$w = [int]$dm.dmPelsWidth
$h = [int]$dm.dmPelsHeight
$freqs = New-Object System.Collections.Generic.List[int]
$k = 0
while ($k -lt 500) {
  $t = New-Object DispApi+DEVMODE
  $t.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($t)
  if (([DispApi]::EnumDisplaySettings($target, $k, [ref]$t)) -eq 0) { break }
  if (([int]$t.dmPelsWidth) -eq $w -and ([int]$t.dmPelsHeight) -eq $h) {
    $f = [int]$t.dmDisplayFrequency
    if (-not $freqs.Contains($f)) { $freqs.Add($f) }
  }
  $k++
}
$max = 0
foreach ($f in $freqs) { if ($f -gt $max) { $max = $f } }
if ($Apply) {
  $d3 = New-Object DispApi+DEVMODE
  $d3.dmSize = [Runtime.InteropServices.Marshal]::SizeOf($d3)
  [void][DispApi]::EnumDisplaySettings($target, [DispApi]::ENUM_CURRENT, [ref]$d3)
  $d3.dmDisplayFrequency = $max
  $d3.dmFields = $d3.dmFields -bor [DispApi]::DM_DISPLAYFREQUENCY
  $r = [DispApi]::ChangeDisplaySettingsEx($target, [ref]$d3, [IntPtr]::Zero, 0, [IntPtr]::Zero)
  Write-Output ("APPLIED code=" + $r + " to=" + $max)
} else {
  $freqs.Sort()
  [void]$freqs.Reverse()
  Write-Output ("READ cur=" + $cur + " max=" + $max + " res=" + $w + "x" + $h + " freqs=" + ($freqs -join ','))
}
