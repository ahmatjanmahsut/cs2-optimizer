/* 职业哥预设：20 位顶尖选手准星（实时预览）+ 官方真实游戏截图视角图 */
window.PRO = (function () {
  var CACHE = null

  function load(cb) {
    if (CACHE) { cb(CACHE); return }
    var done = function (j) { CACHE = (j && j.players) || []; cb(CACHE) }
    if (window.api && window.api.pro && window.api.pro.data) {
      window.api.pro.data().then(function (r) {
        if (r && r.ok) { done(r.data) }
        else { U.toast('职业数据加载失败：' + ((r && r.error) || '未知'), 'err'); cb([]) }
      })
    } else {
      fetch('data/proplayers.json').then(function (r) { return r.json() }).then(done).catch(function () { cb([]) })
    }
  }

  function styleMap(txt) {
    txt = String(txt || '')
    if (/Dot Only/i.test(txt)) return 5
    if (/Legacy\/Shot|Dynamic/i.test(txt)) return 1
    return 4
  }
  function yn(v) { return /^Yes$/i.test(String(v)) ? 1 : 0 }
  function num(v, def) { var n = Number(v); return isFinite(n) ? n : def }

  /* 准星绘制（迷你与大图共用） */
  function drawCrossOn(ctx, p, cx, cy, u) {
    u = u || 2
    var len = num(p.length, 2) * u * 1.1 + 2
    var inner = (num(p.gap, 1) + 0.5) * u
    if (inner < 0) inner = 0
    var th = Math.max(1, num(p.thickness, 2) * u * 0.55)
    var style = styleMap(p.style)
    var col = 'rgba(' + num(p.cr, 0) + ',' + num(p.cg, 255) + ',' + num(p.cb, 255) + ',' + (num(p.ca, 255) / 255) + ')'
    ctx.save()
    ctx.lineCap = 'butt'
    function arm(x1, y1, x2, y2) {
      if (yn(p.outline)) { ctx.strokeStyle = '#000'; ctx.lineWidth = th + u; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
      ctx.strokeStyle = col; ctx.lineWidth = th
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    }
    if (style !== 5) {
      if (!yn(p.tstyle)) arm(cx, cy - inner, cx, cy - inner - len)
      arm(cx, cy + inner, cx, cy + inner + len)
      arm(cx - inner, cy, cx - inner - len, cy)
      arm(cx + inner, cy, cx + inner + len, cy)
    }
    if (style === 5 || yn(p.dot)) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1.5, th * 0.7), 0, 7); ctx.fill() }
    ctx.restore()
  }

  /* —— 渲染选手卡片区 + 场景预览区到指定容器 —— */
  function render(boxHost, onApply) {
    load(function (players) {
      if (!players.length) { U.clear(boxHost); boxHost.appendChild(U.h('div', { class: 'muted' }, '未加载到职业数据')) ; return }
      U.clear(boxHost)
      boxHost.appendChild(U.h('div', { class: 'muted', style: 'margin-bottom:8px', html:
        '数据来源 <b>prosettings.net</b>（选手实际比赛配置，20 位近年 HLTV Top20 与人气选手）。点“<b>载入编辑</b>”把准星/灵敏度/雷达/帧率参数一键写入下方编辑器（实时预览与 cfg 输出同步更新）。' }))
      var grid = U.h('div', { class: 'pro-grid' })
      players.forEach(function (p) {
        var cv = U.h('canvas', { width: '96', height: '96', class: 'pro-mini' })
        var ctx = cv.getContext('2d')
        ctx.fillStyle = '#1c2530'; ctx.fillRect(0, 0, 96, 96)
        drawCrossOn(ctx, p, 48, 48, 2)
        var card = U.h('div', { class: 'pro-card' }, [
          U.h('div', { class: 'pro-head' }, [U.h('b', {}, p.name), U.h('span', { class: 'tag' }, 'eDPI ' + Math.round(num(p.edpi, 0)))]),
          U.h('div', { class: 'pro-body' }, [cv, U.h('div', { class: 'pro-info' }, [
            U.h('div', {}, p.dpi + ' DPI · ' + p.sensitivity + ' sens'),
            U.h('div', { class: 'muted' }, '准星 ' + num(p.length, 0) + 'px / 间距 ' + num(p.gap, 0)),
            U.h('div', { class: 'muted' }, (p.style || '').replace('Dynamic Cross (Legacy/Shot Feedback)', '动态十字'))
          ])]),
          U.h('div', { class: 'row', style: 'margin-top:8px' }, [
            U.h('button', { class: 'btn small primary', onclick: function () {
              onApply(p)
              U.toast(p.name + ' 的参数已载入编辑器')
            } }, '⬆ 载入编辑')
          ])
        ])
        grid.appendChild(card)
      })
      boxHost.appendChild(grid)
    })
  }


  /* —— 把选手参数映射进编辑器 —— */
  function toEditor(p) {
    var e = {
      cross: {
        style: styleMap(p.style), size: num(p.length, 4), gap: num(p.gap, -3),
        thickness: num(p.thickness, 1), outline: yn(p.outline), outlineth: yn(p.outline) ? 1 : 0,
        alpha: num(p.ca, 255), r: num(p.cr, 0), g: num(p.cg, 205), b: num(p.cb, 50),
        dot: yn(p.dot), t: yn(p.tstyle)
      },
      view: { sens: num(p.sensitivity, 1.6), dpi: num(p.dpi, 800), zoom: num(p.zoom, 1), width: num(p.sniper, 1) },
      ctrl: { radar_scale: num(p.radar, 0.5), fps_max: /^\d+$/.test(String(p.maxfps)) ? num(p.maxfps, 0) : 0 }
    }
    e.ctrlRate = null
    return e
  }

  return { render: render, toEditor: toEditor }
})()