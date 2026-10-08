'use strict'
/* CS2 优化助手 · Steam 访问辅助 中转服务
   特性：
   - 请求级候选 IP 校验：每次连接按顺序试候选，单个 2.5s 超时，全部失败快速断开（不吊死浏览器）
   - 定期自刷新：每 5 分钟用多源 DoH 重新解析 + TLS 实测，更新内存候选表（不依赖主程序常驻）
   - 全程不终止 TLS（纯 TCP 转发，证书由 Steam 侧原样透传）
   - UTF-8/ASCII 双写日志，便于排障
*/
const net = require('net')
const tls = require('tls')
const https = require('https')
const fs = require('fs')
const { execSync } = require('child_process')

const argv = process.argv.slice(2)
function opt(name) { const i = argv.indexOf(name); return (i >= 0 && i + 1 < argv.length) ? argv[i + 1] : null }
const CFG_PATH = opt('--config')
const MODE = opt('--mode') || 'start'
const BOOT_LOG = opt('--bootlog') || null

function bootLog(m) {
  if (!BOOT_LOG) return
  try { fs.appendFileSync(BOOT_LOG, '[' + new Date().toISOString() + '] ' + m + '\r\n') } catch (e) {}
}
if (!CFG_PATH) { bootLog('FATAL no --config'); process.exit(2) }
let cfg
try { cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8')) } catch (e) { bootLog('FATAL read cfg: ' + e.message); process.exit(3) }
bootLog('starting mode=' + MODE + ' cfg=' + CFG_PATH)

function log(m) { try { fs.appendFileSync(cfg.logFile, '[' + new Date().toISOString() + '] ' + m + '\r\n') } catch (e) {} }
function writeFileAtomic(f, s) { const t = f + '.tmp'; try { fs.writeFileSync(t, s); fs.renameSync(t, f) } catch (e) { try { fs.writeFileSync(f, s) } catch (e2) {} } }
function writeStatus(o) { try { writeFileAtomic(cfg.statusFile, JSON.stringify(o)) } catch (e) {} }

const STARTED_AT = new Date().toISOString()
const stats = { requests: 0, ok: 0, fail: 0, lastOk: null, lastFail: null }

/* ---------- 卸载模式 ---------- */
if (MODE === 'stop') {
  try {
    const st = JSON.parse(fs.readFileSync(cfg.statusFile, 'utf8'))
    if (st && st.pid) { try { process.kill(st.pid); log('killed pid ' + st.pid) } catch (e) {} }
  } catch (e) {}
  try {
    const h = fs.readFileSync(cfg.hostsFile, 'utf8')
    const i = h.indexOf(cfg.block.begin)
    const j = h.indexOf(cfg.block.end)
    if (i >= 0 && j > i) {
      let out = h.slice(0, i) + h.slice(j + cfg.block.end.length)
      out = out.replace(/(\r?\n){3,}/g, '\r\n\r\n')
      writeFileAtomic(cfg.hostsFile, out)
      log('hosts block removed')
      bootLog('hosts cleaned')
    }
  } catch (err) { log('hosts restore fail ' + err.message); bootLog('hosts restore fail ' + err.message) }
  try { execSync('ipconfig /flushdns', { windowsHide: true }) } catch (e) {}
  writeStatus({ running: false, stoppedAt: new Date().toISOString() })
  bootLog('stopped')
  process.exit(0)
}

/* ---------- hosts 注入 ---------- */
function installHosts() {
  const h = fs.readFileSync(cfg.hostsFile, 'utf8')
  if (!fs.existsSync(cfg.backupFile)) fs.copyFileSync(cfg.hostsFile, cfg.backupFile)
  const lines = (cfg.hosts || []).map(function (d) { return '127.0.0.1\t' + d })
  const block = cfg.block.begin + '\r\n' + lines.join('\r\n') + '\r\n' + cfg.block.end + '\r\n'
  const i = h.indexOf(cfg.block.begin)
  const j = h.indexOf(cfg.block.end)
  let out
  if (i >= 0 && j > i) out = h.slice(0, i) + block + h.slice(j + cfg.block.end.length)
  else out = (h.endsWith('\n') ? h : h + '\r\n') + '\r\n' + block
  writeFileAtomic(cfg.hostsFile, out)
  log('hosts injected: ' + lines.join(', '))
}

/* ---------- SNI / Host 解析 ---------- */
function parseSNI(buf) {
  try {
    if (buf.length < 6 || buf[0] !== 0x16) return null
    let p = 5
    if (buf[p] !== 0x01) return null
    p += 4
    p += 2 + 32
    const sid = buf[p]; p += 1 + sid
    const cs = (buf[p] << 8) | buf[p + 1]; p += 2 + cs
    const comp = buf[p]; p += 1 + comp
    const extTotal = (buf[p] << 8) | buf[p + 1]; p += 2
    const extEnd = p + extTotal
    while (p + 4 <= extEnd && p + 4 <= buf.length) {
      const type = (buf[p] << 8) | buf[p + 1]
      const len = (buf[p + 2] << 8) | buf[p + 3]
      p += 4
      if (type === 0) {
        let q = p + 2
        const sniEnd = p + len
        while (q + 3 <= sniEnd) {
          const nt = buf[q]
          const nl = (buf[q + 1] << 8) | buf[q + 2]
          if (nt === 0) return buf.slice(q + 3, q + 3 + nl).toString('ascii').toLowerCase()
          q += 3 + nl
        }
      }
      p += len
    }
  } catch (e) {}
  return null
}
function parseHTTPHost(buf) {
  try {
    const s = buf.toString('latin1', 0, Math.min(buf.length, 8192))
    const m = s.match(/^Host:\s*([^\r\n]+)/im)
    return m ? m[1].trim().toLowerCase() : null
  } catch (e) { return null }
}

/* ---------- 多源 DoH + TLS 实测（自刷新用） ---------- */
const DOH = [
  { hostname: '8.8.8.8', servername: 'dns.google', headers: { host: 'dns.google' }, path: '/resolve?name=%N%&type=1' },
  { hostname: '1.1.1.1', servername: 'cloudflare-dns.com', headers: { host: 'cloudflare-dns.com', Accept: 'application/dns-json' }, path: '/dns-query?name=%N%&type=1' },
  { hostname: 'dns.google', path: '/resolve?name=%N%&type=1' },
  { hostname: 'dns.alidns.com', path: '/resolve?name=%N%&type=1' },
  { hostname: '223.6.6.6', path: '/resolve?name=%N%&type=1' }
]
function dohJson(o, ms) {
  return new Promise(function (resolve, reject) {
    const req = https.get(Object.assign({ timeout: ms || 4500 }, o), function (res) {
      let d = ''
      res.on('data', function (c) { d += c })
      res.on('end', function () { try { resolve(JSON.parse(d)) } catch (e) { reject(e) } })
    })
    req.on('timeout', function () { req.destroy(new Error('to')) })
    req.on('error', reject)
  })
}
async function resolveAll(name) {
  const out = []
  const seen = {}
  for (const s of DOH) {
    try {
      const j = await dohJson({ hostname: s.hostname, servername: s.servername, path: s.path.replace('%N%', name), headers: Object.assign({ 'User-Agent': 'cs2tuner' }, s.headers || {}) })
      ;(j.Answer || []).filter(function (a) { return a.type === 1 }).forEach(function (a) {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(a.data) && !seen[a.data]) { seen[a.data] = 1; out.push(a.data) }
      })
    } catch (e) {}
  }
  return out
}
function tlsProbe(host, ip, ms) {
  return new Promise(function (resolve) {
    let done = false
    const s = tls.connect({ host: ip, port: 443, servername: host, timeout: ms || 3000, rejectUnauthorized: true }, function () {
      if (done) return; done = true
      const ok = s.authorized === true
      try { s.destroy() } catch (e) {}
      resolve(ok)
    })
    s.on('error', function () { if (!done) { done = true; resolve(false) } })
    s.on('timeout', function () { if (!done) { done = true; try { s.destroy() } catch (e) {}; resolve(false) } })
  })
}

