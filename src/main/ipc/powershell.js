'use strict'
const { execFile } = require('child_process')
const util = require('util')
const pexecFile = util.promisify(execFile)

const OPTS = { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 }

const UTF8_PREFIX = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; '

async function ps(script) {
  const r = await pexecFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', UTF8_PREFIX + script], OPTS)
  return String(r.stdout).replace(/\u0000/g, '').trim()
}

module.exports = { ps, pexec: pexecFile, OPTS }
