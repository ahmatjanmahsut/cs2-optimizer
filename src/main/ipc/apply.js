'use strict'
/* 一键实施引擎：NVIDIA NVAPI 驱动写入 + Windows 系统优化 + 电源细项 + 鼠标 */
const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const { ps, pexec: execFile } = require('./powershell')
const power = require('./power')
const system = require('./system')
const cs2cfg = require('./cs2cfg')

const ASSETS = path.join(__dirname, '..', 'assets')
const BACKUP_FILE = function () { return path.join(app.getPath('userData'), 'nvidia-backup.json') }

/* ---------- NVIDIA（ID/取值来自官方 nvapi 头 + ProfileInspector 库，本机实测读取成功） ---------- */
const NV_CATALOG = [
  { id: '0x1057EB71', title: '电源管理模式', rec: '0x00000001',
    options: [['0x00000005', '最优功率（默认）'], ['0x00000000', '正常'], ['0x00000001', '最高性能优先（推荐）']] },
  { id: '0x0005F543', title: '低延迟模式（反延迟）', rec: '0x00000001',
    options: [['0x00000000', '关'], ['0x00000001', '开（推荐）'], ['0x00000002', 'Ultra（帧数富余时）']] },
  { id: '0x00A879CF', title: '垂直同步', rec: '0x08416747',
    options: [['0x08416747', '关（推荐）'], ['0x60925292', '由 3D 应用程序控制'], ['0x18888888', '快速同步（G-SYNC 兼容）'], ['0x47814940', '开']] },
  { id: '0x20FDD1F9', title: '三重缓冲', rec: '0x00000000',
    options: [['0x00000000', '关（推荐）'], ['0x00000001', '开']] },
  { id: '0x00CE2691', title: '纹理过滤 - 质量', rec: '0x00000014',
    options: [['0x00000014', '高性能（推荐）'], ['0x0000000A', '质量'], ['0x00000000', '高质量']] },
  { id: '0x20C1221E', title: '线程优化', rec: '0x00000001',
    options: [['0x00000000', '自动'], ['0x00000001', '开（推荐）'], ['0x00000002', '关']] },
  { id: '0x00198FFF', title: '着色器缓存 - 开关', rec: '0x00000001',
    options: [['0x00000001', '开（推荐）'], ['0x00000000', '关']] },
  { id: '0x00AC8497', title: '着色器缓存 - 大小', rec: '0x00002800',
    options: [['0x00001000', '4 GB'], ['0x00002800', '10 GB（推荐）'], ['0x00004000', '16 GB'], ['0xFFFFFFFF', '无限制']] }
]
const NV_PROFILE = 'CS2-Optimizer'
const NV_APP = 'cs2.exe'

function runNvapi(request) {
  const tmp = path.join(app.getPath('userData'), 'nvapi-req-' + Date.now() + '.json')
  fs.writeFileSync(tmp, JSON.stringify(request), 'utf8')
  return new Promise(function (resolve, reject) {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ASSETS, 'nvapi-drs.ps1'), '-JsonFile', tmp],
      { windowsHide: true, timeout: 90000, maxBuffer: 4 * 1024 * 1024 },
      function (err, stdout) {
        try { fs.unlinkSync(tmp) } catch (e) {}
        if (err) { reject(new Error('NVAPI 执行失败: ' + String(err.message || err))); return }
        const line = String(stdout).split(/\r?\n/).filter(function (l) { return l.trim().charAt(0) === '{' }).pop()
        if (!line) { reject(new Error('NVAPI 无输出（可能被安全软件拦截 PowerShell）')); return }
        try { resolve(JSON.parse(line)) } catch (e) { reject(new Error('NVAPI 输出解析失败')) }
      })
  })
}
function loadBackup() { try { return JSON.parse(fs.readFileSync(BACKUP_FILE(), 'utf8')) } catch (e) { return {} } }
function saveBackup(b) { try { fs.writeFileSync(BACKUP_FILE(), JSON.stringify(b, null, 2), 'utf8') } catch (e) {} }

async function nvidiaAvailable() {
  const gpus = await system.getGpus()
  return gpus.some(function (g) { return /NVIDIA|GeForce|RTX|GTX/i.test(g.name) })
}

