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

/* 多源 DoH：污染主要由境内递归返回假 A 记录导致；Google/Cloudflare 用 IP 直连+正确 SNI
   往往仍可达，返回真实边缘 IP。全部源合并后再逐个 TLS 实测，authorized 为 true 的才进名单。 */
function httpsGetJson(opts, ms) {
  return new Promise(function (resolve, reject) {
    const req = https.get(Object.assign({ timeout: ms }, opts), function (res) {
      let data = ''
      res.on('data', function (c) { data += c })
      res.on('end', function () { try { resolve(JSON.parse(data)) } catch (e) { reject(e) } })
    })
    req.on('timeout', function () { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}
const DOH_SOURCES = [
  { hostname: 'dns.alidns.com', path: '/resolve?name=%N%&type=1' },
  { hostname: '8.8.8.8', servername: 'dns.google', headers: { host: 'dns.google' }, path: '/resolve?name=%N%&type=1' },
  { hostname: 'dns.google', path: '/resolve?name=%N%&type=1' },
  { hostname: '1.1.1.1', servername: 'cloudflare-dns.com', headers: { host: 'cloudflare-dns.com', Accept: 'application/dns-json' }, path: '/dns-query?name=%N%&type=1' },
  { hostname: '223.6.6.6', path: '/resolve?name=%N%&type=1' }
]
async function resolveDoH(name) {
  const all = []
  const seen = {}
  for (const src of DOH_SOURCES) {
    try {
      const j = await httpsGetJson({
        hostname: src.hostname,
        servername: src.servername,
        path: src.path.replace('%N%', name),
        headers: Object.assign({ 'User-Agent': 'cs2tuner' }, src.headers || {})
      }, 5000)
      const ips = (j.Answer || []).filter(function (a) { return a.type === 1 }).map(function (a) { return a.data })
      for (const ip of ips) { if (!seen[ip] && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) { seen[ip] = true; all.push(ip) } }
    } catch (e) {}
  }
  return all
}
/* 用 Node 原生 TLS 校验（证书链+域名）。Steam 正规 CDN 边缘必然通过；
   DNS 污染 IP / 中间设备伪装证书必然失败。authorized 握手成功 = 真接入点。 */
function tlsTest(host, ip, ms) {
  return new Promise(function (resolve) {
    const t0 = Date.now()
    let settled = false
    const s = tls.connect({ host: ip, port: 443, servername: host, timeout: ms, rejectUnauthorized: true }, function () {
      if (settled) return
      settled = true
      const ok = s.authorized === true
      try { s.destroy() } catch (e) {}
      resolve({ ip: ip, ms: Date.now() - t0, ok: ok })
    })
    s.on('error', function () { if (settled) return; settled = true; try { s.destroy() } catch (e) {}; resolve({ ip: ip, ms: Date.now() - t0, ok: false }) })
    s.on('timeout', function () { if (settled) return; settled = true; try { s.destroy() } catch (e) {}; resolve({ ip: ip, ok: false, ms: Date.now() - t0 }) })
  })
}

/* 探测各域名的可达 IP；good = 可达 IP 按延迟排序 */
async function probe() {
  const out = { domains: {}, probes: {}, elapsedMs: 0 }
  const t0 = Date.now()
  const goodPool = []
  const failedDomains = []
  for (const d of CORE_DOMAINS) {
    let ips = []
    try { ips = await resolveDoH(d) } catch (e) {}
    const results = []
    for (const ip of ips.slice(0, 8)) {
      const one = await tlsTest(d, ip, 3200)
      results.push(one)
      if (one.ok && one.ms < 700) break
    }
    const good = results.filter(function (r) { return r.ok }).sort(function (a, b) { return a.ms - b.ms })
    out.probes[d] = results
    if (good.length) {
      out.domains[d] = good.map(function (g) { return g.ip })
      good.map(function (g) { return g.ip }).forEach(function (ip) { if (goodPool.indexOf(ip) === -1) goodPool.push(ip) })
    } else failedDomains.push(d)
  }
  /* 借道：被 DNS 污染的域名（如 steamcommunity）拿其他 Steam 域名的可达边缘 IP 以自身 SNI 重试
     —— Akamai 等 CDN 边缘节点按 SNI 分流，只要证书对得上就是真接入 */
  if (failedDomains.length && goodPool.length) {
    const pool = goodPool.slice(0, 10)
    for (const d of failedDomains) {
      for (const ip of pool) {
        const r = await tlsTest(d, ip, 3000)
        out.probes[d].push(Object.assign({ borrowed: true }, r))
        if (r.ok) {
          out.domains[d] = out.domains[d] || []
          if (out.domains[d].indexOf(ip) === -1) out.domains[d].push(ip)
          break
        }
      }
      if (out.domains[d]) failedDomains.splice(failedDomains.indexOf(d), 1)
    }
  }
  out.elapsedMs = Date.now() - t0
  out.unreachable = failedDomains
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
  const stale = (function () { try { return Date.now() - fs.statSync(F.probeCache()).mtimeMs > 30 * 60 * 1000 } catch (e) { return true } })()
  if (!cached || !Object.keys(cached.domains || {}).length || stale || !cached.domains['steamcommunity.com']) {
    cached = await probe()
  }
  const domains = cached.domains || {}
  const keys = Object.keys(domains)
  if (!keys.length) {
    throw new Error('未探测到任何可达的 Steam 接入 IP。可能原因：运营商临时阻断加剧（可切换手机热点后开启一次，之后再切回常用网络）、或代理软件冲突。可稍后重试“检测接入点”。')
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