/* 路由与导航 */
(function () {
  var ROUTES = [
    { group: '开始', items: [{ id: 'home', icon: '🏠', name: '概览与一键实施' }] },
    { group: '调优', items: [
      { id: 'device', icon: '🔧', name: '设备调整' },
      { id: 'game', icon: '🎯', name: '游戏设置调整' }
    ] },
    { group: '其他', items: [{ id: 'settings', icon: '⚙️', name: '路径与关于' }] }
  ]


  var nav = document.getElementById('nav')
  ROUTES.forEach(function (g) {
    nav.appendChild(U.h('div', { class: 'nav-group' }, g.group))
    g.items.forEach(function (it) {
      nav.appendChild(U.h('div', {
        class: 'nav-item', id: 'nav-' + it.id,
        onclick: function () { location.hash = it.id }
      }, [U.h('span', { class: 'nav-icon' }, it.icon), it.name]))
    })
  })

  function setChips(chips) {
    var box = document.getElementById('status-chips')
    U.clear(box)
    ;(chips || []).forEach(function (c) {
      box.appendChild(U.h('span', { class: 'chip ' + (c.type || '') }, c.text))
    })
  }

  var current = null
  function go(id) {
    var page = window.PAGES[id] || window.PAGES.home
    id = window.PAGES[id] ? id : 'home'
    if (current) { nav.querySelector('.active') && nav.querySelector('.active').classList.remove('active') }
    var navEl = document.getElementById('nav-' + id)
    if (navEl) navEl.classList.add('active')
    document.getElementById('page-title').textContent = page.title || id
    document.getElementById('page-sub').textContent = page.sub || ''
    setChips(page.chips || [])
    U.clear(document.getElementById('view'))
    page.render(document.getElementById('view'), setChips)
    current = id
  }

  window.addEventListener('hashchange', function () { go(location.hash.slice(1) || 'home') })
  window.refreshCurrent = function () { go(current || 'home') }
  go((location.hash || '#home').slice(1))
})()