async function nvidiaApply(selections) {
  if (!(await nvidiaAvailable())) throw new Error('本机未检测到 NVIDIA 显卡')
  const list = (selections || []).filter(function (s) { return s && s.id && s.value })
  if (!list.length) return { ok: true, skipped: '未选择任何 NVIDIA 项' }
  let r = await runNvapi({ mode: 'apply', profile: NV_PROFILE, appName: NV_APP, settings: list })
  if (!r.ok && (r.reason === 'create-profile' || r.reason === 'no-base-profile')) {
    r = await runNvapi({ mode: 'apply', target: 'global', profile: NV_PROFILE, appName: NV_APP, settings: list })
    if (r.ok) r.globalFallback = true
  }
  if (!r.ok) {
    if (r.reason === 'create-profile') throw new Error('驱动设置存储被第三方电源/优化软件锁定（NVAPI 错误码 ' + r.code + '）。建议：暂停 Atlas/GamePP 等系统优化软件后重试；或在 NVIDIA 控制面板按清单手动设置（不影响其它一键项）')
    throw new Error('驱动写入失败（' + r.reason + ' code=' + r.code + '）')
  }
  const bk = loadBackup()
  ;(r.items || []).forEach(function (it) { if (it.backup) bk[it.id] = it.backup })
  saveBackup(bk)
  return { ok: true, saved: r.saved, items: r.items }
}

async function nvidiaStatus() {
  if (!(await nvidiaAvailable())) return { available: false }
  try {
    const ids = NV_CATALOG.map(function (c) { return { id: c.id } })
    let r = await runNvapi({ mode: 'read', profile: NV_PROFILE, appName: NV_APP, settings: ids })
    let inProfile = true
    if (!r.ok || r.profileExists === false) {
      r = await runNvapi({ mode: 'read', target: 'global', profile: NV_PROFILE, appName: NV_APP, settings: ids })
      inProfile = false
    }
    if (!r.ok) return { available: true, readable: false, error: r.reason || 'profile-unreadable' }
    if (r.profileExists === false) return { available: true, applied: false, items: {} }
    const map = {}
    ;(r.items || []).forEach(function (it) { map[it.id] = it })
    return { available: true, readable: true, applied: inProfile, items: map }
  } catch (e) { return { available: false, error: String(e.message || e) } }
}

async function nvidiaRestore() {
  const bk = loadBackup()
  const ids = Object.keys(bk)
  if (!ids.length) return { ok: true, skipped: '无 NVIDIA 写入记录' }
  const settings = ids.map(function (id) { return { id: id, restore: bk[id] } })
  let r = await runNvapi({ mode: 'restore', profile: NV_PROFILE, appName: NV_APP, settings: settings })
  if (!r.ok && r.reason === 'create-profile') r = await runNvapi({ mode: 'restore', target: 'global', profile: NV_PROFILE, appName: NV_APP, settings: settings })
  if (!r.ok) throw new Error('恢复失败: ' + r.reason)
  if (r.saved !== false) { /* 恢复成功后清空备份 */ }
  try { fs.unlinkSync(BACKUP_FILE()) } catch (e) {}
  return r
}

async function nvidiaRemoveProfile() {
  const r = await runNvapi({ mode: 'remove', profile: NV_PROFILE, appName: NV_APP, settings: [] })
  if (r.ok) { try { fs.unlinkSync(BACKUP_FILE()) } catch (e) {} }
  return r
}

/* ---------- Windows / 系统级 ---------- */
function psQ(s) { return String(s).split("'").join("''") }
function regScript(key, name, value) {
  if (value === null) {
    return "$r=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('" + psQ(key) + "');" +
      "if ($r) { $v=$r.GetValue('" + psQ(name) + "'); $r.Close(); if ($v -eq $null) { 'NULL' } else { [string]$v } } else { 'NOKEY' }"
  }
  return "$r=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey('" + psQ(key) + "');" +
    "$r.SetValue('" + psQ(name) + "','" + psQ(value) + "'); $r.Close(); 'REG-OK'"
}
async function regRead(key, name) {
  const r = await ps(regScript(key, name, null))
  const s = String(r).trim()
  return s === 'NOKEY' || s === 'NULL' ? null : s
}
async function regWrite(key, name, value) {
  const r = await ps(regScript(key, name, value))
  return String(r).indexOf('REG-OK') !== -1
}

