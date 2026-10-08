'use strict'
/* Steam 访问辅助（主进程侧）：探测接入点、启停本地中转、hosts 自愈 */
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

/* 全部运行时文件放在纯 ASCII 目录：避免提权 cmd/服务进程因中文路径出问题 */
function runtimeDir() {
  const base = process.env.LOCALAPPDATA || app.getPath('temp')
  const dir = path.join(base, 'cs2tuner-302')
  try { fs.mkdirSync(dir, { recursive: true }) } catch (e) {}
  return dir
}
const F = {
  dir: function () { return runtimeDir() },
  cfg: function () { return path.join(runtimeDir(), 'config.json') },
  status: function () { return path.join(runtimeDir(), 'status.json') },
  log: function () { return path.join(runtimeDir(), 'relay.log') },
  bootLog: function () { return path.join(runtimeDir(), 'boot.log') },
  backup: function () { return path.join(runtimeDir(), 'hosts.backup') },
  probeCache: function () { return path.join(runtimeDir(), 'probe.json') },
  goodIps: function () { return path.join(runtimeDir(), 'good-ips.json') }
}
function serverPath() { return path.join(__dirname, '..', 'assets', 'steam302-server.js') }
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return null } }

/* 自定义上游：某些域名（尤其 steamcommunity.com）被 SNI 封锁时，可用自建/可信镜像域名做上游。
   连接时仍用目标域名作为 SNI，证书必须校验通过（不做中间人），镜像需具备该域名的合法证书。 */
function customUpstreams() {
  const j = readJsonSafe(path.join(runtimeDir(), 'custom-upstream.json'))
  return (j && typeof j === 'object') ? j : {}
}
function setCustomUpstream(domain, host) {
  const all = customUpstreams()
  if (host) all[domain] = String(host).trim(); else delete all[domain]
  fs.writeFileSync(path.join(runtimeDir(), 'custom-upstream.json'), JSON.stringify(all, null, 1), 'utf8')
  return all
}
/* 系统代理检测：若用户已挂代理/VPN，社区类域名应交给代理，工具不插手 */
async function proxyStatus() {
  try {
    const r = await ps("$p = Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings' -ErrorAction SilentlyContinue; Write-Output ($p.ProxyEnable.ToString() + '|' + $p.ProxyServer)")
    const parts = String(r).trim().split('|')
    const on = parts[0] === '1'
    return { enabled: on, server: (parts[1] || '').trim() }
  } catch (e) { return { enabled: false, server: '' } }
}

/* 历史可用 IP（每个域名保留最近验证通过的 8 个）——DoH 被污染时的救命稻草 */
function loadGoodIps() {
  const j = readJsonSafe(F.goodIps())
  return (j && typeof j === 'object') ? j : {}
}
function saveGoodIp(domain, ip) {
  try {
    const all = loadGoodIps()
    const list = Array.isArray(all[domain]) ? all[domain] : []
    if (list.indexOf(ip) === -1) list.unshift(ip)
    all[domain] = list.slice(0, 8)
    all['_updated'] = new Date().toISOString()
    fs.writeFileSync(F.goodIps(), JSON.stringify(all, null, 1), 'utf8')
  } catch (e) {}
}
function log(m) { try { fs.appendFileSync(F.bootLog(), '[' + new Date().toISOString() + '] ' + m + '\r\n') } catch (e) {} }

