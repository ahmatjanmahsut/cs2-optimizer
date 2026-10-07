'use strict'
const { ps } = require('./powershell')

const HP_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' // 高性能
const GUID_RE = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/

async function getPlans() {
  const out = await ps('powercfg /list')
  const plans = []
  for (const line of String(out).split(/\r?\n/)) {
    const gm = line.match(GUID_RE)
    if (!gm) continue
    const nm = (line.match(/\(([^)]+)\)/) || [])[1] || '未命名方案'
    plans.push({
      guid: gm[1].toLowerCase(),
      name: nm.trim(),
      active: line.trim().indexOf('*') === 0
    })
  }
  return plans
}

async function getActive() {
  const out = await ps('powercfg /getactivescheme')
  const gm = out.match(GUID_RE)
  const name = (out.match(/\(([^)]+)\)/) || [])[1] || out
  return { guid: gm ? gm[1].toLowerCase() : null, name: name.trim(), raw: out }
}

async function setActive(guid) {
  if (!GUID_RE.test(String(guid))) throw new Error('非法的电源方案 GUID')
  await ps('powercfg /setactive ' + String(guid).toLowerCase())
  return getActive()
}

async function ensureHighPerformance() {
  const before = await getActive()
  let plans = await getPlans()
  let target = null
  for (const p of plans) {
    if (p.guid === HP_GUID || /高性能|high\s*performance/i.test(p.name)) { target = p; break }
  }
  if (!target) {
    await ps('powercfg -duplicatescheme ' + HP_GUID)
    plans = await getPlans()
    for (const p of plans) {
      if (/高性能|high\s*performance/i.test(p.name)) { target = p; break }
    }
  }
  if (!target) throw new Error('系统未提供“高性能”电源计划（可能被品牌电源管理软件接管），请手动检查 powercfg /list')
  const after = await setActive(target.guid)
  return { before, after, plan: target }
}

async function getStatus() {
  const [active, plans] = await Promise.all([getActive(), getPlans()])
  return { active, plans }
}

module.exports = { getPlans, getActive, setActive, ensureHighPerformance, getStatus }
