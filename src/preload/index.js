'use strict'
const { contextBridge, ipcRenderer } = require('electron')

function invoker(channel) {
  return function () {
    const args = Array.prototype.slice.call(arguments)
    return ipcRenderer.invoke.apply(ipcRenderer, [channel].concat(args))
  }
}

contextBridge.exposeInMainWorld('api', {
  version: '0.1.0',
  report: {
    generate: invoker('report:generate'),
    saveMarkdown: invoker('report:save'),
    displays: invoker('display:info')
  
  },
  amd: {
    detect: invoker('amd:detect'),
    open: invoker('amd:open')
  },
  pro: {
    data: invoker('pro:data')
  },
  system: {
    info: invoker('system:info'),
    openExternal: invoker('system:openExternal')
  },
  power: {
    plans: invoker('power:plans'),
    active: invoker('power:active'),
    status: invoker('power:status'),
    setActive: invoker('power:setActive'),
    highPerformance: invoker('power:ensureHighPerformance')
  },
  gpu: {
    info: invoker('gpu:info'),
    checklist: invoker('gpu:checklist'),
    openNvidia: invoker('gpu:openNvidiaPanel'),
    openAmd: invoker('gpu:openAmdSoftware')
  },
  apply: {
    catalog: invoker('apply:catalog'),
    nvStatus: invoker('apply:nvStatus'),
    nvApply: invoker('apply:nvApply'),
    nvRestore: invoker('apply:nvRestore'),
    nvRemove: invoker('apply:nvRemove'),
    sysList: invoker('apply:sysList'),
    sysApply: invoker('apply:sysApply'),
    mouseRestore: invoker('apply:mouseRestore'),
    all: invoker('apply:all')
  },
  cs2: {
    writeAutoexecBlock: invoker('cs2:writeAutoexecBlock'),
    locate: invoker('cs2:locate'),
    readAutoexec: invoker('cs2:readAutoexec'),
    writeAutoexec: invoker('cs2:writeAutoexec'),
    openCfgFolder: invoker('cs2:openCfgFolder'),
    readCfg: invoker('cs2:readCfg'),
    writeCfg: invoker('cs2:writeCfg'),
    writeBlock: invoker('cs2:writeBlock')
  }
})