async function cs2ExePath() {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 安装目录')
  return path.join(loc.gameDir, 'game', 'bin', 'win64', 'cs2.exe')
}

const SYS = [
  {
    id: 'gpu-pref', title: 'Windows 图形设置：CS2 指定高性能 GPU',
    desc: '双显卡笔记本必开。强制 CS2 使用独立显卡渲染（写入 DirectX UserGpuPreferences）',
    async check() { const exe = await cs2ExePath(); const v = await regRead('Software\\Microsoft\\DirectX\\UserGpuPreferences', exe); return !!v && String(v).indexOf('GpuPreference=1') !== -1 },
    async apply() { const exe = await cs2ExePath(); return (await regWrite('Software\\Microsoft\\DirectX\\UserGpuPreferences', exe, 'GpuPreference=1;')) ? '已指定高性能 GPU：' + exe : fail('注册表写入失败') }
  },
  {
    id: 'fso-off', title: '关闭 CS2 全屏优化（FSO）',
    desc: '降低输入延迟与切屏卡顿（AppCompatFlags，按程序生效）',
    async check() { const exe = await cs2ExePath(); const v = await regRead('Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', exe); return !!v && String(v).indexOf('DISABLEDXMAXIMIZEDWINDOWEDMODE') !== -1 },
    async apply() { const exe = await cs2ExePath(); return (await regWrite('Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers', exe, '~ DISABLEDXMAXIMIZEDWINDOWEDMODE')) ? '已关闭全屏优化' : fail('注册表写入失败') }
  },
  {
    id: 'gamedvr-off', title: '关闭 Game DVR 后台录制',
    desc: 'Xbox 后台录制是经典卡顿源（GameDVR + GameConfigStore 两键）',
    async check() { const a = await regRead('Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppEnabled'); return a === null || String(a) === '0' },
    async apply() {
      const a = await regWrite('Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR', 'AppEnabled', '0')
      const b = await regWrite('System\\GameConfigStore', 'GameDVR_Enabled', '0')
      return a && b ? '已关闭 Game DVR 录制' : fail('部分注册表写入失败')
    }
  },
  {
    id: 'gamemode-on', title: '开启 Windows 游戏模式',
    desc: '游戏时系统优先调度 CPU/GPU，抑制后台任务',
    async check() { const v = await regRead('Software\\Microsoft\\GameBar', 'AutoGameModeEnabled'); return String(v) === '1' },
    async apply() { return (await regWrite('Software\\Microsoft\\GameBar', 'AutoGameModeEnabled', '1')) ? '已开启游戏模式' : fail('注册表写入失败') }
  },
  {
    id: 'power-plan', title: '电源计划切换为高性能',
    desc: '使用 Windows 内置高性能方案，防 CPU/GPU 降频掉帧',
    async check() { const a = await power.getActive(); return /高性能|high/i.test(a.name) },
    async apply() { const r = await power.ensureHighPerformance(); return '电源计划已切换：' + r.after.name }
  },
  {
    id: 'power-pcie', title: 'PCI Express 链接电源管理 = 关',
    desc: '关闭显卡 PCIe 省电，消除唤醒延迟卡顿（powercfg ASPM，交直流都设）',
    async check() { const r = await ps('powercfg /q SCHEME_CURRENT SUB_PCIEXPRESS ASPM'); return /0x00000000/.test(String(r)) },
    async apply() {
      await ps('powercfg /setacvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASPM 0')
      await ps('powercfg /setdcvalueindex SCHEME_CURRENT SUB_PCIEXPRESS ASPM 0')
      await ps('powercfg /setactive SCHEME_CURRENT')
      return '已关闭 PCIe 链路省电'
    }
  },
  {
    id: 'power-boost', title: '处理器性能提升模式 = 高效加速',
    desc: '睿频响应更快（自动解除隐藏设置；个别第三方电源方案不支持则跳过）',
    async check() { const r = await ps('powercfg /q SCHEME_CURRENT SUB_PROCESSOR be33d23b-0d72-419e-a9bb-b74a51fbf30d'); return String(r).indexOf('不存在') === -1 },
    async apply() {
      await ps('powercfg /attributes SUB_PROCESSOR be33d23b-0d72-419e-a9bb-b74a51fbf30d -ATTRIB_HIDE')
      const r = await ps('powercfg /setacvalueindex SCHEME_CURRENT SUB_PROCESSOR be33d23b-0d72-419e-a9bb-b74a51fbf30d 4')
      await ps('powercfg /setactive SCHEME_CURRENT')
      if (String(r).indexOf('不存在') !== -1) return { skipped: '当前电源方案不含该细项（已跳过，不影响其它项）' }
      return '已启用处理器高效加速模式（交流电）'
    }
  },
  {
    id: 'mouse-accel', title: '关闭“提高指针精确度”（鼠标加速）',
    desc: 'FPS 玩家标配：消除鼠标加速对肌肉记忆的干扰。改注册表并提示：新进程立即生效，个别情况注销一次更彻底',
    async check() {
      const r = await ps("powershell -NoProfile -ExecutionPolicy Bypass -File '" + path.join(ASSETS, 'mouse-off.ps1') + "'")
      return /^STATE 0 0 0/.test(String(r).trim())
    },
    async apply() {
      const r = await ps("powershell -NoProfile -ExecutionPolicy Bypass -File '" + path.join(ASSETS, 'mouse-off.ps1') + "' -Apply")
      return String(r).indexOf('MOUSE-OK') !== -1 ? '已关闭指针精确度（原值已备份，可一键恢复）' : fail('鼠标设置写入失败')
    }
  }
]
function fail(msg) { throw new Error(msg) }

