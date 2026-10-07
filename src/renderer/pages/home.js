/* 概览与一键实施中心 */
window.PAGES = window.PAGES || {}
window.PAGES.home = {
  title: '概览与一键实施',
  sub: '环境总览；所有调优草稿在这里一次性落地',
  render: function (view, setChips) {
    var infoBar = U.h('div', { class: 'grid c3' })
    var center = U.h('div', { class: 'card', style: 'margin-top:14px' }, [U.h('h3', {}, '🧰 一键实施中心')])
    var centerBody = U.h('div', {})
    center.appendChild(centerBody)
    var planLine = U.h('div', { class: 'row', style: 'margin:10px 0' })
    center.appendChild(planLine)
    var runBtn = U.h('button', { class: 'btn primary', style: 'padding:10px 22px' }, '🚀 开始一键实施')
    var clearBtn = U.h('button', { class: 'btn ghost' }, '🗑 清空草稿')
    var runResult = U.h('div', { class: 'muted', style: 'margin-top:10px' }, '')
    var runResultBox = U.h('div', { style: 'margin-top:8px' })
    center.appendChild(U.h('div', { class: 'row' }, [runBtn, clearBtn]))
    center.appendChild(runResult)
    center.appendChild(runResultBox)
    view.appendChild(infoBar)
    view.appendChild(center)

    function statCard(title, initText) {
      var body = U.h('div', { class: 'muted' }, initText || '检测中…')
      var root = U.h('div', { class: 'card' }, [U.h('h3', {}, title), body])
      return { root: root, body: body }
    }
    function kv(parent, k, v) { parent.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, k), U.h('span', {}, v)])) }

    var cHw = statCard('💻 硬件与驱动')
    var cCs2 = statCard('📦 CS2 / Steam')
    var cPow = statCard('⚡ 电源')
    infoBar.appendChild(cHw.root); infoBar.appendChild(cCs2.root); infoBar.appendChild(cPow.root)

    U.call(window.api.system.info(true)).then(function (info) {
      U.clear(cHw.body)
      kv(cHw.body, 'CPU', info.cpu.model)
      kv(cHw.body, '内存', info.memory.totalGB + ' GB')
      info.gpus.forEach(function (g) { kv(cHw.body, '显卡', g.name + (g.driver ? '（驱动 ' + g.driver + '）' : '')) })
      if (info.nvidiaSmi && info.nvidiaSmi.available) {
        var r0 = info.nvidiaSmi.rows[0]
        kv(cHw.body, '实时', r0.temp + '°C · ' + r0.powerDraw)
      }
    })
    U.call(window.api.cs2.locate()).then(function (loc) {
      U.clear(cCs2.body)
      kv(cCs2.body, 'Steam', loc.steamPath ? '✔ ' : '✘ 未找到')
      kv(cCs2.body, 'CS2', loc.found ? '✔ 已定位 cfg 目录' : '✘ 未找到（请确认已安装）')
    })
    U.call(window.api.power.active()).then(function (a2) {
      U.clear(cPow.body)
      kv(cPow.body, '当前计划', a2.name)
      setChips([{ text: '电源：' + a2.name, type: /高性能|high/i.test(a2.name) ? 'ok' : 'warn' }])
    })

    function refreshPlan() {
      var s = U.draftSummary()
      U.clear(planLine)
      planLine.appendChild(U.h('span', { class: 'muted' }, '待实施：'))
      planLine.appendChild(U.h('span', { class: 'tag gold' }, '驱动 ' + (s.nv ? s.nv.length : 0) + ' 项'))
      planLine.appendChild(U.h('span', { class: 'tag gold' }, '系统优化 ' + (s.sys ? s.sys.length : 0) + ' 项'))
      var game = U.draftGet('game', null)
      planLine.appendChild(U.h('span', { class: 'tag' }, '游戏 cfg ' + (game ? game.file + ' · ' + game.lines.length + ' 条' : '无')))
      planLine.appendChild(U.h('span', { class: 'tag' }, '启动项 ' + (game && game.launch ? '已生成' : '无')))
    }
    refreshPlan()

    clearBtn.addEventListener('click', function () {
      U.draftClear(); refreshPlan(); U.toast('草稿已清空')
    })

    runBtn.addEventListener('click', function () {
      var s = U.draftSummary()
      var game = U.draftGet('game', null)
      var plan = { nvidia: s.nv || [], sys: s.sys || [], blocks: [] }
      if (game && game.lines && game.lines.length) plan.blocks.push({ file: game.file, tag: 'GAME', lines: game.lines })
      if (!plan.nvidia.length && !plan.sys.length && !plan.blocks.length) { U.toast('先去“设备调整/游戏设置调整”勾选或存草稿', 'warn'); return }
      runBtn.disabled = true
      runResult.textContent = '实施中…'
      U.clear(runResultBox)
      U.call(window.api.apply.all(plan)).then(function (r) {
        runResult.textContent = '完成：'
        if (r.nv && !r.nv.skipped && r.nv.ok !== false) {
          var okn = (r.nv.items || []).filter(function (i) { return i.set }).length
          appendLine('NVIDIA 驱动', okn + '/' + (r.nv.items || []).length + ' 项成功', true)
        } else if (r.nv && r.nv.ok === false) appendLine('NVIDIA 驱动', r.nv.msg, false)
        ;(r.sys || []).forEach(function (it) { appendLine(it.id, (it.ok ? (it.skipped ? '跳过：' : '') + it.msg : it.msg), it.ok) })
        ;(r.cfg || []).forEach(function (it) { appendLine('autoexec ' + it.tag, it.ok ? '已写入 ' + it.file : it.msg, it.ok) })
        if (game && game.launch) appendLine('启动项（粘贴到 Steam 属性）', '已生成，点右侧复制', true, game.launch)
        U.toast('一键实施完成 🎉')
        refreshPlan()
      }).catch(function (e) {
        runResult.textContent = ''
        appendLine('实施失败', e.message, false)
      }).then(function () { runBtn.disabled = false })
      function appendLine(k, v, ok, copyText) {
        var row = U.h('div', { class: 'list-item' }, [U.h('b', { style: 'min-width:190px' }, k), U.h('span', { class: ok ? 'tag green' : 'tag', style: ok ? '' : 'background:rgba(248,81,73,.15);color:var(--err)' }, v)])
        if (copyText) row.appendChild(U.h('button', { class: 'btn small', onclick: function () { U.copy(copyText, '已复制，去 Steam 粘贴') } }, '复制'))
        runResultBox.appendChild(row)
      }
      function appendLine2() {}
    })
    /* 若从其它页面切回，重算一次计划 */
    window.addEventListener('hashchange', function () { setTimeout(refreshPlan, 80) })
  }
}