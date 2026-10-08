'use strict'
/* AMD 能力探测：显卡/驱动/Radeon Software/ADL 状态 + 能做什么、不能做什么（诚实清单） */
const fs = require('fs')
const path = require('path')
const { ps, pexec } = require('./powershell')
const system = require('./system')

const RADEON_PATHS = [
  'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe',
  'C:\\Program Files\\AMD\\CNext\\CNext\\AMDRSSrcExt.exe',
  'C:\\Program Files\\AMD\\CNext\\CNext64\\RadeonSoftware.exe'
]
const ADL_PATHS = [
  'C:\\Windows\\System32\\atiadlxx.dll',
  'C:\\Windows\\System32\\ADL64.dll',
  'C:\\Windows\\SysWOW64\\atiadlxx.dll'
]

async function registryValue(key, name) {
  try {
    const r = await ps("$v = (Get-ItemProperty -Path '" + key + "' -Name " + name + " -ErrorAction SilentlyContinue)." + name + "; if ($v -ne $null) { Write-Output $v }")
    const s = String(r).trim()
    return s || null
  } catch (e) { return null }
}

async function radeonSoftware() {
  const found = RADEON_PATHS.filter(function (p) { return fs.existsSync(p) })
  let version = null
  if (found.length) {
    try {
      const r = await ps("(Get-Item -LiteralPath '" + found[0] + "').VersionInfo.FileVersion")
      version = String(r).trim() || null
    } catch (e) {}
  }
  /* 注册表里的 AMD Software 版本（Adrenalin 卸载信息） */
  if (!version) {
    try {
      const r = await ps("Get-ChildItem 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue; if ($p.DisplayName -match 'AMD Software') { Write-Output ($p.DisplayName + '|' + $p.DisplayVersion) } } | Select-Object -First 1")
      const s = String(r).trim()
      if (s) version = s.split('|')[1] || null
    } catch (e) {}
  }
  return { installed: found.length > 0, path: found[0] || null, version: version }
}

function adlStatus() {
  const found = ADL_PATHS.filter(function (p) { return fs.existsSync(p) })
  return { available: found.length > 0, paths: found }
}

async function detect() {
  const [info, radeon] = await Promise.all([system.getInfo(), radeonSoftware()])
  const amdGpus = info.gpus.filter(function (g) { return /AMD|Radeon/i.test(g.name) })
  const isAmd = amdGpus.length > 0
  const adl = adlStatus()
  return {
    isAmd: isAmd,
    gpus: amdGpus.map(function (g) { return { name: g.name, driver: g.driver } }),
    driverVersion: amdGpus.length ? amdGpus[0].driver : null,
    radeonSoftware: radeon,
    adl: adl,
    /* 诚实的能力矩阵：哪些能自动做、哪些必须手动 */
    canAuto: [
      { id: 'refresh', title: '显示器刷新率拉到最高', how: 'Win32 显示 API（与 NVIDIA 通用）' },
      { id: 'gpu-pref', title: '为 CS2 指定高性能 GPU', how: 'Windows 图形设置（注册表）' },
      { id: 'fso', title: '关闭全屏优化', how: 'AppCompatFlags 按程序设置' },
      { id: 'power', title: '电源计划 / PCIe 省电 / 处理器提升', how: 'powercfg' },
      { id: 'sys', title: 'Game DVR / 游戏模式 / 鼠标加速', how: '系统设置（HKCU）' },
      { id: 'cfg', title: '准星 / 灵敏度 / 按键绑定写入 cfg', how: '直接写 cfg 文件' }
    ],
    cannotAuto: [
      { id: 'antilag', title: 'Radeon Anti-Lag / Boost / Chill', why: 'AMD 未提供公开的 3D 设置写入接口（ADL 只管显示/超频，不含游戏配置文件），写注册表有弄坏驱动配置的风险' },
      { id: 'texfilter', title: '纹理过滤质量 / 表面格式优化', why: '同上，需在 AMD Software 中手动设置' },
      { id: 'vsync', title: '等待垂直刷新', why: '同上' }
    ],
    checklist: [
      { id: 'antilag', label: 'Radeon Anti-Lag 设为「开」', note: '降低输入延迟，对枪更跟手' },
      { id: 'boost', label: 'Radeon Boost 设「关」', note: '动态降分辨率会糊画面，竞技不建议' },
      { id: 'chill', label: 'Radeon Chill 设「关」', note: '限帧会带来额外延迟' },
      { id: 'vsync', label: '等待垂直刷新「关」（始终关闭）', note: '消除同步延迟' },
      { id: 'sfc', label: '表面格式优化「关」', note: '驱动级缓存偶发卡顿' },
      { id: 'texq', label: '纹理过滤质量「性能」', note: '提高帧数' },
      { id: 'sharpen', label: '图像锐化「关」或按需', note: '避免与游戏内锐化叠加' },
      { id: 'display', label: 'Windows 显示设置里确认刷新率已拉满', note: '很多新显示器默认 60Hz' }
    ]
  }
}

async function openRadeon() {
  const p = RADEON_PATHS.filter(function (x) { return fs.existsSync(x) })[0]
  if (p) {
    const { shell } = require('electron')
    const err = await shell.openPath(p)
    return { ok: !err, message: err || '已启动 AMD Software' }
  }
  try {
    const r = await ps("Get-ChildItem 'C:\\Program Files\\AMD' -Recurse -Filter *.exe -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'RadeonSoftware|AMDRSSrc' } | Select-Object -First 1 -ExpandProperty FullName")
    const found = String(r).trim()
    if (found) {
      const { shell } = require('electron')
      const err = await shell.openPath(found)
      return { ok: !err, message: err || '已启动 AMD Software' }
    }
  } catch (e) {}
  return { ok: false, message: '未找到 AMD Software，请在开始菜单搜索 “AMD Software: Adrenalin Edition”' }
}

module.exports = { detect, openRadeon, adlStatus, radeonSoftware }
