'use strict'
/* 一键体检报告：汇总硬件/驱动/显示器/电源/系统优化/Steam 访问/游戏配置状态 */
const fs = require('fs')
const path = require('path')
const { app, dialog } = require('electron')
const system = require('./system')
const power = require('./power')
const apply = require('./apply')
const cs2cfg = require('./cs2cfg')
const { ps } = require('./powershell')
const { screen } = require('electron')
const amd = require('./amd')

const ASSETS = path.join(__dirname, '..', 'assets')

async function refreshRead() {
  try {
    const r = await ps("powershell -NoProfile -ExecutionPolicy Bypass -File '" + path.join(ASSETS, 'set-refresh.ps1') + "'")
    const m = /READ cur=(\d+) max=(\d+) res=(\d+)x(\d+) freqs=([\d,]*)/.exec(String(r))
    return m ? { cur: +m[1], max: +m[2], res: m[3] + 'x' + m[4], freqs: m[5] } : null
  } catch (e) { return null }
}

function section(title) { return { title: title, items: [] } }
function item(sec, name, state, detail, advice) {
  sec.items.push({ name: name, state: state, detail: detail || '', advice: advice || '' })
  return sec
}

async function generate() {
  const t0 = Date.now()
  const out = { time: new Date().toLocaleString('zh-CN'), sections: [], summary: { ok: 0, warn: 0, bad: 0, info: 0 } }

  const [info, loc] = await Promise.all([system.getInfo(true), cs2cfg.locate()])
  const hw = section('硬件与系统')
  item(hw, '操作系统', 'info', (info.os.caption || '') + ' Build ' + (info.os.build || '?'))
  item(hw, 'CPU', 'info', info.cpu.model + '（' + info.cpu.logicalCores + ' 线程）')
  item(hw, '内存', info.memory.freeGB < 2 ? 'warn' : 'ok', '共 ' + info.memory.totalGB + ' GB，空闲 ' + info.memory.freeGB + ' GB', info.memory.freeGB < 2 ? '空闲偏低：关闭浏览器等大内存程序再进游戏' : '')
  hw.title && out.sections.push(hw)

  const gpuSec = section('显卡与驱动')
  for (const g of info.gpus) {
    const isVirtual = /Virtual|Remote|Basic|显示适配器/i.test(g.name)
    item(gpuSec, g.name, isVirtual ? 'info' : 'ok', '驱动 ' + (g.driver || '?'))
  }
  if (info.nvidiaSmi && info.nvidiaSmi.available && info.nvidiaSmi.rows.length) {
    const r0 = info.nvidiaSmi.rows[0]
    item(gpuSec, 'NVIDIA 实时状态', Number(r0.temp) > 80 ? 'warn' : 'ok', r0.temp + '°C · ' + r0.powerDraw + ' / ' + r0.powerLimit)
  }
  out.sections.push(gpuSec)

  const nv = await apply.nvidiaStatus()
  if (nv.available && nv.items && Object.keys(nv.items).length) {
    const nvSec = section('NVIDIA 驱动关键项（NVAPI 读取）')
    apply.NV_CATALOG.forEach(function (c) {
      const st = nv.items[c.id]
      if (!st) return
      const recLabel = (c.options.filter(function (o) { return o[0] === c.rec })[0] || ['', '推荐值'])[1]
      if (st.found && String(st.current).toLowerCase() === String(c.rec).toLowerCase()) item(nvSec, c.title, 'ok', recLabel)
      else if (st.found) item(nvSec, c.title, 'warn', '当前 ' + st.current, '推荐：' + recLabel + '（可在 设备调整 页勾选后一键实施）')
      else item(nvSec, c.title, 'info', '驱动默认值', '推荐：' + recLabel)
    })
    out.sections.push(nvSec)
  }

  const dSec = section('显示器')
  try {
    screen.getAllDisplays().forEach(function (d, i) {
      item(dSec, '显示器 ' + (i + 1) + '（' + (d.internal ? '内置' : '外接') + '）', 'info', d.bounds.width + '×' + d.bounds.height + (d.displayFrequency ? ' @ ' + d.displayFrequency + 'Hz' : '') + '，缩放 ' + Math.round(d.scaleFactor * 100) + '%')
    })
  } catch (e) {}
  const rr = await refreshRead()
  if (rr && rr.max > 0) {
    const okRefresh = rr.cur >= rr.max
    item(dSec, '刷新率（Win32）', okRefresh ? 'ok' : 'bad', '当前 ' + rr.res + ' @ ' + rr.cur + 'Hz（该分辨率最高 ' + rr.max + 'Hz）',
      okRefresh ? '' : '刷新率未拉满是帧数观感差的第一元凶！可在 设备调整 页一键设为 ' + rr.max + 'Hz')
    if (rr.freqs) item(dSec, '可用刷新率', 'info', rr.freqs)
  } else {
    item(dSec, '刷新率（Win32）', 'info', '当前环境不支持枚举显示模式（远程/虚拟桌面），以游戏内 -refresh 启动项指定为准')
  }
  out.sections.push(dSec)

  const sysSec = section('电源与系统优化')
  const [pw, sysItems] = await Promise.all([power.getActive(), apply.sysList()])
  item(sysSec, '电源计划', /高性能|high/i.test(pw.name) ? 'ok' : 'warn', pw.name, /高性能|high/i.test(pw.name) ? '' : '建议切换高性能（设备调整页一键实施）')
  sysItems.forEach(function (t) {
    if (t.id === 'power-plan') return
    if (t.done === true) item(sysSec, t.title, 'ok')
    else if (t.done === false) item(sysSec, t.title, 'warn', '', '可在 设备调整 页勾选一键实施')
    else item(sysSec, t.title, 'info', '当前环境无法检测（远程/虚拟桌面或系统限制）')
  })
  out.sections.push(sysSec)

  /* —— 图形与系统高级项（HAGS / 磁盘 / 启动项 / 覆盖层） —— */
  const hSec = section('图形与系统高级项')
  try {
    const hw = await ps("$v = (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -ErrorAction SilentlyContinue).HwSchMode; if ($v -ne $null) { Write-Output $v }")
    const mode = String(hw).trim()
    if (mode === '2') item(hSec, '硬件加速 GPU 计划 (HAGS)', 'ok', '已开启')
    else if (mode === '1') item(hSec, '硬件加速 GPU 计划 (HAGS)', 'warn', '未开启', '开启可降低 GPU 调度延迟：设置 → 系统 → 屏幕 → 显示卡 → 默认图形设置')
    else item(hSec, '硬件加速 GPU 计划 (HAGS)', 'info', '未检测到（系统版本较老时无此设置）')
  } catch (e) {}
  if (loc.found) {
    try {
      const root = path.parse(loc.gameDir).root.replace('\\', '')
      const dq = await ps("$d = Get-PSDrive -Name '" + root.charAt(0) + "' -ErrorAction SilentlyContinue; if ($d) { Write-Output ([Math]::Round($d.Free/1GB,1)) }")
      const freeGB = parseFloat(String(dq).trim())
      if (!isNaN(freeGB)) item(hSec, 'CS2 所在盘剩余空间', freeGB < 10 ? 'warn' : 'ok', root + ' 剩余 ' + freeGB + ' GB', freeGB < 10 ? '空间过小会影响更新与着色器缓存，建议保持 20GB 以上' : '')
    } catch (e) {}
  }
  /* Steam 启动项（检查 +exec） */
  try {
    let launch = null
    const steamRoot = loc.steamPath
    if (steamRoot) {
      const ud = path.join(steamRoot, 'userdata')
      if (fs.existsSync(ud)) {
        for (const uid of fs.readdirSync(ud)) {
          const lc = path.join(ud, uid, 'config', 'localconfig.vdf')
          if (!fs.existsSync(lc)) continue
          const buf = fs.readFileSync(lc)
          const i = buf.indexOf('launchoptions')
          if (i === -1) continue
          const keyEnd = i + 'launchoptions'.length
          if (buf[keyEnd] === 0 && buf[keyEnd + 1] === 0) {
            const len = buf[keyEnd + 2]
            const val = buf.slice(keyEnd + 3, keyEnd + 3 + len).toString('latin1')
            if (val && /^[ -~]*$/.test(val)) { launch = val; break }
          }
        }
      }
    }
    if (launch !== null) item(hSec, 'Steam 启动项', /exec/.test(launch) ? 'ok' : 'warn', launch || '(空)', /exec/.test(launch) ? '' : '建议加 +exec <你的cfg名>，确保本工具写入的配置在启动时加载')
    else item(hSec, 'Steam 启动项', 'info', '未读取到（Steam 未在此机启动过或路径不同）')
  } catch (e) {}
  /* 常见覆盖层 */
  try {
    const overlays = []
    const checks = [
      ['Discord', 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Discord'],
      ['MSI Afterburner', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MSI Afterburner'],
      ['Overwolf', 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Overwolf'],
      ['NVIDIA App', 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\NVIDIA App']
    ]
    for (const c of checks) {
      const r = await ps("if (Test-Path '" + c[1] + "') { '1' }")
      if (String(r).indexOf('1') !== -1) overlays.push(c[0])
    }
    if (overlays.length) item(hSec, '已安装游戏覆盖层', 'info', overlays.join('、'), '覆盖层有额外开销，比赛时可关闭其 Overlay')
    else item(hSec, '已安装游戏覆盖层', 'ok', '未检测到常见覆盖层')
  } catch (e) {}
  out.sections.push(hSec)

  /* —— AMD 能力探测 —— */
  try {
    const a = await amd.detect()
    if (a.isAmd) {
      const aSec = section('AMD 显卡与能力')
      a.gpus.forEach(function (g) { item(aSec, g.name, 'info', '驱动 ' + (g.driver || '?')) })
      item(aSec, 'AMD Software', a.radeonSoftware.installed ? 'ok' : 'warn', a.radeonSoftware.installed ? (a.radeonSoftware.version || '已安装') : '未检测到', a.radeonSoftware.installed ? '' : '建议安装官方驱动与 AMD Software')
      item(aSec, 'ADL 库', a.adl.available ? 'ok' : 'info', a.adl.available ? a.adl.paths.join(', ') : '未检测到（不影响本工具功能）')
      a.cannotAuto.forEach(function (x) { item(aSec, x.title + '（需手动）', 'info', x.why) })
      out.sections.push(aSec)
    }
  } catch (e) {}
  const gSec = section('CS2 游戏配置')
  item(gSec, 'CS2 安装', loc.found ? 'ok' : 'bad', loc.found ? loc.gameDir : '未找到（确认 Steam 已安装游戏）')
  if (loc.found) {
    const cfgDir = loc.cfgDir
    let files = []
    try { files = fs.readdirSync(cfgDir) } catch (e) {}
    const ourCfg = files.filter(function (f) { return /\.cfg$/i.test(f) && !/^(autoexec|userconfig|video|game)/i.test(f) && !/\.bak$/i.test(f) })
    item(gSec, 'autoexec.cfg', files.some(function (f) { return /^autoexec\.cfg$/i.test(f) }) ? 'ok' : 'info', '存在与否均可（游戏目录有默认文件）')
    if (ourCfg.length) item(gSec, '本工具生成的 cfg', 'ok', ourCfg.join(', ') + '（启动项需含 +exec ' + ourCfg[0].replace(/\.cfg$/i, '') + '）')
    else item(gSec, '本工具生成的 cfg', 'info', '尚未生成', '在游戏设置调整页配置后点“写入 cfg 目录”')
  }
  out.sections.push(gSec)

  out.summary = { ok: 0, warn: 0, bad: 0, info: 0 }
  out.sections.forEach(function (sec) {
    sec.items.forEach(function (it) { if (out.summary[it.state] !== undefined) out.summary[it.state]++ })
  })
  out.elapsedMs = Date.now() - t0
  out.markdown = toMarkdown(out)
  return out
}

function toMarkdown(r) {
  const icon = { ok: '[✔]', warn: '[⚠]', bad: '[✘]', info: '[·]' }
  const L = []
  L.push('# CS2 优化助手 · 一键体检报告')
  L.push('生成时间：' + r.time + '（' + Math.round(r.elapsedMs) + 'ms）')
  L.push('结论：✔ 通过 ' + r.summary.ok + ' · ⚠ 建议优化 ' + r.summary.warn + ' · ✘ 问题 ' + r.summary.bad)
  L.push('')
  r.sections.forEach(function (sec) {
    L.push('## ' + sec.title)
    sec.items.forEach(function (it) {
      let line = '- ' + (icon[it.state] || '') + ' ' + it.name
      if (it.detail) line += '：' + it.detail
      if (it.advice) line += '　→ ' + it.advice
      L.push(line)
    })
    L.push('')
  })
  L.push('---')
  L.push('由 CS2 优化助手 v0.6 生成 ·  GitHub: ahmatjanmahsut/cs2-optimizer')
  return L.join('\n')
}

async function save(markdown) {
  const r = await dialog.showSaveDialog({
    title: '保存体检报告',
    defaultPath: 'CS2体检报告-' + new Date().toISOString().slice(0, 10) + '.md',
    filters: [{ name: 'Markdown / 文本', extensions: ['md', 'txt'] }]
  })
  if (r.canceled || !r.filePath) return { saved: false }
  fs.writeFileSync(r.filePath, String(markdown), 'utf8')
  return { saved: true, path: r.filePath }
}

module.exports = { generate: generate, save: save }
async function saveMarkdown(markdown) {
  const day = new Date().toISOString().slice(0, 10)
  const r = await dialog.showSaveDialog({
    title: '保存体检报告',
    defaultPath: path.join(app.getPath('desktop') || app.getPath('documents'), 'CS2体检报告-' + day + '.md'),
    filters: [{ name: 'Markdown / 文本', extensions: ['md', 'txt'] }]
  })
  if (r.canceled || !r.filePath) return { saved: false }
  fs.writeFileSync(r.filePath, String(markdown || ''), 'utf8')
  return { saved: true, file: r.filePath }
}

module.exports = { generate, saveMarkdown }