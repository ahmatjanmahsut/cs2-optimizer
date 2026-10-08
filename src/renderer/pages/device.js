/* 设备调整：显卡驱动自动写入 + 电源 + 系统优化，统一由“一键实施”落地 */
window.PAGES = window.PAGES || {}
window.PAGES.device = {
  title: '设备调整',
  sub: '显卡驱动 · 电源 · 系统优化集中管理；勾选后到底部“一键实施”，或到首页并入总计划',
  render: function (view, setChips) {
    var gInfo = null, catalog = [], nvSt = { available: false }
    var sel = {}   /* id -> {checked, value} */
    var sysSel = {}
    var sysItems = []

    view.appendChild(U.h('div', { class: 'row', style: 'margin-bottom:12px' }, [
      U.h('button', { class: 'btn', onclick: function () { load() } }, '🔄 重新检测'),
      U.h('button', { class: 'btn', onclick: function () { loadNv(true) } }, '读取驱动当前值'),
      U.h('span', { class: 'muted' }, '驱动写入需要 NVIDIA 控制面板权限，不弹 UAC；每次写入前自动备份原值，可一键恢复')
    ]))
    var nvCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '🎮 NVIDIA 驱动设置（直接写入显卡配置档）')])
    var nvBody = U.h('div', {}, '加载中…')
    nvCard.appendChild(nvBody)
    view.appendChild(nvCard)
    view.appendChild(U.h('div', { style: 'height:14px' }))

    var sysCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '🛠️ 系统优化项（电源计划 / PCIe / 鼠标 / Windows 游戏相关）')])
    var sysBody = U.h('div', {}, '检测中…')
    sysCard.appendChild(sysBody)
    view.appendChild(sysCard)
    view.appendChild(U.h('div', { style: 'height:14px' }))

    var result = U.h('div', { class: 'card', style: 'display:none' }, [U.h('h3', {}, '📋 实施结果')])
    var resultBody = U.h('div', {})
    result.appendChild(resultBody)
    view.appendChild(result)
    view.appendChild(U.h('div', { style: 'height:14px' }))

    var bar = U.h('div', { class: 'card row', style: 'justify-content:space-between' })
    bar.appendChild(U.h('span', { class: 'muted', id: 'device-plan-label' }, ''))
    bar.appendChild(U.h('div', { class: 'row' }, [
      U.h('button', { class: 'btn ghost', onclick: function () {
        U.call(window.api.apply.nvRestore()).then(function () { U.toast('已按备份恢复 NVIDIA 设置'); loadNv() })
      } }, '↩️ 恢复驱动原值'),
      U.h('button', { class: 'btn ghost', onclick: function () {
        U.call(window.api.apply.mouseRestore()).then(function () { U.toast('鼠标设置已恢复'); loadSys() })
      } }, '↩️ 恢复鼠标设置'),
      U.h('button', { class: 'btn primary', onclick: function () { runAll() } }, '🚀 一键实施所选')
    ]))
    view.appendChild(bar)
    updatePlanLabel()

    function updatePlanLabel() {
      var n = Object.keys(sel).filter(function (k) { return sel[k].checked }).length
      var s = Object.keys(sysSel).filter(function (k) { return sysSel[k] }).length
      U.clear(bar.firstChild)
      bar.firstChild.appendChild(document.createTextNode('当前选择：NVIDIA ' + n + ' 项 · 系统优化 ' + s + ' 项'))
    }

    function load() { loadNv(); loadSys(); loadAmd() }

    /* ---------- AMD 能力探测卡片 ---------- */
    function loadAmd() {
      U.call(window.api.amd.detect()).then(function (a) {
        if (!a.isAmd) return
        var card = U.h('div', { class: 'card', style: 'margin-top:14px' }, [U.h('h3', {}, '🟥 AMD 显卡与能力探测')])
        a.gpus.forEach(function (g) { card.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, g.name), U.h('span', {}, '驱动 ' + (g.driver || '?'))])) })
        card.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, 'AMD Software'), U.h('span', {}, a.radeonSoftware.installed ? U.h('span', { class: 'tag green' }, a.radeonSoftware.version || '已安装') : U.h('span', { class: 'tag gold' }, '未检测到，建议安装官方驱动'))]))
        card.appendChild(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, 'ADL 库'), U.h('span', {}, a.adl.available ? '已找到（' + a.adl.paths.length + ' 个）' : '未找到')]))
        var auto = U.h('div', { style: 'margin-top:8px' }, [U.h('b', {}, '本工具可自动完成：'), U.h('div', { class: 'muted' }, a.canAuto.map(function (x) { return x.title }).join(' · '))])
        card.appendChild(auto)
        var manualBox = U.h('div', { style: 'margin-top:10px' })
        manualBox.appendChild(U.h('b', {}, '需在 AMD Software 手动设置（AMD 未提供公开写入接口）：'))
        manualBox.appendChild(U.h('div', { class: 'muted', style: 'margin:4px 0 8px' }, '为避免写坏驱动配置，本工具不擅自改这些项；下面清单可勾选记录你已核对过的项。'))
        var done = U.draftGet('amd-checked', [])
        var progress = U.h('span', { class: 'tag', style: 'margin-left:8px' })
        function refreshProgress() {
          var n = done.length
          U.clear(progress)
          progress.appendChild(document.createTextNode('已核对 ' + n + '/' + a.checklist.length))
          progress.className = 'tag' + (n === a.checklist.length ? ' green' : '')
        }
        a.checklist.forEach(function (c) {
          var cb = U.h('input', { type: 'checkbox' })
          cb.checked = done.indexOf(c.id) !== -1
          cb.addEventListener('change', function () {
            var i = done.indexOf(c.id)
            if (cb.checked && i === -1) done.push(c.id)
            if (!cb.checked && i !== -1) done.splice(i, 1)
            U.draftSet('amd-checked', done)
            refreshProgress()
          })
          manualBox.appendChild(U.h('label', { class: 'check-row' }, [cb, U.h('span', {}, [U.h('b', {}, c.label), U.h('div', { class: 'muted' }, c.note)])]))
        })
        manualBox.appendChild(U.h('div', { class: 'row', style: 'margin-top:8px' }, [progress]))
        card.appendChild(manualBox)
        card.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
          U.h('button', { class: 'btn primary', onclick: function () { U.call(window.api.amd.open()).then(function (r) { U.toast(r.message) }) } }, '🖥️ 打开 AMD Software'),
          U.h('button', { class: 'btn', onclick: function () { U.openSettings('ms-settings:display') } }, '🖵 显示与刷新率设置')
        ]))
        refreshProgress()
        view.appendChild(card)
      }).catch(function () {})
    }

    function loadNv(force) {
      nvBody.textContent = '加载中…'
      Promise.all([U.call(window.api.gpu.info()), U.call(window.api.apply.catalog()), U.call(window.api.apply.nvStatus())])
        .then(function (arr) {
          gInfo = arr[0]; catalog = arr[1]; nvSt = arr[2] || { available: false }
          setChips([
            { text: gInfo.nvidia ? 'NVIDIA ✔' : 'NVIDIA ✘', type: gInfo.nvidia ? 'ok' : 'err' },
            { text: gInfo.amd ? 'AMD ✔' : 'AMD ✘', type: gInfo.amd ? 'ok' : '' }
          ])
          U.clear(nvBody)
          if (!gInfo.nvidia) {
            if (gInfo.amd) renderAmd()
            else nvBody.appendChild(U.h('div', { class: 'muted' }, '未检测到 NVIDIA / AMD 独显'))
            return
          }
          if (!nvSt.available) {
            nvBody.appendChild(U.h('div', { class: 'section-note', html: '⚠️ NVAPI 通道不可用：' + (nvSt.error || '未读取到状态') + '。以下为手动核对清单（打开控制面板逐项对照）。' }))
            renderChecklistFallback()
            return
          }
          nvBody.appendChild(U.h('div', { class: 'muted', style: 'margin-bottom:8px', html:
            '写入方式：创建 NVIDIA 程序配置文件 <b>' + 'CS2-Optimizer' + '</b>（仅对 cs2.exe 生效，不影响其它软件；控制面板可查/可删）。' +
            (nvSt.applied ? ' <span class="tag green">配置档已存在</span>' : ' <span class="tag">配置档未建立，实施时自动创建</span>') }))
          catalog.forEach(function (c) {
            var st = nvSt.items && nvSt.items[c.id]
            var curVal = st && st.found ? st.current : null
            var draft = U.draftGet('nv', [])
            var saved = null
            draft.forEach(function (d) { if (d.id === c.id) saved = d })
            var checked = saved ? !!saved.checked : true
            var value = saved ? saved.value : c.rec
            sel[c.id] = { checked: checked, value: value }
            var row = U.h('div', { class: 'list-item' })
            var cb = U.h('input', { type: 'checkbox' })
            cb.checked = checked
            cb.addEventListener('change', function () { sel[c.id].checked = cb.checked; persist(); updatePlanLabel() })
            var opts = U.h('select', { style: 'min-width:190px' })
            c.options.forEach(function (o) {
              var op = U.h('option', { value: o[0] }, o[1] + (o[0] === c.rec ? ' ★' : ''))
              if (o[0] === value) op.selected = true
              opts.appendChild(op)
            })
            opts.addEventListener('change', function () { sel[c.id].value = opts.value; persist(); renderCurTag() })
            var curTag = U.h('span', { class: 'tag', style: 'margin-left:8px' })
            function renderCurTag() {
              U.clear(curTag)
              var same = curVal && curVal.toLowerCase() === sel[c.id].value.toLowerCase()
              curTag.appendChild(document.createTextNode(curVal ? (same ? '当前=所选 ✔' : '驱动当前 ' + curVal) : '驱动当前：默认'))
              curTag.className = 'tag ' + (same ? 'green' : '')
            }
            renderCurTag()
            row.appendChild(U.h('div', { style: 'display:flex;gap:12px;align-items:center;flex:1' }, [
              cb, U.h('div', { style: 'flex:1' }, [
                U.h('b', {}, c.title),
                U.h('div', { class: 'muted' }, 'ID ' + c.id + ' · 推荐：' + (c.options.filter(function (o) { return o[0] === c.rec })[0] || ['', ''])[1])
              ]),
              opts, curTag
            ]))
            nvBody.appendChild(row)
          })
        })
    }

    function persist() {
      var arr = []
      catalog.forEach(function (c) { if (sel[c.id] && sel[c.id].checked) arr.push({ id: c.id, value: sel[c.id].value }) })
      U.draftSet('nv', arr)
      updatePlanLabel()
    }

    function renderAmd() {
      U.clear(nvBody)
      nvBody.appendChild(U.h('div', { class: 'section-note', html:
        '<b>AMD 说明：</b>AMD 驱动设置没有公开的稳定写入接口，自动写入暂不可承诺（避免写坏驱动配置）。这里提供最有效的核对清单 + 一键直达。' }))
      var items = [
        ['Radeon Anti-Lag', '开', '降低输入延迟，对枪更跟手'],
        ['Radeon Boost', '关', '动态降分辨率会糊画面，竞技不建议'],
        ['Radeon Chill', '关', '限帧波动，增加响应延迟'],
        ['等待垂直刷新', '关（主要游戏）', '消除同步延迟'],
        ['表面格式缓存 (SF Cache)', '关', '驱动级缓存偶发卡顿'],
        ['纹理过滤质量', '性能', '提高帧数'],
        ['图像锐化', '关 或 按需', 'CS2 自带 sharpening，避免双重锐化'],
        ['显示器刷新率', '最高', '到 Windows 显示设置确认，很多新屏默认 60Hz']
      ]
      var tbl = U.h('table', {})
      tbl.appendChild(U.h('tr', {}, [U.h('th', {}, '设置项'), U.h('th', {}, '推荐'), U.h('th', {}, '说明')]))
      items.forEach(function (r) {
        tbl.appendChild(U.h('tr', {}, [U.h('td', {}, r[0]), U.h('td', {}, [U.h('span', { class: 'tag gold' }, r[1])]), U.h('td', { class: 'muted' }, r[2])]))
      })
      nvBody.appendChild(tbl)
      nvBody.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
        U.h('button', { class: 'btn', onclick: function () { U.call(window.api.gpu.openAmd()).then(function () { U.toast('已尝试启动 AMD Software') }) } }, '🖥️ 打开 AMD Software'),
        U.h('button', { class: 'btn', onclick: function () { U.openSettings('ms-settings:display') } }, '🖵 刷新率设置'),
        U.h('button', { class: 'btn', onclick: function () { U.call(window.api.system.openExternal('https://www.amd.com/en/support')) } }, '⬇️ 驱动下载')
      ]))
    }

    function renderChecklistFallback() {
      var rows = [['电源管理模式', '最高性能优先'], ['低延迟模式', '开/Ultra'], ['垂直同步', '关'], ['三重缓冲', '关'], ['纹理过滤质量', '高性能'], ['线程优化', '开'], ['着色器缓存', '≥10GB']]
      var tbl = U.h('table', {})
      rows.forEach(function (r) { tbl.appendChild(U.h('tr', {}, [U.h('td', {}, r[0]), U.h('td', {}, [U.h('span', { class: 'tag gold' }, r[1])])])) })
      nvBody.appendChild(tbl)
      nvBody.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
        U.h('button', { class: 'btn', onclick: function () { U.call(window.api.gpu.openNvidia()).then(function () { U.toast('已尝试启动 NVIDIA 控制面板') }) } }, '🖥️ 打开 NVIDIA 控制面板')
      ]))
    }

    function loadSys() {
      sysBody.textContent = '检测中…'
      U.call(window.api.apply.sysList()).then(function (list) {
        sysItems = list
        U.clear(sysBody)
        list.forEach(function (t) {
          var saved = U.draftGet('sys', [])
          var row = U.h('div', { class: 'list-item' })
          var cb = U.h('input', { type: 'checkbox' })
          cb.checked = saved.indexOf(t.id) !== -1
          cb.addEventListener('change', function () { sysSel[t.id] = cb.checked; persistSys(); updatePlanLabel() })
          sysSel[t.id] = cb.checked
          var state = t.done === true ? U.h('span', { class: 'tag green' }, '已开启') : (t.done === false ? U.h('span', { class: 'tag' }, '未开启') : U.h('span', { class: 'tag', style: 'background:rgba(210,153,34,.15);color:var(--warn)' }, '需 CS2 路径'))
          var single = U.h('button', { class: 'btn', style: 'margin-left:8px', onclick: function () {
            U.call(window.api.apply.sysApply([t.id])).then(function (res) {
              var r = res[0]
              U.toast(t.title + '：' + (r.ok ? (r.skipped ? '跳过（' + r.msg + '）' : r.msg) : '失败 ' + r.msg), r.ok ? '' : 'err')
              loadSys()
            })
          } }, '仅实施此项')
          row.appendChild(U.h('div', { style: 'display:flex;gap:12px;align-items:flex-start;flex:1' }, [
            cb,
            U.h('div', { style: 'flex:1' }, [
              U.h('b', {}, t.title), ' ', state,
              U.h('div', { class: 'muted', style: 'margin-top:4px' }, t.desc)
            ]),
            single
          ]))
          sysBody.appendChild(row)
        })
      })
    }
    function persistSys() {
      var ids = Object.keys(sysSel).filter(function (k) { return sysSel[k] })
      U.draftSet('sys', ids)
    }

    function runAll() {
      var plan = { nvidia: U.draftGet('nv', []), sys: U.draftGet('sys', []), blocks: [] }
      var game = U.draftGet('game', null)
      if (game && game.lines && game.lines.length) plan.blocks.push({ file: game.file, tag: 'GAME', lines: game.lines })
      if (!plan.nvidia.length && !plan.sys.length && !plan.blocks.length) { U.toast('还没有勾选任何要实施的项目', 'warn'); return }
      result.style.display = 'block'
      U.clear(resultBody)
      resultBody.appendChild(U.h('div', { class: 'muted' }, '实施中…（驱动写入 + 系统项 + 游戏配置）'))
      U.call(window.api.apply.all(plan)).then(function (r) {
        U.clear(resultBody)
        if (r.nv) {
          if (r.nv.skipped) resultBody.appendChild(line('NVIDIA', '⏭ ' + r.nv.skipped, 'warn'))
          else if (r.nv.ok === false) resultBody.appendChild(line('NVIDIA', '✘ ' + r.nv.msg, 'err'))
          else {
            ;(r.nv.items || []).forEach(function (it) {
              var cat = catalog.filter(function (c) { return c.id === it.id })[0]
              resultBody.appendChild(line(cat ? cat.title : it.id, it.set ? '✔ 写入成功' + (r.nv.saved ? '（已保存）' : '') : '✘ 失败 code=' + it.code, it.set ? 'ok' : 'err'))
            })
          }
        }
        ;(r.sys || []).forEach(function (it) {
          resultBody.appendChild(line(it.id, it.ok ? (it.skipped ? '⏭ ' + it.msg : '✔ ' + it.msg) : '✘ ' + it.msg, it.ok ? (it.skipped ? 'warn' : 'ok') : 'err'))
        })
        ;(r.cfg || []).forEach(function (it) {
          resultBody.appendChild(line('autoexec[' + it.tag + ']', it.ok ? '✔ 已写入 ' + it.file : '✘ ' + it.msg, it.ok ? 'ok' : 'err'))
        })
        resultBody.appendChild(U.h('div', { class: 'muted', style: 'margin-top:8px' }, '提示：驱动项写入后对“之后启动的游戏进程”生效；重启 CS2 后全部生效。可再点“读取驱动当前值”验证。'))
        loadNv(); loadSys()
        U.toast('一键实施完成')
      }).catch(function (e) {
        U.clear(resultBody)
        resultBody.appendChild(line('执行', '✘ ' + e.message, 'err'))
      })
      function line(k, v, cls) {
        return U.h('div', { class: 'list-item' }, [U.h('b', { style: 'min-width:200px' }, k), U.h('span', { class: cls === 'ok' ? 'tag green' : cls === 'err' ? 'tag' : 'tag gold' }, v)])
      }
    }

    load()
  }
}