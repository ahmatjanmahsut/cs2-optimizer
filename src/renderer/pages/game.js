/* 游戏设置调整（单页版）：准星+持枪参数+操控+按键绑定+启动项，一次性输出到自定义 cfg */
window.PAGES = window.PAGES || {}
window.PAGES.game = {
  title: '游戏设置调整',
  sub: '在同一页面完成全部游戏内设置；底部一键输出到 CS2 的 cfg 目录（文件名可自定义，启动项自动附带 +exec）',
  render: function (view) {
    var BT = String.fromCharCode(96) /* 反引号键名 */
    /* ---------- 共享状态 ---------- */
    var DEF_CROSS = { style: 1, size: 4, gap: -3, thickness: 1, outline: 1, outlineth: 1, alpha: 255, r: 0, g: 205, b: 50, dot: 0, t: 0 }
    var DEF_VIEW = { sens: 1.6, dpi: 800, zoom: 1.0, width: 1, tracer: 1 }
    var DEF_CTRL = { m_pitch: 0.022, m_yaw: 0.022, fps_max: 0, fps_max_menu: 120, rate: 786432, radar_scale: 0.5 }
    var DEF_CONV = {
      wheeljump: true,
      jumpthrow: true, jumpthrowKey: 'v',
      fullbuy: true, fullbuyKey: 'F1',
      armorkit: true, armorkitKey: 'F2',
      nades: true, nadesKey: 'F6',
      eco: true, ecoKey: 'F7',
      netgraph: true, netgraphKey: 'F8'
    }
    var saved = U.draftGet('game-state', null)
    var G = {
      cross: Object.assign({}, DEF_CROSS, saved && saved.cross || {}),
      view: Object.assign({}, DEF_VIEW, saved && saved.view || {}),
      ctrl: Object.assign({}, DEF_CTRL, saved && saved.ctrl || {}),
      tog: Object.assign({ autohelp: true, showhelp: true, teamids: false, nomsg: false }, saved && saved.tog || {}),
      conv: Object.assign({}, DEF_CONV, saved && saved.conv || {}),
      keys: Object.assign({}, saved && saved.keys || {}),
      launch: Object.assign({ novid: true, fullscreen: true, refresh: false, refreshVal: '240', vulkan: false, high: false }, saved && saved.launch || {}),
      file: (saved && saved.file) || 'cs2tuner'
    }
    var PRESETS = {
      '经典细绿十字（推荐）': { style: 1, size: 4, gap: -3, thickness: 1, outline: 1, outlineth: 1, alpha: 255, r: 0, g: 205, b: 50, dot: 0, t: 0 },
      'T 型静态': { style: 1, size: 12, gap: 0, thickness: 2, outline: 1, outlineth: 1, alpha: 255, r: 0, g: 255, b: 0, dot: 0, t: 1 },
      '中心圆点': { style: 1, size: 0, gap: 0, thickness: 1.5, outline: 0, outlineth: 0, alpha: 255, r: 255, g: 255, b: 0, dot: 1, t: 0 },
      '红色高可见': { style: 1, size: 6, gap: -2, thickness: 2, outline: 1, outlineth: 2, alpha: 255, r: 255, g: 60, b: 60, dot: 0, t: 0 },
      '极简青色': { style: 1, size: 3, gap: -2, thickness: 1, outline: 0, outlineth: 0, alpha: 255, r: 77, g: 255, b: 255, dot: 0, t: 0 }
    }

    /* ---------- 布局骨架 ---------- */
    var proBox = U.h('div', { class: 'card', style: 'margin-bottom:16px' }, [U.h('h3', {}, '⭐ 职业哥预设（排名前 20 选手 · 数据抓取自 prosettings.net）')])
    view.appendChild(proBox)
    if (window.PRO) window.PRO.render(proBox, function (p) { applyPro(p) })
    function applyPro(p) {
      var e = window.PRO.toEditor(p)
      Object.keys(e.cross).forEach(function (k) { G.cross[k] = e.cross[k] })
      Object.keys(e.view).forEach(function (k) { if (e.view[k] != null) G.view[k] = e.view[k] })
      if (e.ctrl.fps_max != null) G.ctrl.fps_max = e.ctrl.fps_max
      if (e.ctrl.radar_scale != null) G.ctrl.radar_scale = e.ctrl.radar_scale
      refresh()
    }

    var s1 = U.h('div', { class: 'grid c2' })
    view.appendChild(sectionTitle('① 准星调校（实时预览）'))
    view.appendChild(s1)
    view.appendChild(U.h('div', { style: 'height:16px' }))
    view.appendChild(sectionTitle('② 持枪与鼠标参数'))
    var s2 = U.h('div', {})
    view.appendChild(s2)
    view.appendChild(U.h('div', { style: 'height:16px' }))
    view.appendChild(sectionTitle('③ 操控与性能参数'))
    var s3 = U.h('div', { class: 'grid c2' })
    view.appendChild(s3)
    view.appendChild(U.h('div', { style: 'height:16px' }))
    view.appendChild(sectionTitle('④ 按键绑定与便捷功能（一键跳投 / 滚轮跳 / 购买脚本 / 全动作改键）'))
    var s4 = U.h('div', { class: 'grid c2' })
    view.appendChild(s4)
    view.appendChild(U.h('div', { style: 'height:16px' }))
    view.appendChild(sectionTitle('⑤ 输出与生效（cfg + 启动项）'))
    var s5 = U.h('div', { class: 'grid c2' })
    view.appendChild(s5)

    function sectionTitle(t) { return U.h('div', { class: 'muted', style: 'font-size:13px;font-weight:600;margin:4px 0 8px;color:var(--accent)' }, t) }
    var binders = []
    function ctl(label, node, note) {
      var val = U.h('span', { class: 'muted' })
      binders.push({ key: node.dataset.key, group: node.dataset.group, val: val, node: node })
      var row = U.h('div', { class: 'slider-row' }, [U.h('span', {}, label), node, val])
      if (note) {
        var wrap = U.h('div', { class: 'param-block' })
        wrap.appendChild(row)
        wrap.appendChild(U.h('div', { class: 'param-note' }, note))
        return wrap
      }
      return row
    }
    function rng(group, key, min, max, step, note, label) {
      var inp = U.h('input', { type: 'range', min: min, max: max, step: step })
      inp.dataset.key = key; inp.dataset.group = group
      inp.addEventListener('input', function () { G[group][key] = Number(inp.value); refresh() })
      return ctl(label || key, inp, note)
    }
    function sel(group, key, opts, label, note) {
      var s = U.h('select', { style: 'min-width:190px' })
      s.dataset.key = key; s.dataset.group = group
      opts.forEach(function (o) { s.appendChild(U.h('option', { value: o[0] }, o[1])) })
      s.addEventListener('change', function () { G[group][key] = Number(s.value); refresh() })
      return ctl(label || key, s, note)
    }

    /* ---------- ① 准星 ---------- */
    var leftC = U.h('div', { class: 'card' }, [U.h('h3', {}, '🛠️ 准星参数')])
    var presetSel = U.h('select', { style: 'min-width:190px' })
    Object.keys(PRESETS).forEach(function (n) { presetSel.appendChild(U.h('option', { value: n }, n)) })
    presetSel.addEventListener('change', function () {
      var p = PRESETS[presetSel.value]
      Object.keys(p).forEach(function (k) { G.cross[k] = p[k] })
      refresh()
    })
    leftC.appendChild(ctl('预设', presetSel, '常用样式一键套用，套用后仍可微调'))
    leftC.appendChild(sel('cross', 'style', [[0, '0 动态'], [1, '1 静态（推荐）'], [2, '2 倾斜'], [3, '3 精确'], [4, '4 静态精确']], '样式', '竞技最常用静态类（1/4）：准星不随移动、射击扩散，永远指哪打哪；0 动态会随状态膨胀，新手容易误判弹道'))
    leftC.appendChild(rng('cross', 'size', 0, 20, 0.5, '十字臂长度。职业哥普遍 2~4：够看清、又不挡远处人头；6 以上容易遮住目标', '大小'))
    leftC.appendChild(rng('cross', 'gap', -10, 10, 0.5, '十字中心空隙。负值让四条臂向中心收拢甚至交汇；-2~2 最常见，空隙太大瞄头困难', '间距'))
    leftC.appendChild(rng('cross', 'thickness', 0.5, 6, 0.5, '线条粗细。1~2 最主流；太粗会挡住远距离敌人的头部命中区', '粗细'))
    leftC.appendChild(sel('cross', 'outline', [[0, '关'], [1, '开（新手推荐）']], '描边', '黑色描边保证准星在亮/暗任何背景下都清晰可见，强烈建议新手开启'))
    leftC.appendChild(rng('cross', 'outlineth', 0, 3, 1, '描边粗细，1 已足够；过大会让准星显得笨重', '描边宽'))
    leftC.appendChild(rng('cross', 'alpha', 0, 255, 5, '不透明度。255=全实；150~200 半透明可减少对画面的遮挡，看个人喜好', '透明度'))
    leftC.appendChild(sel('cross', 'dot', [[0, '关'], [1, '开']], '中心点', '中心加一个小点：腰射（不开镜扫射）定位更准，代价是画面中心多一个像素点'))
    leftC.appendChild(sel('cross', 't', [[0, '关'], [1, '开（去上竖线）']], 'T 型', '去掉上竖线成 T 字形：枪口上方视野更干净，狙击手和爆头线玩家常用'))
    var colIn = U.h('input', { type: 'color', style: 'width:80px;height:32px' })
    colIn.addEventListener('input', function () {
      var m = colIn.value.match(/^#(..)(..)(..)$/)
      if (m) { G.cross.r = parseInt(m[1], 16); G.cross.g = parseInt(m[2], 16); G.cross.b = parseInt(m[3], 16); refresh() }
    })
    leftC.appendChild(ctl('颜色', colIn, '绿色/青色/黄色在 CS2 各地图可见度最好；避免与地图色调或敌人皮肤接近的颜色'))

    var cv = U.h('canvas', { width: '300', height: '300', style: 'border-radius:10px;border:1px solid #2a3140;max-width:100%;cursor:crosshair' })
    var ctxBg = [28, 38, 48]
    var rightC = U.h('div', { class: 'card' }, [
      U.h('h3', {}, '👀 准星预览'),
      cv,
      U.h('div', { class: 'row', style: 'margin-top:8px' }, [
        U.h('button', { class: 'btn', onclick: function () {
          var list = [[28, 38, 48], [64, 64, 64], [200, 190, 170], [30, 90, 40], [15, 15, 18]]
          for (var i = 0; i < list.length; i++) { if (list[i][0] === ctxBg[0] && list[i][1] === ctxBg[1]) { ctxBg = list[(i + 1) % list.length]; break } }
          drawCross()
        } }, '换背景'),
        U.h('span', { class: 'muted' }, '模拟近似，游戏内以控制台效果为准')
      ])
    ])
    s1.appendChild(leftC); s1.appendChild(rightC)

    function drawCross() {
      var ctx = cv.getContext('2d')
      var W = cv.width, H = cv.height, S = G.cross
      ctx.fillStyle = 'rgb(' + ctxBg.join(',') + ')'; ctx.fillRect(0, 0, W, H)
      var u = 3, cx = W / 2, cy = H / 2
      var th = Math.max(0.5, S.thickness * u * 0.6)
      var inner = Math.max(0, (S.gap + 1.5) * u)
      var len = S.size * u * 0.8 + inner * 0.25
      ctx.globalAlpha = S.alpha / 255
      function arm(x1, y1, x2, y2) {
        if (S.outline) { ctx.strokeStyle = '#000'; ctx.lineWidth = th + S.outlineth * u * 0.8; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
        ctx.strokeStyle = 'rgb(' + S.r + ',' + S.g + ',' + S.b + ')'; ctx.lineWidth = th
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
      if (!S.t) arm(cx, cy - inner, cx, cy - inner - len)
      arm(cx, cy + inner, cx, cy + inner + len)
      arm(cx - inner, cy, cx - inner - len, cy)
      arm(cx + inner, cy, cx + inner + len, cy)
      if (S.dot) { ctx.fillStyle = 'rgb(' + S.r + ',' + S.g + ',' + S.b + ')'; ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, th * 0.7), 0, 7); ctx.fill() }
      ctx.globalAlpha = 1
    }

    /* ---------- ② 持枪与鼠标参数 ---------- */
    var leftV = U.h('div', { class: 'card' }, [U.h('h3', {}, '🎛️ 持枪 / 开镜 / 鼠标')])
    leftV.appendChild(rng('view', 'sens', 0.2, 4, 0.05, '游戏内灵敏度，与鼠标 DPI 相乘 = eDPI（职业哥大多在 600~1200）。建议 400DPI×1.5~2.5 或 800DPI×0.75~1.25 起步，固定练一周再微调，忌频繁更换', '灵敏度 sensitivity'))
    leftV.appendChild(rng('view', 'dpi', 100, 4000, 50, '鼠标驱动里的 DPI 档位（罗技 G HUB / 雷蛇雷云等软件中查看），只影响 eDPI 计算展示', '鼠标 DPI'))
    leftV.appendChild(rng('view', 'zoom', 0.5, 1.5, 0.05, 'zoom_sensitivity_ratio_mouse：开镜（AWP/鸟狙）后的灵敏度系数。默认 1；调 0.8~0.9 开镜微调更稳，甩狙流可保持 1', '开镜灵敏度'))
    leftV.appendChild(rng('view', 'width', 1, 5, 1, 'cl_crosshair_sniper_width：开镜准星线宽。1 默认最精细；2~3 疲劳时更易看清；5 最粗但遮挡视野', '狙击准星宽度'))
    leftV.appendChild(sel('view', 'tracer', [[1, '显示（默认）'], [0, '关闭']], '第一人称曳光', 'r_drawtracers_firstperson：自己开枪时是否画出弹道曳光。关闭可减少画面干扰（部分玩家觉得更干净），纯个人偏好，不影响弹道', '曳光弹'))
    s2.appendChild(leftV)

    /* ---------- ③ 操控与性能 ---------- */
    var ctrlCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '🧪 参数')])
    ctrlCard.appendChild(rng('ctrl', 'm_pitch', 0.01, 0.033, 0.001, '垂直视角转动系数（上下看的速度）。默认 0.022，职业哥几乎无人改动；改它会彻底改变压枪手感，新手保持默认', 'm_pitch'))
    ctrlCard.appendChild(rng('ctrl', 'm_yaw', 0.01, 0.033, 0.001, '水平视角转动系数（左右看的速度）。与 m_pitch 相等 = 上下左右 1:1 均匀手感（默认推荐）；老 CS 玩家有 0.022/0.0178 的非对称流派，新手别碰', 'm_yaw'))
    ctrlCard.appendChild(rng('ctrl', 'fps_max', 0, 400, 10, '帧率上限。0 = 不限制（输入延迟最低，推荐）；配置吃紧或发热大的机器可设为“刷新率 + 5”（如 165Hz 屏设 170），帧数波动更小', 'fps_max'))
    ctrlCard.appendChild(rng('ctrl', 'fps_max_menu', 60, 360, 10, '主菜单/大厅界面的帧率上限，不影响对局内帧数。设 120~144 可在挂大厅时省电降温', 'fps_max_menu'))
    ctrlCard.appendChild(rng('ctrl', 'rate', 0, 786432, 16384, '网络带宽上限（字节/秒）。国内宽带直接保持 786432（CS2 推荐值）；设太小会丢包、出现 choke/loss 卡顿', 'rate'))
    ctrlCard.appendChild(rng('ctrl', 'radar_scale', 0.25, 1, 0.05, 'cl_radar_scale：雷达地图缩放。推荐 0.35~0.5——雷达更小、敌人图标相对更清晰；默认 0.7 偏大且挡视野', '雷达缩放'))
    var togCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '🧷 常用开关')])
    var TOG = {
      autohelp: ['cl_autohelp 0', '关闭自动提示气泡（“按 E 拾取”之类的教学弹窗）'],
      showhelp: ['cl_showhelp 0', '关闭左上角新手帮助文字'],
      teamids: ['cl_drawhud_force_teamids_overhead 1', '队友头顶 ID 常显，报点沟通更直观'],
      nomsg: ['cl_no_420msg 1', '屏蔽部分击杀提示刷屏（娱乐向）']
    }
    Object.keys(TOG).forEach(function (k) {
      var cb = U.h('input', { type: 'checkbox' })
      cb.checked = !!G.tog[k]
      cb.addEventListener('change', function () { G.tog[k] = cb.checked; refresh() })
      togCard.appendChild(U.h('label', { class: 'check-row' }, [cb, U.h('span', {}, [U.h('b', {}, TOG[k][0]), U.h('div', { class: 'muted' }, TOG[k][1])])]))
    })
    s3.appendChild(ctrlCard); s3.appendChild(togCard)

    /* ---------- ④ 按键绑定与便捷功能 ---------- */
    var KEY_RE = /^(?:[a-z0-9]|f[1-9]|f1[0-2]|space|ctrl|shift|alt|tab|escape|del|ins|home|end|pgup|pgdn|left|right|up|down|mouse[1-5]|mwheelup|mwheeldown|kp_[a-z0-9_]+|[\-,.=;[\]\\/])$/i
    function validKey(k) {
      k = String(k || '').trim()
      if (!k) return false
      return KEY_RE.test(k)
    }
    var convCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '✨ 便捷功能（勾选即写入 cfg）')])
    function convRow(id, name, note, withKey, keyProp) {
      var cb = U.h('input', { type: 'checkbox' })
      cb.checked = !!G.conv[id]
      cb.addEventListener('change', function () { G.conv[id] = cb.checked; refresh() })
      var kids = [cb, U.h('span', { style: 'flex:1' }, [U.h('b', {}, name), U.h('div', { class: 'muted' }, note)])]
      if (withKey) {
        var kin = U.h('input', { type: 'text', value: G.conv[keyProp] || '', style: 'width:86px', placeholder: '按键' })
        kin.addEventListener('input', function () {
          G.conv[keyProp] = kin.value.trim()
          kin.style.borderColor = validKey(kin.value) || !kin.value ? '' : 'var(--err)'
          refresh()
        })
        kids.push(kin)
      }
      convCard.appendChild(U.h('label', { class: 'check-row' }, kids))
    }
    convRow('wheeljump', '滚轮跳', '滚轮上下都映射为跳跃（bunny-hop/连跳主流玩法，完全合规）。会覆盖默认的滚轮切枪。', false)
    convRow('jumpthrow', '一键跳投', '跳起瞬间自动出手雷：烟/闪/火抛物线稳定一致。默认键 v 会覆盖“径向无线电2”（默认极少用），可自定义。', true, 'jumpthrowKey')
    convRow('fullbuy', '一键全装购买', '主武器（AK/M4 按阵营自动生效）+ 甲盔 + 拆弹器 + 全套投掷物，开局秒买。', true, 'fullbuyKey')
    convRow('armorkit', '一键甲+拆弹器', '只买护甲头盔和拆弹器（半起局/手枪局常用）。', true, 'armorkitKey')
    convRow('nades', '一键投掷物套装', '雷/闪/烟/燃烧/诱饵弹一次买齐。F6 默认是单机存档（联机无用），可放心覆盖。', true, 'nadesKey')
    convRow('eco', '一键 eco 局', '沙鹰 + 半甲，经济局快速起装。F7 默认是单机读档（联机无用）。', true, 'ecoKey')
    convRow('netgraph', '网络状态图开关', '按一下显示/隐藏实时网络图（loss、choke、ping），排查卡顿时用。', true, 'netgraphKey')
    convCard.appendChild(U.h('div', { class: 'section-note', style: 'margin-top:10px', html:
      '键名支持：字母/数字、F1~F12、SPACE、CTRL、SHIFT、ALT、MOUSE1~5（侧键4/5）、MWHEELUP/DOWN、鼠标中键=MOUSE3。非法键名输入框会标红且<b>不会写入</b>。所有绑定都会覆盖同名键的默认功能，介意的话改个键即可。' }))
    var actCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '⌨️ 全动作改键（高级，默认键位来自当前版本游戏文件）')])
    var KEY_ACTIONS = [
      ['移动', [
        ['+forward', '前进', 'w'], ['+back', '后退', 's'], ['+left', '左移', 'a'], ['+right', '右移', 'd'],
        ['+jump', '跳跃', 'SPACE'], ['+duck', '蹲下', 'CTRL'], ['+sprint', '静步（消脚步声）', 'SHIFT']
      ]],
      ['战斗', [
        ['+attack', '开火', 'MOUSE1'], ['+attack2', '副开火（开镜/消音）', 'MOUSE2'], ['+reload', '换弹', 'r'],
        ['+lookatweapon', '检视武器', 'f'], ['drop', '丢枪', 'g'], ['switchhands', '左右手持枪互换', 'h'], ['lastinv', '切回上一把武器', 'q']
      ]],
      ['武器槽', [
        ['slot1', '主武器', '1'], ['slot2', '手枪', '2'], ['slot3', '刀', '3'], ['slot4', '投掷物（循环）', '4'], ['slot5', 'C4', '5']
      ]],
      ['购买', [
        ['buymenu', '打开购买菜单', 'b'], ['autobuy', '自动购买', 'F3'], ['rebuy', '重买上局装备', 'F4'],
        ['buyammo1', '买主武器弹药', ','], ['buyammo2', '买副武器弹药', '.']
      ]],
      ['沟通', [
        ['+voicerecord', '按住说话（语音）', 'MOUSE4'], ['radio', '无线电菜单', 'z'], ['+radialradio', '径向无线电', 'c'],
        ['+radialradio2', '径向无线电 2', 'v'], ['player_ping', '标记 ping 点', 'MOUSE3'],
        ['messagemode', '队伍打字', 'y'], ['messagemode2', '全局打字', 'u']
      ]],
      ['系统', [
        ['+showscores', '计分板', 'TAB'], ['+spray_menu', '喷漆菜单', 't'], ['toggleconsole', '开发者控制台', BT],
        ['teammenu', '换队伍菜单', 'm'], ['show_loadout_toggle', '装备面板显示', 'i'], ['sellbackall', '出售全部（死亡竞赛）', 'DEL']
      ]]
    ]
    var actBody = U.h('div', { style: 'max-height:420px;overflow-y:auto' })
    actCard.appendChild(actBody)
    actCard.appendChild(U.h('div', { class: 'param-note', style: 'margin-top:8px' }, '勾选行并在“新键”填入键名，即生成 bind 覆盖该动作；留空或不勾选则保持游戏默认。改键不影响未勾选的其它绑定。'))
    KEY_ACTIONS.forEach(function (grp) {
      actBody.appendChild(U.h('div', { class: 'muted', style: 'margin:10px 0 4px;font-weight:600' }, grp[0]))
      grp[1].forEach(function (a) {
        var cmd = a[0], label = a[1], defKey = a[2]
        var cb = U.h('input', { type: 'checkbox' })
        var kin = U.h('input', { type: 'text', placeholder: '新键', style: 'width:90px' })
        var st = G.keys[cmd]
        if (st && typeof st === 'object') { cb.checked = !!st.on; kin.value = st.key || '' }
        function persistRow() {
          if (!cb.checked && !kin.value.trim()) { delete G.keys[cmd]; refresh(); return }
          G.keys[cmd] = { on: cb.checked, key: kin.value.trim() }
          kin.style.borderColor = !kin.value.trim() || validKey(kin.value) ? '' : 'var(--err)'
          refresh()
        }
        cb.addEventListener('change', persistRow)
        kin.addEventListener('input', persistRow)
        actBody.appendChild(U.h('div', { class: 'bind-row' }, [
          cb,
          U.h('span', { style: 'flex:1' }, [U.h('b', {}, label), U.h('span', { class: 'muted' }, '  ' + cmd)]),
          U.h('span', { class: 'tag', style: 'min-width:76px;text-align:center' }, '默认 ' + defKey),
          kin
        ]))
      })
    })
    s4.appendChild(convCard); s4.appendChild(actCard)

    /* ---------- ⑤ 输出与生效 ---------- */
    var outCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '📄 生成 cfg 文件')])
    var nameIn = U.h('input', { type: 'text', value: G.file, style: 'min-width:200px' })
    nameIn.addEventListener('input', function () {
      G.file = nameIn.value.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64)
      refresh()
    })
    outCard.appendChild(U.h('div', { class: 'row', style: 'margin-bottom:8px' }, [U.h('b', {}, 'cfg 文件名'), nameIn, U.h('span', { class: 'muted' }, '.cfg')]))
    outCard.appendChild(U.h('div', { class: 'muted', style: 'margin-bottom:8px', html: '写入位置：CS2 安装目录 <b>game\\csgo\\cfg\\</b>（自动备份旧文件；选 autoexec 时以标记块合并，不破坏你原有内容）' }))
    var cfgPre = U.h('pre', { class: 'cmdbox', style: 'max-height:340px;overflow:auto' })
    outCard.appendChild(cfgPre)
    outCard.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
      mkB('💾 写入 cfg 目录', function () { return writeOut() }, 'primary'),
      mkB('📋 复制全部内容', function () { return U.copy(cfgPre.textContent, '已复制') }),
      mkB('📂 打开 cfg 目录', function () { return U.call(window.api.cs2.openCfgFolder()) })
    ]))

    var launchCard = U.h('div', { class: 'card' }, [U.h('h3', {}, '🚀 Steam 启动项（自动包含 +exec）')])
    var LP = [
      ['novid', '-novid', '跳过开场动画', true],
      ['fullscreen', '-fullscreen', '独占全屏：帧数稳、延迟低', true],
      ['refresh', null, '强制刷新率（数字改成你的显示器上限）', false],
      ['vulkan', '-vulkan', 'Vulkan 渲染：仅老驱动可试，RTX 建议默认', false],
      ['high', '-high', '高优先级：社区实测收益小甚至负优化', false]
    ]
    LP.forEach(function (o) {
      var cb = U.h('input', { type: 'checkbox' })
      cb.checked = !!G.launch[o[0]]
      cb.addEventListener('change', function () { G.launch[o[0]] = cb.checked; refresh() })
      launchCard.appendChild(U.h('label', { class: 'check-row' }, [cb, U.h('span', {}, [U.h('b', {}, o[1] || '-refresh'), '  ' + o[2]])]))
    })
    var refreshIn = U.h('input', { type: 'text', value: G.launch.refreshVal, style: 'width:80px' })
    refreshIn.addEventListener('input', function () { G.launch.refreshVal = refreshIn.value; refresh() })
    launchCard.appendChild(U.h('div', { class: 'row', style: 'padding:8px 10px' }, [U.h('span', { class: 'muted' }, '刷新率数值：'), refreshIn]))
    var launchPre = U.h('pre', { class: 'cmdbox', style: 'margin-top:8px' })
    launchCard.appendChild(launchPre)
    launchCard.appendChild(U.h('div', { class: 'row', style: 'margin-top:10px' }, [
      mkB('📋 复制启动项', function () { return U.copy(launchPre.textContent, '已复制：Steam 库→CS2→属性→通用→启动选项 粘贴') }),
      mkB('🎮 打开 Steam 游戏列表', function () { return U.call(window.api.system.openExternal('steam://open/games')).then(function () { U.toast('已尝试打开 Steam') }) })
    ]))
    launchCard.appendChild(U.h('div', { class: 'section-note', style: 'margin-top:10px', html:
      '<b>+exec 已自动生成</b>：改了 cfg 文件名后启动项同步更新。启动项由 Steam 保管（粘贴一次永久生效），cfg 文件由本工具写入——两者配套使用，按键绑定才能在游戏里生效。' }))
    s5.appendChild(outCard); s5.appendChild(launchCard)

    function mkB(name, fn, cls) {
      var busy = false
      return U.h('button', { class: 'btn ' + (cls || ''), onclick: function () {
        if (busy) return; busy = true
        Promise.resolve(fn()).then(function () {}, function () {}).then(function () { busy = false })
      } }, name)
    }

    /* ---------- 汇总与刷新 ---------- */
    function crossLines() {
      var S = G.cross
      return ['cl_crosshairstyle ' + S.style, 'cl_crosshairsize ' + S.size, 'cl_crosshairgap ' + S.gap,
        'cl_crosshairthickness ' + S.thickness, 'cl_crosshairdot ' + S.dot, 'cl_crosshair_t ' + S.t,
        'cl_crosshair_drawoutline ' + S.outline, 'cl_crosshair_outlinethickness ' + S.outlineth,
        'cl_crosshairuse_alpha 1', 'cl_crosshairalpha ' + S.alpha, 'cl_crosshaircolor 5',
        'cl_crosshaircolor_r ' + S.r, 'cl_crosshaircolor_g ' + S.g, 'cl_crosshaircolor_b ' + S.b]
    }
    function viewLines() {
      var V = G.view
      return ['sensitivity ' + V.sens, 'zoom_sensitivity_ratio_mouse ' + V.zoom,
        'cl_crosshair_sniper_width ' + V.width, 'r_drawtracers_firstperson ' + V.tracer]
    }
    function ctrlLines() {
      var C = G.ctrl
      return ['m_pitch ' + C.m_pitch, 'm_yaw ' + C.m_yaw, 'fps_max ' + C.fps_max,
        'fps_max_menu ' + C.fps_max_menu, 'rate ' + C.rate, 'cl_radar_scale ' + C.radar_scale]
    }
    function togLines() {
      var out = []
      Object.keys(TOG).forEach(function (k) { if (G.tog[k]) out.push(TOG[k][0]) })
      return out
    }
    function bindLines() {
      var out = []
      var C = G.conv
      if (C.wheeljump) { out.push('bind "mwheelup" "+jump"'); out.push('bind "mwheeldown" "+jump"') }
      if (C.jumpthrow && validKey(C.jumpthrowKey)) {
        out.push('alias "+jumpaction" "+jump;"')
        out.push('alias "+attackaction" "+attack;"')
        out.push('alias "-jumpaction" "-jump"')
        out.push('alias "-attackaction" "-attack"')
        out.push('alias "+jumpthrow" "+jumpaction;+attackaction"')
        out.push('alias "-jumpthrow" "-jumpaction;-attackaction"')
        out.push('bind "' + C.jumpthrowKey + '" "+jumpthrow"')
      }
      if (C.fullbuy && validKey(C.fullbuyKey)) out.push('bind "' + C.fullbuyKey + '" "buy ak47; buy m4a1_silencer; buy m4a1; buy vesthelm; buy defuser; buy hegrenade; buy flashbang; buy smokegrenade; buy molotov; buy incgrenade"')
      if (C.armorkit && validKey(C.armorkitKey)) out.push('bind "' + C.armorkitKey + '" "buy vesthelm; buy defuser"')
      if (C.nades && validKey(C.nadesKey)) out.push('bind "' + C.nadesKey + '" "buy hegrenade; buy flashbang; buy smokegrenade; buy molotov; buy incgrenade; buy decoy"')
      if (C.eco && validKey(C.ecoKey)) out.push('bind "' + C.ecoKey + '" "buy deagle; buy vest"')
      if (C.netgraph && validKey(C.netgraphKey)) out.push('bind "' + C.netgraphKey + '" "toggle cq_netgraph 0 1"')
      Object.keys(G.keys).forEach(function (cmd) {
        var st = G.keys[cmd]
        if (st && st.on && st.key && validKey(st.key)) out.push('bind "' + st.key + '" "' + cmd + '"')
      })
      return out
    }
    function allLines() {
      var binds = bindLines()
      return ['// 由 CS2 优化助手生成 · ' + new Date().toLocaleDateString('zh-CN'), '']
        .concat(['// —— 准星 ——'], crossLines(), [''], ['// —— 持枪与鼠标 ——'], viewLines(), [''], ['// —— 操控与性能 ——'], ctrlLines())
        .concat(togLines().length ? [''].concat(togLines()) : [])
        .concat(binds.length ? ['', '// —— 按键绑定与便捷功能 ——'].concat(binds) : [])
    }
    function launchString() {
      var parts = ['+exec ' + (G.file || 'cs2tuner')]
      if (G.launch.novid) parts.push('-novid')
      if (G.launch.fullscreen) parts.push('-fullscreen')
      if (G.launch.refresh) parts.push('-refresh ' + (G.launch.refreshVal || '240'))
      if (G.launch.vulkan) parts.push('-vulkan')
      if (G.launch.high) parts.push('-high')
      return parts.join(' ')
    }
    function refresh() {
      binders.forEach(function (b) {
        if (!b.key) return
        var v = G[b.group][b.key]
        if (b.node.type === 'range') b.node.value = v
        else if (b.node.tagName === 'SELECT') b.node.value = String(v)
        b.val.textContent = v
      })
      colIn.value = hex()
      cfgPre.textContent = allLines().join('\n')
      launchPre.textContent = launchString()
      drawCross()
      U.draftSet('game-state', G)
      U.draftSet('game', { file: (G.file || 'cs2tuner') + '.cfg', lines: allLines().filter(function (l) { return l !== '' }), launch: launchPre.textContent })
    }
    function hex() {
      function hx(n) { var s = Number(n).toString(16); return s.length === 1 ? '0' + s : s }
      return '#' + hx(G.cross.r) + hx(G.cross.g) + hx(G.cross.b)
    }
    async function writeOut() {
      var name = (G.file || 'cs2tuner') + '.cfg'
      var r = await U.call(window.api.cs2.writeBlock(name, 'GAME', allLines()))
      U.toast('已写入 ' + (r.name || name) + (r.backup ? '（原文件已备份）' : ''))
      return r
    }
    refresh()
  }
}