/* 候选表：domain -> [ip...]，由 refreshAll 定期重建 */
/* 立即用 config 候选填充，保证刷新完成前就能转发 */
let CAND = {}
Object.keys(cfg.domains || {}).forEach(function (d) { if ((cfg.domains[d] || []).length) CAND[d] = cfg.domains[d].slice() })
const GOOD_FILE = cfg.goodIpsFile || null
function loadGood() { try { return JSON.parse(fs.readFileSync(GOOD_FILE, 'utf8')) } catch (e) { return {} } }
function saveGood(domain, ip) {
  if (!GOOD_FILE) return
  try {
    const all = loadGood()
    const list = Array.isArray(all[domain]) ? all[domain] : []
    if (list.indexOf(ip) === -1) list.unshift(ip)
    all[domain] = list.slice(0, 8)
    fs.writeFileSync(GOOD_FILE, JSON.stringify(all, null, 1), 'utf8')
  } catch (e) {}
}
const POISON = ['31.13.', '66.220.148.', '69.171.', '69.63.', '157.240.', '199.59.', '128.242.', '108.160.', '162.125.', '199.16.', '185.60.', '179.60.', '45.64.', '103.4.']
function isPoison(ip) { return POISON.some(function (p) { return ip.indexOf(p) === 0 }) }
const DOMAINS = Object.keys(cfg.domains || {})
async function refreshAll(reason) {
  /* 基线：始终保留主程序写进 config 的候选 IP（自刷新失败时不能让服务失效） */
  const next = {}
  Object.keys(cfg.domains || {}).forEach(function (d) {
    const ips = (cfg.domains[d] || []).slice()
    if (ips.length) next[d] = ips
  })
  const pool = []
  const hist = loadGood()
  Object.keys(next).forEach(function (d) { (next[d] || []).forEach(function (ip) { if (pool.indexOf(ip) === -1) pool.push(ip) }) })
  for (const d of DOMAINS) {
    const resolved = (await resolveAll(d)).filter(function (ip) { return !isPoison(ip) })
    const merged = []
    ;(Array.isArray(hist[d]) ? hist[d] : []).concat(resolved).forEach(function (ip) { if (merged.indexOf(ip) === -1) merged.push(ip) })
    const good = []
    await Promise.all(merged.slice(0, 10).map(async function (ip) {
      if (await tlsProbe(d, ip, 2800)) good.push(ip)
    }))
    if (good.length) {
      const base = next[d] || []
      const merged2 = good.concat(base.filter(function (ip) { return good.indexOf(ip) === -1 }))
      next[d] = merged2
      good.forEach(function (ip) { if (pool.indexOf(ip) === -1) pool.push(ip); saveGood(d, ip) })
    }
  }
  /* 借道：不可达域名用其它域名的可用边缘 IP（SNI 分流，证书校验必须通过） */
  for (const d of DOMAINS) {
    if (next[d]) continue
    for (const ip of pool.slice(0, 10)) {
      if (await tlsProbe(d, ip, 2500)) { next[d] = [ip]; saveGood(d, ip); break }
    }
  }
  const covered = Object.keys(next)
  CAND = next
  log('refresh(' + reason + '): covered ' + covered.length + '/' + DOMAINS.length + ' -> ' + JSON.stringify(next))
  writeStatus({
    running: true, pid: process.pid, startedAt: STARTED_AT,
    domains: DOMAINS, covered: covered, notCovered: DOMAINS.filter(function (d) { return !next[d] }),
    cand: next, stats: stats
  })
}
function findUpstream(host) {
  if (CAND[host] && CAND[host].length) return CAND[host]
  const keys = Object.keys(CAND)
  for (const k of keys) { if (host === k || host.endsWith('.' + k)) return CAND[k] }
  return null
}

