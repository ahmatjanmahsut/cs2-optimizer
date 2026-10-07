/* 通用小工具 */
window.U = (function () {
  function h(tag, attrs, children) {
    var el = document.createElement(tag)
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k]
        if (k === 'class') el.className = v
        else if (k === 'html') el.innerHTML = v
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2), v)
        else if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v === true ? '' : v)
      })
    }
    ;(Array.isArray(children) ? children : (children ? [children] : [])).forEach(function (c) {
      if (c === null || c === undefined || c === false) return
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)))
    })
    return el
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

  /* 统一 IPC 调用：返回 data，失败 toast 报错并抛出 */
  function call(promise, silent) {
    return promise.then(function (r) {
      if (!r || !r.ok) {
        var msg = (r && r.error) || '未知错误'
        if (!silent) toast(msg, 'err')
        throw new Error(msg)
      }
      return r.data
    })
  }

  function toast(msg, type) {
    var box = document.getElementById('toasts')
    var t = h('div', { class: 'toast ' + (type || '') }, msg)
    box.appendChild(t)
    setTimeout(function () { t.remove() }, type === 'err' ? 6000 : 3500)
  }

  function copy(text, okMsg) {
    var done = function () { toast(okMsg || '已复制到剪贴板') }
    if (navigator.clipboard) {
      return navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done() })
    }
    legacyCopy(text); done()
    return Promise.resolve()
  }
  function legacyCopy(text) {
    var ta = h('textarea', {}, text)
    document.body.appendChild(ta); ta.select()
    try { document.execCommand('copy') } catch (e) {}
    ta.remove()
  }

  /* autoexec 标记块写入：按 tag 替换/追加，其余内容保留 */
  /* 待实施草稿（跨页面共享，localStorage 持久化） */
  function draftSet(key, val) { try { localStorage.setItem("cs2opt-draft:" + key, JSON.stringify(val)) } catch (e) {} }
  function draftGet(key, fallback) { try { const v = localStorage.getItem("cs2opt-draft:" + key); return v ? JSON.parse(v) : fallback } catch (e) { return fallback } }
  function draftClear() { Object.keys(localStorage).filter(function (k) { return k.indexOf("cs2opt-draft:") === 0 }).forEach(function (k) { localStorage.removeItem(k) }) }
  function draftSummary() {
    var n = draftGet("nv", []); var s = draftGet("sys", []); var c = draftGet("crosshair", null); var k = draftGet("controls", null); var l = draftGet("launch", "")
    return { nv: n, sys: s, crosshair: c, controls: k, launch: l }
  }

  function writeAutoexecBlock(tag, lines) {
    return U.call(window.api.cs2.writeAutoexecBlock(tag, lines))
  }

  function fmtBytes(mb) {
    if (mb === null || mb === undefined) return '—'
    return mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB'
  }

  function openSettings(uri) { return U.call(window.api.system.openExternal(uri)) }

  return { h: h, clear: clear, call: call, toast: toast, copy: copy, writeAutoexecBlock: writeAutoexecBlock, fmtBytes: fmtBytes, openSettings: openSettings, draftSet: draftSet, draftGet: draftGet, draftClear: draftClear, draftSummary: draftSummary }
})()