/* 一键体检报告 */
window.PAGES = window.PAGES || {}
window.PAGES.report = {
  title: '一键体检报告',
  sub: '汇总硬件/驱动/显示/电源/系统优化/Steam 访问/游戏配置的实时状态，生成可分享的体检报告',
  render: function (view) {
    var sumBar = U.h('div', { class: 'row', style: 'margin-bottom:12px' })
    var body = U.h('div', { class: 'card' })
    view.appendChild(sumBar)
    view.appendChild(body)

    var genBtn = U.h('button', { class: 'btn primary', onclick: function () { generate(genBtn) } }, '🩺 开始体检')
    var copyBtn = U.h('button', { class: 'btn', style: 'display:none', onclick: function () { U.copy(lastMd, '报告已复制（Markdown）') } }, '📋 复制报告')
    var saveBtn = U.h('button', { class: 'btn', style: 'display:none', onclick: function () {
      U.call(window.api.report.saveMarkdown(lastMd)).then(function (r) { if (r.saved) U.toast('已保存：' + r.file) })
    } }, '💾 保存为文件')
    sumBar.appendChild(genBtn); sumBar.appendChild(copyBtn); sumBar.appendChild(saveBtn)
    sumBar.appendChild(U.h('span', { class: 'muted' }, '体检包含 NVAPI 驱动读取、powercfg 细项、刷新率、Steam 接入状态等，约需 5~15 秒'))
    var lastMd = ''

    function stateTag(s) {
      if (s === 'ok') return U.h('span', { class: 'tag green' }, '✔ 通过')
      if (s === 'warn') return U.h('span', { class: 'tag gold' }, '⚠ 建议优化')
      if (s === 'bad') return U.h('span', { class: 'tag', style: 'background:rgba(248,81,73,.15);color:var(--err)' }, '✘ 问题')
      return U.h('span', { class: 'tag' }, '· 参考')
    }
    function generate(btn) {
      btn.disabled = true
      U.clear(body)
      body.appendChild(U.h('div', { class: 'muted', style: 'padding:20px' }, '体检中…'))
      U.call(window.api.report.generate()).then(function (r) {
        lastMd = r.markdown
        U.clear(body)
        U.clear(sumBar)
        sumBar.appendChild(btn)
        var okT = U.h('span', { class: 'tag green' }, '✔ ' + r.summary.ok)
        var wT = U.h('span', { class: 'tag gold' }, '⚠ ' + r.summary.warn)
        var bT = U.h('span', { class: 'tag', style: 'background:rgba(248,81,73,.15);color:var(--err)' }, '✘ ' + r.summary.bad)
        sumBar.appendChild(U.h('span', {}, [okT, ' ', wT, ' ', bT]))
        sumBar.appendChild(copyBtn); copyBtn.style.display = ''
        sumBar.appendChild(saveBtn); saveBtn.style.display = ''
        r.sections.forEach(function (sec) {
          var s = U.h('div', { class: 'card', style: 'margin:12px 0' }, [U.h('h3', {}, sec.title)])
          if (!sec.items.length) s.appendChild(U.h('div', { class: 'muted' }, '（本环境未采集到该项数据）'))
          sec.items.forEach(function (it) {
            var row = U.h('div', { class: 'list-item' }, [
              U.h('span', { style: 'min-width:190px' }, it.name),
              stateTag(it.state),
              U.h('span', { class: 'muted', style: 'flex:1' }, it.detail + (it.advice ? '　→ ' + it.advice : ''))
            ])
            s.appendChild(row)
          })
          body.appendChild(s)
        })
        btn.disabled = false
        btn.textContent = '🩺 重新体检'
      }).catch(function (e) {
        U.clear(body)
        body.appendChild(U.h('div', { class: 'muted' }, '体检失败：' + e.message))
        btn.disabled = false
      })
    }
  }
}
