'use strict'
const os = require('os')
const path = require('path')
const fs = require('fs')
const { ps, pexec, OPTS } = require('./powershell')

const GAME_FOLDER = 'Counter-Strike Global Offensive'
let cache = null
let cacheAt = 0

async function getGpus() {
  try {
    const json = await ps('Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion,AdapterRAM,VideoProcessor,Status | ConvertTo-Json -Compress')
    if (!json) return []
    let arr = JSON.parse(json)
    if (!Array.isArray(arr)) arr = [arr]
    return arr.map(function (g) {
      return {
        name: String(g.Name || '').trim(),
        driver: String(g.DriverVersion || '').trim(),
        vramMB: g.AdapterRAM ? Math.round(g.AdapterRAM / 1048576) : null,
        chip: String(g.VideoProcessor || '').trim(),
        status: String(g.Status || '').trim()
      }
    })
  } catch (e) {
    return []
  }
}

async function getNvidiaSmi() {
  const candidates = [
    'nvidia-smi',
    'C:\\Windows\\System32\\nvidia-smi.exe',
    'C:\\Program Files\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe'
  ]
  for (const c of candidates) {
    try {
      const r = await pexec(c, ['--query-gpu=name,driver_version,power.draw,power.limit,temperature.gpu', '--format=csv,noheader'], { windowsHide: true, timeout: 8000, maxBuffer: 1048576 })
      const lines = String(r.stdout).trim().split(/\r?\n/).filter(Boolean)
      if (lines.length) {
        return {
          available: true,
          source: c,
          rows: lines.map(function (l) {
            const p = l.split(',')
            return {
              name: (p[0] || '').trim(),
              driver: (p[1] || '').trim(),
              powerDraw: (p[2] || '').trim(),
              powerLimit: (p[3] || '').trim(),
              temp: (p[4] || '').trim()
            }
          })
        }
      }
    } catch (e) { /* 尝试下一个候选路径 */ }
  }
  return { available: false }
}

async function getOsInfo() {
  let caption = os.type() + ' ' + os.release()
  let build = ''
  try {
    const json = await ps('Get-CimInstance Win32_OperatingSystem | Select-Object Caption,BuildNumber | ConvertTo-Json -Compress')
    if (json) {
      const o = JSON.parse(json)
      if (o && o.Caption) caption = o.Caption
      if (o && o.BuildNumber) build = o.BuildNumber
    }
  } catch (e) {}
  return { caption, build, arch: os.arch(), home: os.homedir() }
}

async function getCpu() {
  let model = os.cpus()[0] ? os.cpus()[0].model : '未知 CPU'
  try {
    const n = await ps('(Get-CimInstance Win32_Processor | Select-Object -First 1).Name')
    if (n) model = n
  } catch (e) {}
  return { model, logicalCores: os.cpus().length }
}

async function getSteamPath() {
  const sources = [
    ['HKCU\\Software\\Valve\\Steam', 'SteamPath'],
    ['HKCU\\Software\\Valve\\Steam', 'InstallPath'],
    ['HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath']
  ]
  for (const item of sources) {
    try {
      const r = await pexec('reg', ['query', item[0], '/v', item[1]], OPTS)
      const m = String(r.stdout).match(new RegExp(item[1] + '\\s+REG_SZ\\s+(.+)', 'i'))
      if (m && m[1]) return path.normalize(m[1].trim())
    } catch (e) {}
  }
  const fallbacks = ['C:\\Program Files (x86)\\Steam', path.join(os.homedir(), 'Steam')]
  for (const f of fallbacks) {
    if (fs.existsSync(path.join(f, 'steamapps'))) return f
  }
  return null
}

function parseLibraryPaths(steamPath) {
  const libs = [steamPath]
  try {
    const vdf = fs.readFileSync(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    const re = /"path"\s+"([^"]+)"/g
    let m
    while ((m = re.exec(vdf))) {
      const p = path.normalize(m[1])
      if (p.toLowerCase() !== steamPath.toLowerCase()) libs.push(p)
    }
  } catch (e) {}
  return libs
}

async function findCs2() {
  const steamPath = await getSteamPath()
  const result = { steamPath, gameDir: null, cfgDir: null, found: false, libraries: [], buildId: '' }
  if (!steamPath) return result
  result.libraries = parseLibraryPaths(steamPath)
  for (const lib of result.libraries) {
    const gameDir = path.join(lib, 'steamapps', 'common', GAME_FOLDER)
    const cfgDir = path.join(gameDir, 'game', 'csgo', 'cfg')
    if (fs.existsSync(cfgDir)) {
      try {
        const acf = fs.readFileSync(path.join(lib, 'steamapps', 'appmanifest_730.acf'), 'utf8')
        const bm = acf.match(/"buildid"\s+"(\d+)"/)
        if (bm) result.buildId = bm[1]
      } catch (e) {}
      result.found = true
      result.gameDir = gameDir
      result.cfgDir = cfgDir
      break
    }
  }
  return result
}

async function getInfo(force) {
  if (!force && cache && Date.now() - cacheAt < 15000) return cache
  const [gpus, smi, osInfo, cpu, steam] = await Promise.all([getGpus(), getNvidiaSmi(), getOsInfo(), getCpu(), findCs2()])
  cache = {
    gpus,
    nvidiaSmi: smi,
    os: osInfo,
    cpu,
    memory: {
      totalGB: +(os.totalmem() / 1073741824).toFixed(1),
      freeGB: +(os.freemem() / 1073741824).toFixed(1)
    },
    steam
  }
  cacheAt = Date.now()
  return cache
}

module.exports = { getInfo, getGpus, getNvidiaSmi, findCs2, getSteamPath }
