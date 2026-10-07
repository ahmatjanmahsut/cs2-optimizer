/* 路径与设置 */
window.PAGES = window.PAGES || {}
window.PAGES.settings = {
  title: '路径与设置',
  sub: '本工具与 CS2/Steam 相关路径检测；当前为框架版本',
  render: function (view) {
    var card = U.h('div', { class: 'card' }, [U.h('h3', {}, '📁 自动检测到的路径')])
    var body = U.h('div', {}, '检测中…')
    card.appendChild(body)
    view.appendChild(card)

    var infoCard = U.h('div', { class: 'card', style: 'margin-top:14px' }, [U.h('h3', {}, 'ℹ️ 关于当前版本')])
    infoCard.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '应用版本'), U.h('span', {}, 'v0.1.0（框架版）')]))
    infoCard.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '技术栈'), U.h('span', {}, 'Electron + 原生 HTML/JS（无构建步骤，改完刷新即生效）')]))
    infoCard.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '已实现'), U.h('span', {}, '硬件/显卡/驱动检测 · 电源计划切换 · NVIDIA/AMD 设置清单 · 准星预览与写入 · 操控参数生成 · 启动项生成')]))
    infoCard.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '待开发'), U.h('span', {}, 'NVAPI/ADL 自动写入驱动 · 一键体检报告 · 准星分享码解析 · 多 Steam 账户 cfg 管理（见 README 路线图）')]))
    infoCard.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
      U.h('button', { class: 'btn', onclick: function () { U.call(window.api.cs2.openCfgFolder()).catch(function () {}) } }, '📂 打开 CS2 cfg 文件夹'),
      U.h('button', { class: 'btn', onclick: function () { U.openSettings('ms-settings:display').catch(function () {}) } }, '🖵 打开显示设置')
    ]))
    view.appendChild(infoCard)

    U.call(window.api.cs2.locate()).then(function (loc) {
      U.clear(body)
      kv('Steam 根目录', loc.steamPath || '未找到')
      kv('CS2 游戏目录', loc.gameDir || '未找到')
      kv('cfg 目录（autoexec 所在）', loc.cfgDir || '未找到')
      if (loc.libraries && loc.libraries.length) kv('检测到的库', loc.libraries.join('; '))
    })
    function kv(k, v) {
      body.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, k), U.h('span', {}, v)]))
    }
  }
}