/* ---------- 通过系统代理（HTTP CONNECT）建立隧道：客户端证书校验仍端到端，代理只看得到主机名 ---------- */
function connectViaProxy(targetHost, targetPort, cb) {
  const px = cfg.proxy
  const sock = net.connect({ host: px.host, port: px.port })
  let settled = false
  let buf = Buffer.alloc(0)
  const done = function (err, leftover) { if (settled) return; settled = true; cb(err, sock, leftover) }
  sock.setTimeout(9000)
  sock.on('connect', function () {
    sock.write('CONNECT ' + targetHost + ':' + targetPort + ' HTTP/1.1\r\nHost: ' + targetHost + ':' + targetPort + '\r\nProxy-Connection: keep-alive\r\n\r\n')
  })
  const onData = function (d) {
    buf = Buffer.concat([buf, d])
    const idx = buf.indexOf('\r\n\r\n')
    if (idx === -1) { if (buf.length > 8192) done(new Error('proxy header too large')); return }
    const head = buf.slice(0, idx).toString('latin1')
    const rest = buf.slice(idx + 4)
    if (/^HTTP\/1\.[01]\s+200/.test(head)) { sock.removeListener('data', onData); done(null, rest) }
    else { sock.destroy(); done(new Error('proxy refuses: ' + head.split('\r\n')[0])) }
  }
  sock.on('data', onData)
  sock.on('timeout', function () { sock.destroy(); done(new Error('proxy timeout')) })
  sock.on('error', function (e) { done(e) })
}

