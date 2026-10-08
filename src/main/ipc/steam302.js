'use strict'
/* Steam 访问辅助：探测可达接入 IP（DoH + TLS 握手）→ 提权启动本地 SNI 中转 + hosts 注入 */
const fs = require('fs')
const path = require('path')
const tls = require('tls')
const https = require('https')
const { spawn } = require('child_process')
const { app } = require('electron')
const { ps } = require('./powershell')

const CORE_DOMAINS = ['steamcommunity.com', 'www.steamcommunity.com', 'help.steampowered.com', 'store.steampowered.com', 'api.steampowered.com']
const HOSTS_FILE = 'C:\\Windows\\System32\\drivers\\etc\\hosts'
const BLOCK = { begin: '# === CS2-Optimizer Steam302 BEGIN ===', end: '# === CS2-Optimizer Steam302 END ===' }

const F = {
  cfg: function () { return path.join(app.getPath('userData'), 'steam302-config.json') },
  status: function () { return path.join(app.getPath('userData'), 'steam302-status.json') },
  log: function () { return path.join(app.getPath('userData'), 'steam302.log') },
  backup: function () { return path.join(app.getPath('userData'), 'hosts.steam302.backup') },
  probeCache: function () { return path.join(app.getPath('userData'), 'steam302-probe.json') }
}
function serverPath() { return path.join(__dirname, '..', 'assets', 'steam302-server.js') }

function httpsGet(url, ms) {
  return new Promise(function (resolve, reject) {
    const req = https.get(url, { timeout: ms }, function (res) {
      let data = ''
      res.on('data', function (c) { data += c })
      res.on('end', function () { resolve(data) })
    })
    req.on('timeout', function () { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}
async function resolveDoH(name) {
  const urls = [
    'https://dns.alidns.com/resolve?name=' + name + '&type=1',
    'https://223.6.6.6/resolve?name=' + name + '&type=1'
  ]
  for (const u of urls) {
    try {
      const j = JSON.parse(await httpsGet(u, 5000))
      const ips = (j.Answer || []).filter(function (a) { return a.type === 1 }).map(function (a) { return a.data })
      if (ips.length) return ips
    } catch (e) {}
  }
  return []
}
function tlsTest(host, ip, ms) {
  return new Promise(function (resolve) {
    const t0 = Date.now()
    let settled = false
    const s = tls.connect({ host: ip, port: 443, servername: host, timeout: ms, rejectUnauthorized: false }, function () {
      if (settled) return
      settled = true
      try { s.destroy() } catch (e) {}
      resolve({ ip: ip, ms: Date.now() - t0, ok: true })
    })
    s.on('error', function () { if (settled) return; settled = true; try { s.destroy() } catch (e) {}; resolve({ ip: ip, ms: Date.now() - t0, ok: false }) })
    s.on('timeout', function () { if (settled) return; settled = true; try { s.destroy() } catch (e) {}; resolve({ ip: ip, ok: false, ms: Date.now() - t0 }) })
  })
}

/* 探测各域名的可达 IP；good = 可达 IP 按延迟排序 */
async function probe() {
  const out = { domains: {}, probes: {}, elapsedMs: 0 }
  const t0 = Date.now()
  for (const d of CORE_DOMAINS) {
    let ips = []
    try { ips = await resolveDoH(d) } catch (e) {}
    const results = []
    for (const ip of ips.slice(0, 6)) {
      const one = await tlsTest(d, ip, 3200)
      results.push(one)
      if (one.ok && one.ms < 800) break
    }
    const good = results.filter(function (r) { return r.ok }).sort(function (a, b) { return a.ms - b.ms })
    out.probes[d] = results
    if (good.length) out.domains[d] = good.map(function (g) { return g.ip })
  }
  out.elapsedMs = Date.now() - t0
  try { fs.writeFileSync(F.probeCache(), JSON.stringify(out), 'utf8') } catch (e) {}
  return out
}

function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }

function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (e) { return e && e.code === 'EPERM' }
}
function hostsHasBlock() {
  try { return fs.readFileSync(HOSTS_FILE, 'utf8').indexOf(BLOCK.begin) !== -1 } catch (e) { return false }
}
async function isAdmin() {
  const r = await ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
  return String(r).trim().toLowerCase() === 'true'
}

function status() {
  const st = readJsonSafe(F.status()) || {}
  const running = !!(st.running && pidAlive(st.pid))
  return {
    running: running,
    hostsInjected: hostsHasBlock(),
    pid: running ? st.pid : null,
    startedAt: running ? st.startedAt : null,
    requests: st.requests || 0,
    domains: st.domains || Object.keys((readJsonSafe(F.cfg()) || {}).domains || {}),
    error: st.error || null,
    logTail: (function () { try { const l = fs.readFileSync(F.log(), 'utf8').split(/\r?\n/); return l.slice(-6).join('\n') } catch (e) { return '' } })()
  }
}

async function runElevated(extraArgs) {
  const exe = process.execPath
  const srv = serverPath()
  const cfg = F.cfg()
  const inner = '/c set "ELECTRON_RUN_AS_NODE=1"&& "' + exe + '" "' + srv + '" --config "' + cfg + '"' + extraArgs + ' >> "' + F.log() + '" 2>&1'
  if (await isAdmin()) {
    const child = spawn(exe, [srv, '--config', cfg].concat(extraArgs ? extraArgs.trim().split(/\s+/) : []), {
      detached: true, stdio: 'ignore', windowsHide: true,
      env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' })
    })
    child.unref()
    return { via: 'direct' }
  }
  const cmd = "Start-Process -FilePath cmd.exe -WindowStyle Hidden -Verb RunAs -ArgumentList '" + inner.replace(/'/g, "''") + "'"
  await ps(cmd)
  return { via: 'uac' }
}

async function enable() {
  const existing = status()
  let cached = readJsonSafe(F.probeCache())
  if (!cached || !Object.keys(cached.domains || {}).length || (Date.now() - fs.statSync(F.probeCache()).mtimeMs) > 30 * 60 * 1000) {
    cached = await probe()
  }
  const domains = cached.domains || {}
  const keys = Object.keys(domains)
  if (!keys.length) {
    throw new Error('未探测到任何可达的 Steam 接入 IP（当前网络可能对 Steam 全线阻断）。请稍后重试“检测接入点”。')
  }
  const cfg = {
    domains: domains,
    hosts: keys,
    hostsFile: HOSTS_FILE,
    backupFile: F.backup(),
    statusFile: F.status(),
    logFile: F.log(),
    block: BLOCK
  }
  fs.writeFileSync(F.cfg(), JSON.stringify(cfg), 'utf8')
  const r = await runElevated('')
  for (let i = 0; i < 20; i++) {
    await new Promise(function (res) { setTimeout(res, 700) })
    const s = status()
    if (s.running) return Object.assign({ startedVia: r.via, domains: keys }, s)
  }
  const s2 = status()
  return Object.assign({ startedVia: r.via, domains: keys, note: '等待中转进程超时（可能 UAC 被取消），可再次点击' }, s2)
}

async function disable() {
  await runElevated(' --mode stop')
  for (let i = 0; i < 15; i++) {
    await new Promise(function (res) { setTimeout(res, 600) })
    if (!status().running && !hostsHasBlock()) return { running: false, hostsInjected: false }
  }
  return status()
}

module.exports = { probe, status, enable, disable, isAdmin, CORE_DOMAINS }