/* ---------- DoH + TLS 实测 ---------- */
const DOH = [
  { hostname: '8.8.8.8', servername: 'dns.google', headers: { host: 'dns.google' }, path: '/resolve?name=%N%&type=1' },
  { hostname: '1.1.1.1', servername: 'cloudflare-dns.com', headers: { host: 'cloudflare-dns.com', Accept: 'application/dns-json' }, path: '/dns-query?name=%N%&type=1' },
  { hostname: 'dns.google', path: '/resolve?name=%N%&type=1' },
  { hostname: 'dns.alidns.com', path: '/resolve?name=%N%&type=1' },
  { hostname: '223.6.6.6', path: '/resolve?name=%N%&type=1' }
]
function dohJson(o, ms) {
  return new Promise(function (resolve, reject) {
    const req = https.get(Object.assign({ timeout: ms || 4000 }, o), function (res) {
      let d = ''
      res.on('data', function (c) { d += c })
      res.on('end', function () { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('timeout', function () { req.destroy(new Error('timeout')) })
    req.on('error', reject)
  })
}
/* 已知的 DNS 污染段（Facebook / Twitter / Dropbox 等，绝不可能是 Steam 边缘） */
const POISON_PREFIX = ['31.13.', '66.220.148.', '69.171.', '69.63.', '157.240.', '199.59.', '128.242.', '108.160.', '162.125.', '199.16.', '185.60.', '179.60.', '45.64.', '103.4.']
function isPoison(ip) { return POISON_PREFIX.some(function (p) { return ip.indexOf(p) === 0 }) }

async function resolveAll(name) {
  const reqs = DOH.map(function (src) {
    return dohJson({
      hostname: src.hostname, servername: src.servername,
      path: src.path.replace('%N%', name),
      headers: Object.assign({ 'User-Agent': 'cs2tuner' }, src.headers || {})
    }, 4000).then(function (j) {
      return (j.Answer || []).filter(function (a) { return a.type === 1 && /^\d+\.\d+\.\d+\.\d+$/.test(a.data) }).map(function (a) { return a.data })
    }).catch(function () { return [] })
  })
  const lists = await Promise.all(reqs)
  const clean = [], poison = []
  const seen = {}
  lists.forEach(function (ips) {
    ips.forEach(function (ip) {
      if (seen[ip]) return
      seen[ip] = 1
      if (isPoison(ip)) poison.push(ip)
      else clean.push(ip)
    })
  })
  clean.poisonSeen = poison.length
  return clean
}
/* 并发池：限制同时进行 TLS 实测的数量 */
async function poolMap(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async function () {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}
function tlsProbe(host, ip, ms) {
  return new Promise(function (resolve) {
    const t0 = Date.now()
    let done = false
    const s = tls.connect({ host: ip, port: 443, servername: host, timeout: ms || 3000, rejectUnauthorized: true }, function () {
      if (done) return; done = true
      const ok = s.authorized === true
      try { s.destroy() } catch (e) {}
      resolve({ ip: ip, ok: ok, ms: Date.now() - t0 })
    })
    s.on('error', function () { if (!done) { done = true; resolve({ ip: ip, ok: false, ms: Date.now() - t0 }) } })
    s.on('timeout', function () { if (!done) { done = true; try { s.destroy() } catch (e) {}; resolve({ ip: ip, ok: false, ms: Date.now() - t0 }) } })
  })
}

async function probe() {
  const t0 = Date.now()
  const custom = customUpstreams()
  const out = { domains: {}, probes: {}, notCovered: [], elapsedMs: 0 }
  /* 1) 并行解析全部域名 */
  const resolved = await Promise.all(CORE_DOMAINS.map(function (d) { return resolveAll(d) }))
  /* 2) 每个域名并发实测候选 IP（最多 6 个，2.5s 超时） */
  const good = loadGoodIps()
  /* 自定义上游域名先解析成 IP，加入候选（SNI 仍为目标域名） */
  const customIps = {}
  for (const d of CORE_DOMAINS) {
    if (!custom[d]) continue
    const ips = await resolveAll(custom[d])
    if (ips.length) customIps[d] = ips.slice(0, 4)
  }
  const perDomain = await Promise.all(CORE_DOMAINS.map(async function (d, i) {
    const fresh = (resolved[i] || []).filter(function (ip) { return !isPoison(ip) })
    const hist = Array.isArray(good[d]) ? good[d] : []
    const merged = []
    hist.concat(fresh).concat(customIps[d] || []).forEach(function (ip) { if (merged.indexOf(ip) === -1) merged.push(ip) })
    const rs = await poolMap(merged.slice(0, 10), 6, function (ip) { return tlsProbe(d, ip, 2500) })
    ;(customIps[d] || []).forEach(function (ip) {
      const hit = rs.filter(function (r) { return r.ip === ip })[0]
      if (hit) hit.custom = true
    })
    return rs
  }))
  const pool = []
  const failed = []
  CORE_DOMAINS.forEach(function (d, i) {
    const results = perDomain[i] || []
    out.probes[d] = results
    const good = results.filter(function (r) { return r.ok }).sort(function (a, b) { return a.ms - b.ms }).map(function (r) { return r.ip })
    if (good.length) { out.domains[d] = good; good.forEach(function (ip) { if (pool.indexOf(ip) === -1) pool.push(ip); saveGoodIp(d, ip) }) }
    else failed.push(d)
  })
  /* 3) 借道：用已验证可用的边缘 IP 配目标域名 SNI 再试（证书必须通过） */
  if (failed.length && pool.length) {
    const hist = loadGoodIps()
    const cand = pool.slice(0, 8).concat(failed.reduce(function (acc, d) { return acc.concat(Array.isArray(hist[d]) ? hist[d] : []) }, [])).filter(function (ip, i, arr) { return arr.indexOf(ip) === i }).slice(0, 12)
    const borrowed = await poolMap(failed, 4, async function (d) {
      const rs = await poolMap(cand, 4, function (ip) { return tlsProbe(d, ip, 2200) })
      rs.forEach(function (r) { out.probes[d].push(Object.assign({ borrowed: true }, r)) })
      const hit = rs.filter(function (r) { return r.ok }).sort(function (a, b) { return a.ms - b.ms })[0]
      return { d: d, ip: hit ? hit.ip : null }
    })
    borrowed.forEach(function (b) {
      if (b.ip) { out.domains[b.d] = [b.ip]; saveGoodIp(b.d, b.ip) }
      else out.notCovered.push(b.d)
    })
  }
  /* 诊断：区分「只有污染解析」「全部被阻断（疑似 SNI 封锁）」「无解析结果」 */
  out.diagnosis = {}
  CORE_DOMAINS.forEach(function (d, i) {
    const rs = out.probes[d] || []
    const own = rs.filter(function (r) { return !r.borrowed })
    const fresh = (resolved[i] || [])
    const cleanCount = fresh.filter(function (ip) { return !isPoison(ip) }).length
    if (out.domains[d]) { out.diagnosis[d] = 'ok'; return }
    if (fresh.length && cleanCount === 0) out.diagnosis[d] = 'poison-only'
    else if (!fresh.length) out.diagnosis[d] = 'no-dns'
    else out.diagnosis[d] = 'blocked'
  })
  out.proxy = await proxyStatus()
  out.elapsedMs = Date.now() - t0
  try { fs.writeFileSync(F.probeCache(), JSON.stringify(out), 'utf8') } catch (e) {}
  return out
}

/* ---------- hosts ---------- */
function hostsHasBlock() {
  try { return fs.readFileSync(HOSTS_FILE, 'utf8').indexOf(BLOCK.begin) !== -1 } catch (e) { return false }
}
function pidAlive(pid) {
  if (!pid) return false
  try { process.kill(pid, 0); return true } catch (e) { return e && e.code === 'EPERM' }
}
async function isAdmin() {
  try {
    const r = await ps("([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)")
    return String(r).trim().toLowerCase() === 'true'
  } catch (e) { return false }
}

function status() {
  const st = readJsonSafe(F.status()) || {}
  const running = !!(st.running && pidAlive(st.pid))
  const covered = (st.covered || []).slice()
  const notCovered = (st.notCovered || []).slice()
  return {
    running: running,
    hostsInjected: hostsHasBlock(),
    pid: running ? st.pid : null,
    startedAt: running ? st.startedAt : null,
    domains: st.domains || [],
    covered: covered,
    notCovered: notCovered,
    stats: st.stats || { requests: 0, ok: 0, fail: 0, lastOk: null, lastFail: null },
    error: st.error || null,
    dir: F.dir(),
    logTail: (function () { try { return fs.readFileSync(F.log(), 'utf8').split(/\r?\n/).slice(-8).join('\n') } catch (e) { return '' } })()
  }
}

async function runElevated(extraArgs) {
  const exe = process.execPath
  const srv = serverPath()
  const cfgPath = F.cfg()
  const boot = F.bootLog()
  if (await isAdmin()) {
    const args = [srv, '--config', cfgPath, '--bootlog', boot].concat(extraArgs || [])
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }) })
    child.unref()
    return { via: 'direct' }
  }
  const inner = '/c set "ELECTRON_RUN_AS_NODE=1"&& "' + exe + '" "' + srv + '" --config "' + cfgPath + '" --bootlog "' + boot + '"' + (extraArgs && extraArgs.length ? ' ' + extraArgs.join(' ') : '')
  const cmd = "Start-Process -FilePath cmd.exe -WindowStyle Hidden -Verb RunAs -ArgumentList '" + inner.replace(/'/g, "''") + "'"
  await ps(cmd)
  return { via: 'uac' }
}

/* 启动时自愈：hosts 有块但中转没跑 → 清理（避免用户断网） */
async function healOnStart() {
  try {
    const st = status()
    if (st.hostsInjected && !st.running) {
      log('heal: hosts injected but relay dead -> cleaning')
      await runElevated(['--mode', 'stop'])
      return { healed: true }
    }
  } catch (e) { log('heal error ' + e.message) }
  return { healed: false }
}

async function enable() {
  const pr = await probe()
  const domains = pr.domains || {}
  const keys = Object.keys(domains)
  /* 系统代理检测（先做，后面判断与 config 都要用）：被 SNI 封锁的域名走代理隧道才可能通 */
  const px = await proxyStatus()
  let proxy = null
  if (px.enabled && px.server) {
    const first = px.server.split(';')[0].trim()
    const host = first.split(':')[0].trim()
    const portStr = first.split(':')[1]
    const port = parseInt(portStr || '0', 10)
    if (host && port) proxy = { host: host, port: port }
  }
  if (!keys.length && !proxy) {
    throw new Error('当前网络下没能找到可用的 Steam 接入 IP，且未检测到系统代理。社区类域名被 SNI 封锁时需要代理或镜像才能访问。')
  }
  if (proxy) {
    (pr.notCovered || []).forEach(function (d) {
      if (keys.indexOf(d) === -1) keys.push(d)      /* 加入 hosts：由代理隧道访问 */
      if (!domains[d]) domains[d] = []               /* 无直连候选，仅靠代理 */
    })
  }
  const cfg = {
    domains: domains,
    hosts: keys,
    proxy: proxy,
    hostsFile: HOSTS_FILE,
    backupFile: F.backup(),
    statusFile: F.status(),
    logFile: F.log(),
    goodIpsFile: F.goodIps(),
    block: BLOCK
  }
  fs.writeFileSync(F.cfg(), JSON.stringify(cfg), 'utf8')
  log('enable: injecting ' + keys.join(', ') + ' | notCovered: ' + (pr.notCovered || []).join(', '))
  try { fs.unlinkSync(F.status()) } catch (e) {}
  const r = await runElevated([])
  /* 等待中转就绪（带候选刷新，最多 40 秒） */
  for (let i = 0; i < 40; i++) {
    await new Promise(function (res) { setTimeout(res, 1000) })
    const s = status()
    if (s.running && (s.covered || []).length) {
      return Object.assign({ startedVia: r.via, domains: keys, notCovered: pr.notCovered || [] }, s)
    }
    if (s.error) {
      /* 端口占用等硬错误 → 立刻回滚，避免断网 */
      log('enable failed: ' + s.error + ' -> rollback')
      await runElevated(['--mode', 'stop'])
      throw new Error(s.error)
    }
  }
  /* 超时：如果中转没起来，回滚 hosts，防止用户断网 */
  const s2 = status()
  if (!s2.running) {
    log('enable timeout, relay not running -> rollback')
    await runElevated(['--mode', 'stop'])
    throw new Error('中转进程未能启动（可能 UAC 被取消）。已自动还原 hosts，网络不受影响。')
  }
  return Object.assign({ startedVia: r.via, domains: keys, notCovered: pr.notCovered || [], note: '中转已启动但候选 IP 仍在刷新中' }, s2)
}

async function disable() {
  await runElevated(['--mode', 'stop'])
  for (let i = 0; i < 20; i++) {
    await new Promise(function (res) { setTimeout(res, 600) })
    const s = status()
    if (!s.running && !s.hostsInjected) return { running: false, hostsInjected: false }
    /* 进程已死但 hosts 还在 → 再补一次清理 */
    if (!s.running && s.hostsInjected && i === 10) await runElevated(['--mode', 'stop'])
  }
  return status()
}

module.exports = { probe, status, enable, disable, isAdmin, healOnStart, CORE_DOMAINS, customUpstreams, setCustomUpstream, proxyStatus }