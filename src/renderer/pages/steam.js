/* Steam 访问辅助：本地 SNI 中转 + hosts 注入（不装证书不 MITM） */
window.PAGES = window.PAGES || {}
window.PAGES.steam = {
  title: 'Steam 访问辅助',
  sub: '让国内可访问的 Steam 域名走本地中转直连（原理类似 SteamCommunity 302 / Watt Toolkit）',
  render: function (view) {
    var statusBox = U.h('div', { class: 'card' }, [U.h('h3', {}, '📡 当前状态')])
    var stBody = U.h('div', {}, '读取中…')
    statusBox.appendChild(stBody)
    var probeBox = U.h('div', { class: 'card', style: 'margin-top:14px' }, [U.h('h3', {}, '🔍 接入点探测（DNS 解析 + TLS 握手实测）')])
    var prBody = U.h('div', { class: 'muted' }, '点击右侧按钮探测当前网络可达的 Steam 接入 IP')
    probeBox.appendChild(prBody)
    var helpCard = U.h('div', { class: 'card', style: 'margin-top:14px' }, [U.h('h3', {}, 'ℹ️ 原理与说明')])
    helpCard.appendChild(U.h('div', { class: 'section-note blue', html:
      '工作方式：<br>' +
      '① 通过阿里 DNS（DoH）解析各 Steam 域名的真实 IP，逐个做 TLS 握手实测，筛出<b>当前网络可达</b>的接入 IP；<br>' +
      '② 将可达域名注入 hosts 指向 127.0.0.1，本机启动一个<b>纯 TCP/SNI 中转</b>把请求转发到这些可达 IP；<br>' +
      '③ 全程<b>不终止 TLS、不安装证书</b>，Steam 官方证书原样透传，账号与支付安全不受影响；<br>' +
      '④ 停用即还原 hosts 并清理 DNS 缓存。开启需要一次 UAC 管理员授权（写 hosts + 启动中转进程）。<br>' +
      '若探测不到任何可达 IP，说明当前网络阻断了所有探测到的节点，可切换网络（手机热点）先启用一次，Steam 客户端流量通常走 UDP，主要影响商店/社区/库存网页。' }))
    view.appendChild(statusBox)
    view.appendChild(probeBox)
    view.appendChild(helpCard)

    function btnRow() {
      var enableB = U.h('button', { class: 'btn primary', onclick: function () { doEnable(enableB, disableB) } }, '⚡ 启用加速（需 UAC 授权）')
      var disableB = U.h('button', { class: 'btn', onclick: function () { doDisable(enableB, disableB) } }, '⏹ 停用并还原 hosts')
      var probeB = U.h('button', { class: 'btn blue', onclick: function () { doProbe(probeB) } }, '🔍 重新探测接入点')
      var healB = U.h('button', { class: 'btn', onclick: function () {
        U.call(window.api.steam.heal()).then(function (r) { U.toast(r && r.healed ? '已清理残留 hosts 注入' : '无需修复', 'ok'); refresh() })
      } }, '🩹 修复/清理残留')
      return U.h('div', { class: 'row', style: 'margin-top:10px' }, [enableB, disableB, probeB, healB])
    }
    var actions = btnRow()
    stBody.appendChild(actions)

    function refresh() {
      U.call(window.api.steam.status()).then(function (st) {
        var kids = []
        var ss = st.stats || {}
        kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '中转进程'),
          U.h('span', {}, st.running ? U.h('span', { class: 'tag green' }, '运行中（PID ' + st.pid + '）') : U.h('span', { class: 'tag' }, '未运行'))]))
        if (st.running) {
          kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '转发统计'),
            U.h('span', {}, '成功 ' + (ss.ok || 0) + ' · 失败 ' + (ss.fail || 0) + ' · 最近成功 ' + (ss.lastOk || '—'))]))
        }
        if (st.covered && st.covered.length) {
          kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '已覆盖域名'),
            U.h('span', {}, st.covered.join(', '))]))
        }
        if (st.notCovered && st.notCovered.length) {
          kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '未覆盖域名'),
            U.h('span', { class: 'muted' }, st.notCovered.join(', ') + '（当前网络下这些域名的接入 IP 不可达，代理软件或稍后重试可能改善）')]))
        }
        kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, 'hosts 注入'),
          U.h('span', {}, st.hostsInjected ? U.h('span', { class: 'tag green' }, '已注入') : U.h('span', { class: 'tag' }, '未注入'))]))
        if (st.running && st.domains && st.domains.length) kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '覆盖域名'), U.h('span', {}, st.domains.join(', '))]))
        if (st.error) kids.push(U.h('div', { class: 'kv' }, [U.h('span', { class: 'k' }, '错误'), U.h('span', {}, st.error)]))
        if (st.logTail) kids.push(U.h('pre', { class: 'cmdbox', style: 'margin-top:8px;max-height:110px' }, st.logTail))
        var body = U.h('div', {}, kids)
        // 保留按钮行
        stBody.appendChild(body)
      })
    }
    function doEnable(eb, db) {
      eb.disabled = true
      U.toast('请在弹出的 UAC 窗口点“是”（仅一次）')
      U.call(window.api.steam.enable()).then(function (r) {
        if (r.running) {
          var nc = (r.notCovered || []).length
          U.toast('Steam 中转已启用' + (nc ? '（' + nc + ' 个域名当前网络不可达，详见状态区）' : '，重启浏览器/Steam 客户端生效'), nc ? 'warn' : 'ok')
        }
        else U.toast(r.note || '未能启动中转进程（UAC 被取消？端口 80/443 被占用？）', 'warn')
        reload()
      }).catch(function () {}).then(function () { eb.disabled = false })
    }
    function doDisable(eb, db) {
      db.disabled = true
      U.call(window.api.steam.disable()).then(function (r) {
        U.toast(r.running ? '停用未完全生效，请检查 UAC 是否取消' : '已停用并还原 hosts', r.running ? 'warn' : 'ok')
        reload()
      }).catch(function () {}).then(function () { db.disabled = false })
    }
    function doProbe(pb) {
      pb.disabled = true
      U.clear(prBody)
      prBody.appendChild(U.h('div', { class: 'muted' }, '探测中（每个域名最多测 6 个 IP，约 15~30 秒）…'))
      U.call(window.api.steam.probe()).then(function (r) { renderProbe(r); U.toast('探测完成，可达域名 ' + Object.keys(r.domains || {}).length + ' 个', 'ok') })
        .catch(function () {}).then(function () { pb.disabled = false })
    }
    function renderProbe(r) {
      U.clear(prBody)
      var tbl = U.h('table', {})
      tbl.appendChild(U.h('tr', {}, [U.h('th', {}, '域名'), U.h('th', {}, '可达 IP（TLS 握手成功）'), U.h('th', {}, '不可达')]))
      Object.keys(r.probes || {}).forEach(function (d) {
        var good = [], bad = []
        r.probes[d].forEach(function (x) { (x.ok ? good : bad).push(x.ip + (x.ok ? ' (' + x.ms + 'ms)' : '')) })
        tbl.appendChild(U.h('tr', {}, [
          U.h('td', {}, d),
          U.h('td', { class: 'muted' }, good.length ? good.join(', ') : U.h('span', { class: 'tag green' }, '—')),
          U.h('td', { class: 'muted' }, bad.join(', ') || '—')
        ]))
      })
      prBody.appendChild(tbl)
    }
    function reload() { location.hash = '' ; setTimeout(function () { location.hash = 'steam' }, 10) }
    refresh()
    // 首次自动探测一次
    U.call(window.api.steam.probe()).then(renderProbe).catch(function () {})
  }
}