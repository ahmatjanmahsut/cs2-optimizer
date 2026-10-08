'use strict'
/* CS2 优化助手 · Steam 访问辅助 —— 本地回环 SNI 中转（不终止 TLS、不装证书） */
const net = require('net')
const fs = require('fs')
const { execSync } = require('child_process')

const argv = process.argv.slice(2)
function opt(name) { const i = argv.indexOf(name); return (i >= 0 && i + 1 < argv.length) ? argv[i + 1] : null }
const CFG_PATH = opt('--config')
const MODE = opt('--mode') || 'start'
if (!CFG_PATH) { console.error('missing --config'); process.exit(2) }
const cfg = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'))

function log(m) { try { fs.appendFileSync(cfg.logFile, '[' + new Date().toISOString() + '] ' + m + '\r\n') } catch (e) {} }
function writeFileAtomic(f, s) {
  const t = f + '.tmp'
  fs.writeFileSync(t, s)
  try { fs.renameSync(t, f) } catch (e) { fs.writeFileSync(f, s) }
}
function writeStatus(obj) { try { writeFileAtomic(cfg.statusFile, JSON.stringify(obj)) } catch (e) {} }

/* ---- 卸载模式：杀旧进程 + 还原 hosts + 清 DNS ---- */
if (MODE === 'stop') {
  try {
    const st = JSON.parse(fs.readFileSync(cfg.statusFile, 'utf8'))
    if (st && st.pid && st.running) { try { process.kill(st.pid) } catch (e) {} }
  } catch (e) {}
  try {
    const h = fs.readFileSync(cfg.hostsFile, 'utf8')
    const i = h.indexOf(cfg.block.begin)
    const j = h.indexOf(cfg.block.end)
    let out = (i >= 0 && j > i) ? (h.slice(0, i) + h.slice(j + cfg.block.end.length)) : h
    out = out.replace(/\r?\n(\r?\n)+\s*(\r?\n)+/g, '\r\n\r\n')
    writeFileAtomic(cfg.hostsFile, out)
    log('hosts block removed')
  } catch (err) { log('hosts restore fail ' + err.message) }
  try { execSync('ipconfig /flushdns', { windowsHide: true }) } catch (e) {}
  writeStatus({ running: false, stoppedAt: new Date().toISOString() })
  log('stopped')
  process.exit(0)
}

/* ---- hosts 安装（标记块，幂等替换） ---- */
function installHosts() {
  const h = fs.readFileSync(cfg.hostsFile, 'utf8')
  if (!fs.existsSync(cfg.backupFile)) { fs.copyFileSync(cfg.hostsFile, cfg.backupFile); log('hosts backed up') }
  const lines = (cfg.hosts || []).map(function (d) { return '127.0.0.1\t' + d })
  const block = cfg.block.begin + '\r\n' + lines.join('\r\n') + '\r\n' + cfg.block.end + '\r\n'
  const i = h.indexOf(cfg.block.begin)
  const j = h.indexOf(cfg.block.end)
  let out
  if (i >= 0 && j > i) out = h.slice(0, i) + block + h.slice(j + cfg.block.end.length)
  else out = (h.endsWith('\n') ? h : h + '\r\n') + '\r\n' + block
  writeFileAtomic(cfg.hostsFile, out)
  log('hosts installed for ' + lines.length + ' domains')
}

/* ---- TLS ClientHello SNI 解析 ---- */
function parseSNI(buf) {
  try {
    if (buf.length < 6 || buf[0] !== 0x16) return null
    let p = 5
    if (buf[p] !== 0x01) return null
    p += 1 + 3
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
function findUpstreams(host) {
  const d = cfg.domains || {}
  if (d[host]) return d[host]
  const keys = Object.keys(d)
  for (const k of keys) {
    if (host === k || host.endsWith('.' + k)) return d[k]
  }
  return null
}

/* ---- 中转 ---- */
let requestCount = 0
let startedAt = new Date().toISOString()
function handle(conn, port) {
  let chunks = []
  let acc = 0
  let done = false
  const timer = setTimeout(decide, 1500)
  conn.on('error', function () {})
  conn.on('data', function (d) {
    if (done) return
    chunks.push(d); acc += d.length
    if (acc >= 1440) decide()
  })
  function decide() {
    if (done) return
    done = true
    clearTimeout(timer)
    const buf = Buffer.concat(chunks)
    const target = port === 443 ? parseSNI(buf) : parseHTTPHost(buf)
    if (!target) { conn.destroy(); return }
    const ips = findUpstreams(target)
    if (!ips || !ips.length) { conn.destroy(); return }
    requestCount++
    let idx = 0
    ;(function dial() {
      const ip = ips[idx++]
      if (!ip) { try { conn.destroy() } catch (e) {}; return }
      let settled = false
      const up = net.connect({ host: ip, port: port, timeout: 6000 })
      up.setNoDelay(true)
      up.on('connect', function () {
        if (settled) return
        settled = true
        for (const c of chunks) up.write(c)
        conn.pipe(up); up.pipe(conn)
        log('relay ' + target + ' -> ' + ip + ':' + port)
      })
      up.on('timeout', function () { up.destroy(); if (!settled) { settled = true; dial() } })
      up.on('error', function () { if (!settled) { settled = true; dial() } })
      conn.on('error', function () { try { up.destroy() } catch (e) {} })
      conn.on('close', function () { try { up.destroy() } catch (e) {} })
    })()
  }
}
function listen(port) {
  const s = net.createServer(function (c) { handle(c, port) })
  s.on('error', function (e) {
    log('listen ' + port + ' error ' + e.message)
    writeStatus({ running: false, pid: process.pid, startedAt: startedAt, error: '端口 ' + port + ' 绑定失败: ' + e.message })
  })
  s.listen(port, '127.0.0.1', function () { log('listening 127.0.0.1:' + port) })
}

listen(443)
listen(80)
installHosts()
writeStatus({ running: true, pid: process.pid, startedAt: startedAt, domains: Object.keys(cfg.domains || {}), hosts: cfg.hosts })
setInterval(function () {
  writeStatus({ running: true, pid: process.pid, startedAt: startedAt, domains: Object.keys(cfg.domains || {}), hosts: cfg.hosts, requests: requestCount })
}, 8000)
process.on('uncaughtException', function (e) { log('uncaught ' + (e && e.message)) })
