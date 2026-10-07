'use strict'
const fs = require('fs')
const path = require('path')
const { shell } = require('electron')
const system = require('./system')

async function locate() {
  return system.findCs2()
}

async function readAutoexec() {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 安装目录，请确认 Steam 已安装并安装游戏')
  const file = path.join(loc.cfgDir, 'autoexec.cfg')
  let content = ''
  let exists = false
  try {
    content = fs.readFileSync(file, 'utf8')
    exists = true
  } catch (e) {}
  let writable = false
  try {
    fs.accessSync(path.dirname(file), fs.constants.W_OK)
    writable = true
  } catch (e) {}
  return { file, exists, content, writable, cfgDir: loc.cfgDir }
}

async function writeAutoexec(content) {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 安装目录，请确认 Steam 已安装并安装游戏')
  const file = path.join(loc.cfgDir, 'autoexec.cfg')
  let backup = null
  if (fs.existsSync(file)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = path.join(loc.cfgDir, 'autoexec.cfg.' + stamp + '.bak')
    fs.copyFileSync(file, backup)
  }
  fs.writeFileSync(file, String(content), 'utf8')
  return { file, backup }
}

async function openCfgFolder() {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 配置目录')
  const r = await shell.openPath(loc.cfgDir)
  if (r) throw new Error(r)
  return { opened: loc.cfgDir }
}

async function writeAutoexecBlock(tag, lines) {
  const begin = "// === CS2-Optimizer:" + tag + " BEGIN ==="
  const end = "// === CS2-Optimizer:" + tag + " END ==="
  const info = await readAutoexec()
  let content = info.content || ""
  const block = begin + "\n" + (lines || []).join("\n") + "\n" + end
  const i = content.indexOf(begin)
  const j = content.indexOf(end)
  if (i !== -1 && j > i) content = content.slice(0, i) + block + content.slice(j + end.length)
  else content = (content ? content.replace(/\s+$/, "") + "\n\n" : "") + block + "\n"
  return writeAutoexec(content)
}

function validateName(file) {
  let name = String(file || '').trim()
  if (!/\.cfg$/i.test(name)) name += '.cfg'
  const base = name.replace(/\.cfg$/i, '')
  if (!/^[a-zA-Z0-9_\-]{1,64}$/.test(base)) throw new Error('cfg 文件名不合法：仅允许字母/数字/下划线/连字符（1-64 字符）')
  return name
}

async function readCfg(file) {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 安装目录，请确认 Steam 已安装并安装游戏')
  const name = validateName(file)
  const target = path.join(loc.cfgDir, name)
  let content = ''
  let exists = false
  try { content = fs.readFileSync(target, 'utf8'); exists = true } catch (e) {}
  let writable = false
  try { fs.accessSync(loc.cfgDir, fs.constants.W_OK); writable = true } catch (e) {}
  return { file: target, name: name, exists: exists, content: content, writable: writable, cfgDir: loc.cfgDir }
}

async function writeCfg(file, content) {
  const loc = await system.findCs2()
  if (!loc.found) throw new Error('未找到 CS2 安装目录，请确认 Steam 已安装并安装游戏')
  const name = validateName(file)
  const target = path.join(loc.cfgDir, name)
  let backup = null
  if (fs.existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    backup = target + '.' + stamp + '.bak'
    fs.copyFileSync(target, backup)
  }
  fs.writeFileSync(target, String(content), 'utf8')
  return { file: target, name: name, backup: backup }
}

/* 把标记块合并写入任意 cfg 文件（保留文件其它内容），autoexec/自定义名均安全 */
async function writeBlock(file, tag, lines) {
  const info = await readCfg(file)
  const begin = '// === CS2-Optimizer:' + tag + ' BEGIN ==='
  const end = '// === CS2-Optimizer:' + tag + ' END ==='
  let content = info.content || ''
  const block = begin + '\n' + (lines || []).join('\n') + '\n' + end
  const i = content.indexOf(begin)
  const j = content.indexOf(end)
  if (i !== -1 && j > i) content = content.slice(0, i) + block + content.slice(j + end.length)
  else content = (content ? content.replace(/\s+$/, '') + '\n\n' : '') + block + '\n'
  return writeCfg(info.name, content)
}

module.exports = { locate, readAutoexec, writeAutoexec, writeAutoexecBlock, readCfg, writeCfg, writeBlock, openCfgFolder }