async function sysList() {
  const out = []
  for (const t of SYS) {
    let done = null
    try { done = await t.check() } catch (e) { done = null }
    out.push({ id: t.id, title: t.title, desc: t.desc, done: done })
  }
  return out
}

async function sysApply(ids) {
  const results = []
  for (const id of ids) {
    const t = SYS.filter(function (x) { return x.id === id })[0]
    if (!t) { results.push({ id: id, ok: false, msg: '未知项目' }); continue }
    try {
      const msg = await t.apply()
      if (msg && msg.skipped) results.push({ id: id, ok: true, skipped: true, msg: msg.skipped })
      else results.push({ id: id, ok: true, msg: msg })
    } catch (e) {
      results.push({ id: id, ok: false, msg: String(e.message || e) })
    }
  }
  return results
}

async function mouseRestore() {
  const r = await ps("powershell -NoProfile -ExecutionPolicy Bypass -File '" + path.join(ASSETS, 'mouse-off.ps1') + "' -Restore")
  return String(r).indexOf('MOUSE-RESTORED') !== -1 ? { ok: true } : { ok: false, msg: String(r) }
}

/* ---------- 总编排：一键实施 ---------- */
async function applyAll(plan) {
  plan = plan || {}
  const out = { nv: null, sys: [], cfg: [] }
  if (plan.nvidia && plan.nvidia.length) {
    try { out.nv = await nvidiaApply(plan.nvidia) }
    catch (e) { out.nv = { ok: false, msg: String(e.message || e) } }
  }
  if (plan.sys && plan.sys.length) out.sys = await sysApply(plan.sys)
  if (plan.blocks && plan.blocks.length) {
    for (const b of plan.blocks) {
      try {
        const r = await cs2cfg.writeBlock(b.file || 'autoexec.cfg', b.tag || 'GAME', b.lines)
        out.cfg.push({ tag: b.tag, ok: true, file: r.file })
      } catch (e) { out.cfg.push({ tag: b.tag, ok: false, msg: String(e.message || e) }) }
    }
  }
  return out
}

module.exports = {
  NV_CATALOG, NV_PROFILE,
  nvidiaApply, nvidiaStatus, nvidiaRestore, nvidiaRemoveProfile,
  sysList, sysApply, mouseRestore, applyAll
}