'use strict'
const fs = require('fs')
const { spawn } = require('child_process')
const { ps } = require('./powershell')
const system = require('./system')

const CHECKLISTS = {
  nvidia: {
    vendor: 'NVIDIA',
    steps: [
      '桌面右键 → 打开“NVIDIA 控制面板”',
      '左侧“管理 3D 设置” → 切到“程序设置”选项卡',
      '选择或添加 CS2 主程序：<游戏目录>\\game\\bin\\win64\\cs2.exe',
      '按下表逐项设置后点击“应用”，再打开“通过预览调整图像设置”选“使用高级 3D 图像设置”'
    ],
    groups: [
      { group: '性能核心（对新玩家提升最明显）', items: [
        { setting: '电源管理模式', value: '最高性能优先', why: '防止显卡降频，帧数更稳' },
        { setting: '低延迟模式', value: '开（或 Ultra）', why: '降低输入延迟，对枪更跟手' },
        { setting: '垂直同步', value: '关', why: '消除拖影与额外延迟' },
        { setting: '三重缓冲', value: '关', why: '与垂直同步联动，竞技不需要' }
      ] },
      { group: '画质与过滤', items: [
        { setting: '纹理过滤 - 质量', value: '高性能', why: 'CS2 画质下几乎无视觉差异，帧数更高' },
        { setting: '线程优化', value: '开', why: '多核 CPU 利用率更好' },
        { setting: '着色器缓存大小', value: '无限制（或 10 GB 以上）', why: '避免首次加载贴图掉帧' },
        { setting: 'CUDA - GPU', value: '全部', why: '默认即可' }
      ] },
      { group: '显示器', items: [
        { setting: 'G-SYNC / G-SYNC 兼容', value: '开（若显示器支持）', why: '消除撕裂同时保持低延迟' },
        { setting: '刷新率', value: '显示器支持的最高值', why: '配合 Windows 设置 → 屏幕 → 高级显示' }
      ] }
    ]
  },
  amd: {
    vendor: 'AMD',
    steps: [
      '桌面右键 → 打开“AMD Software: Adrenalin Edition”',
      '“游戏”→“图形”→ 找到/添加 Counter-Strike 2 配置文件',
      '按下表逐项修改“全局图形”或“程序图形”设置'
    ],
    groups: [
      { group: '延迟与同步', items: [
        { setting: 'Radeon Anti-Lag', value: '开', why: '降低输入延迟' },
        { setting: 'Radeon Boost', value: '关', why: '动态降分辨率会糊画面，竞技不建议' },
        { setting: 'Radeon Chill', value: '关', why: '限制帧数波动但增加延迟' },
        { setting: '等待垂直刷新', value: '关', why: '同 NVIDIA 垂直同步逻辑' }
      ] },
      { group: '画质与过滤', items: [
        { setting: '表面格式优化 (SF Cache)', value: '关', why: '驱动级缓存有时引发卡顿' },
        { setting: '纹理过滤质量', value: '性能', why: '提高帧数' },
        { setting: '形态过滤', value: '关 / 使用应用程序设置', why: '避免驱动强制 AF' }
      ] },
      { group: '电源', items: [
        { setting: 'AMD Power Tuning', value: '默认或性能档（台式机）', why: '笔记本谨慎调，注意散热' }
      ] }
    ]
  },
  common: {
    vendor: '通用',
    steps: [
      '无论 A/N 卡都建议先做这几件事'
    ],
    groups: [
      { group: '系统级', items: [
        { setting: 'Windows 图形设置', value: '为 cs2.exe 指定“高性能”', why: '双显卡笔记本必查：设置 → 系统 → 屏幕 → 显示 → 图形' },
        { setting: '显卡驱动', value: '更新到最新稳定版', why: 'CS2 大版本更新常伴随驱动优化' },
        { setting: '电源计划', value: '高性能', why: '本工具“电源管理”页一键完成' },
        { setting: '游戏内视频设置', value: '全屏独占 + 原生分辨率', why: '窗口/无边框模式帧数与延迟更差' }
      ] },
      { group: '干扰项', items: [
        { setting: '覆盖层', value: '关 Discord/Xbox Game Bar 覆盖', why: '减少卡顿与反作弊误报' },
        { setting: '全屏优化', value: '对 cs2.exe 关闭 Windows“全屏优化”', why: '降低输入延迟' }
      ] }
    ]
  }
}

let gpuCache = null
let gpuCacheAt = 0
async function getInfo() {
  if (gpuCache && Date.now() - gpuCacheAt < 15000) return gpuCache
  const info = await system.getInfo()
  const names = info.gpus.map(function (g) { return g.name }).join(' ')
  gpuCacheAt = Date.now()
gpuCache = {
    gpus: info.gpus,
    nvidia: /NVIDIA|GeForce|RTX|GTX/i.test(names),
    amd: /AMD|Radeon/i.test(names),
    intel: /Intel.*(HD Graphics|UHD|Arc|Iris)/i.test(names),
    nvidiaSmi: info.nvidiaSmi
  }
  return gpuCache
}
function startDetached(exe, args) {
  const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true })
  child.on('error', function () { /* 启动失败由调用方兜底 */ })
  child.unref()
}

async function openNvidiaPanel() {
  const exes = ['C:\\Program Files\\NVIDIA Corporation\\Control Panel Client\\nvcplui.exe']
  for (const e of exes) {
    if (fs.existsSync(e)) { startDetached(e, []); return { launched: true, via: e } }
  }
  startDetached('explorer.exe', ['shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel'])
  return { launched: true, via: 'store-app' }
}

async function openAmdSoftware() {
  const exes = [
    'C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe',
    'C:\\Program Files\\AMD\\CNext\\CNext\\AMDRSSrcExt.exe'
  ]
  for (const e of exes) {
    if (fs.existsSync(e)) { startDetached(e, []); return { launched: true, via: e } }
  }
  try {
    const r = await ps('Get-ChildItem "C:\\Program Files\\AMD" -Recurse -Filter *.exe -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "Radeon|AMDRSSrc" } | Select-Object -First 1 -ExpandProperty FullName')
    if (r) { startDetached(r, []); return { launched: true, via: r } }
  } catch (e) {}
  throw new Error('未找到 AMD Software，可能通过 Microsoft Store 安装，请在开始菜单搜索 AMD Software')
}

function getChecklist(vendor) {
  const key = CHECKLISTS[vendor] ? vendor : 'common'
  return CHECKLISTS[key]
}

module.exports = { getInfo, openNvidiaPanel, openAmdSoftware, getChecklist, CHECKLISTS }
