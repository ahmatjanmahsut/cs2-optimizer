'use strict'
const { ipcMain, shell } = require('electron')
const system = require('./system')
const power = require('./power')
const gpu = require('./gpu')
const cs2cfg = require('./cs2cfg')
const apply = require('./apply')
const steam302 = require('./steam302')
const report = require('./report')
const { screen } = require('electron')

function handle(channel, fn) {
  ipcMain.handle(channel, async function (evt) {
    const args = Array.prototype.slice.call(arguments, 1)
    try {
      const data = await fn.apply(null, args)
      return { ok: true, data }
    } catch (err) {
      return { ok: false, error: String((err && err.message) || err) }
    }
  })
}

function registerIpc() {
  // 系统信息
  handle('system:info', function (force) { return system.getInfo(!!force) })
  // 职业预设数据
  handle('pro:data', function () {
    const fs = require('fs')
    const p = require('path')
    const file = p.join(__dirname, '..', '..', 'renderer', 'data', 'proplayers.json')
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  }),

  handle('system:openExternal', function (url) {
    const s = String(url || '')
    if (/^(https?:|ms-settings:|steam:|valve:)/i.test(s)) return shell.openExternal(s)
    throw new Error('不允许打开该类型的链接: ' + s)
  })

  // 电源管理
  handle('power:plans', function () { return power.getPlans() })
  handle('power:active', function () { return power.getActive() })
  handle('power:status', function () { return power.getStatus() })
  handle('power:setActive', function (guid) { return power.setActive(guid) })
  handle('power:ensureHighPerformance', function () { return power.ensureHighPerformance() })

  // 显卡
  handle('gpu:info', function () { return gpu.getInfo() })
  handle('gpu:checklist', function (vendor) { return gpu.getChecklist(vendor) })
  handle('gpu:openNvidiaPanel', function () { return gpu.openNvidiaPanel() })
  handle('gpu:openAmdSoftware', function () { return gpu.openAmdSoftware() })

  // CS2 配置文件
  handle('cs2:locate', function () { return cs2cfg.locate() })
  handle('cs2:readAutoexec', function () { return cs2cfg.readAutoexec() })
  handle('cs2:writeAutoexec', function (content) { return cs2cfg.writeAutoexec(content) })
  handle('cs2:openCfgFolder', function () { return cs2cfg.openCfgFolder() })
  handle('cs2:writeAutoexecBlock', function (tag, lines) { return cs2cfg.writeAutoexecBlock(tag, lines) })
  handle('cs2:readCfg', function (file) { return cs2cfg.readCfg(file) })
  handle('cs2:writeCfg', function (file, content) { return cs2cfg.writeCfg(file, content) })
  handle('cs2:writeBlock', function (file, tag, lines) { return cs2cfg.writeBlock(file, tag, lines) })

  // 一键实施引擎
  handle('apply:catalog', function () { return apply.NV_CATALOG })
  handle('apply:nvStatus', function () { return apply.nvidiaStatus() })
  handle('apply:nvApply', function (sel) { return apply.nvidiaApply(sel) })
  handle('apply:nvRestore', function () { return apply.nvidiaRestore() })
  handle('apply:nvRemove', function () { return apply.nvidiaRemoveProfile() })
  handle('apply:sysList', function () { return apply.sysList() })
  handle('apply:sysApply', function (ids) { return apply.sysApply(ids) })
  handle('apply:mouseRestore', function () { return apply.mouseRestore() })
  handle('apply:all', function (plan) { return apply.applyAll(plan) })

  // Steam 访问辅助
  handle('steam:status', function () { return steam302.status() })
  handle('steam:probe', function () { return steam302.probe() })
  handle('steam:enable', function () { return steam302.enable() })
  handle('steam:disable', function () { return steam302.disable() })

  // 一键体检报告
  handle('report:generate', function () { return report.generate() })
  handle('display:info', function () {
    try {
      return screen.getAllDisplays().map(function (d) {
        return { bounds: d.bounds, scaleFactor: d.scaleFactor, frequency: d.displayFrequency || null, internal: d.internal, label: d.label }
      })
    } catch (e) { return [] }
  })
  handle('report:save', function (markdown) { return report.saveMarkdown(markdown) })
}

module.exports = { registerIpc }