/* ---------- 转发 ---------- */
function handle(conn, port) {
  let chunks = []
  let acc = 0
  let decided = false
  const timer = setTimeout(decide, 1200)
  conn.on('error', function () {})
  conn.on('data', function (d) {
    if (decided) return
    chunks.push(d); acc += d.length
    if (acc >= 1440) decide()
  })
  function decide() {
    if (decided) return
    decided = true
    clearTimeout(timer)
    const buf = Buffer.concat(chunks)
    const host = port === 443 ? parseSNI(buf) : parseHTTPHost(buf)
    if (!host) { stats.fail++; try { conn.destroy() } catch (e) {}; return }
    const useProxy = !!(cfg.proxy && cfg.proxy.host && (cfg.proxyAll || (cfg.proxyDomains || []).indexOf(host) !== -1 || true))
    const ips = useProxy ? ['__proxy__'] : findUpstream(host)
    if (!ips || !ips.length) {
      stats.fail++; stats.lastFail = host + ' (无可用候选 IP)'
      log('no candidate for ' + host)
      try { conn.destroy() } catch (e) {}
      return
    }
    stats.requests++
    let idx = 0
    const startedAt = Date.now()
    ;(function dial() {
      if (idx >= ips.length || Date.now() - startedAt > 9000) {
        stats.fail++; stats.lastFail = host + ' (全部候选失败)'
        log('relay fail ' + host)
        try { conn.destroy() } catch (e) {}
        return
      }
      const ip = ips[idx++]
      let settled = false
      if (ip === '__proxy__') {
        connectViaProxy(host, port, function (err, upSock, leftover) {
          if (err || !upSock) {
            stats.fail++; stats.lastFail = host + ' (代理隧道失败: ' + (err && err.message) + ')'
            log('proxy tunnel fail ' + host + ' ' + (err && err.message))
            try { conn.destroy() } catch (e) {}
            return
          }
          settled = true
          stats.ok++; stats.lastOk = host + ' (via proxy)'
          if (leftover && leftover.length) conn.write(leftover)
          for (const c of chunks) upSock.write(c)
          conn.pipe(upSock); upSock.pipe(conn)
          conn.on('error', function () { try { upSock.destroy() } catch (e) {} })
          conn.on('close', function () { try { upSock.destroy() } catch (e) {} })
        })
        return
      }
      const up = net.connect({ host: ip, port: port })
      up.setTimeout(2500)
      up.on('connect', function () {
        if (settled) return
        settled = true
        stats.ok++; stats.lastOk = host + ' -> ' + ip
        for (const c of chunks) up.write(c)
        conn.pipe(up); up.pipe(conn)
      })
      up.on('timeout', function () { up.destroy(); if (!settled) { settled = true; dial() } })
      up.on('error', function () { if (!settled) { settled = true; dial() } })
      conn.on('close', function () { try { up.destroy() } catch (e) {} })
      conn.on('error', function () { try { up.destroy() } catch (e) {} })
    })()
  }
}
function listen(port) {
  const s = net.createServer(function (c) { handle(c, port) })
  s.on('error', function (e) {
    log('listen ' + port + ' FAILED ' + e.message)
    bootLog('listen ' + port + ' failed: ' + e.message)
    writeStatus({ running: false, pid: process.pid, startedAt: STARTED_AT, error: '端口 ' + port + ' 绑定失败（可能被 Watt Toolkit/Steam++ 等占用）: ' + e.message })
  })
  s.listen(port, '127.0.0.1', function () { log('listening 127.0.0.1:' + port) })
}

/* ---------- 启动 ---------- */
installHosts()
listen(443)
listen(80)
writeStatus({ running: true, pid: process.pid, startedAt: STARTED_AT, domains: DOMAINS, covered: [], refreshing: true, stats: stats })
refreshAll('startup').catch(function (e) { log('startup refresh error ' + e.message) })
setInterval(function () { refreshAll('periodic').catch(function (e) { log('periodic refresh error ' + e.message) }) }, 5 * 60 * 1000)
setInterval(function () {
  writeStatus({
    running: true, pid: process.pid, startedAt: STARTED_AT,
    domains: DOMAINS, covered: Object.keys(CAND),
    notCovered: DOMAINS.filter(function (d) { return !CAND[d] }),
    cand: CAND, stats: stats
  })
}, 10000)
process.on('uncaughtException', function (e) { log('uncaught ' + (e && e.stack ? e.stack.slice(0, 300) : e)) })
process.on('exit', function () { bootLog('exit') })