// Status bar and shade rules. Run: node --test lib/os/phone-shade.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function load() {
  const source = fs.readFileSync(path.join(__dirname, 'phone-shade.ts'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', code)(require, loaded, loaded.exports)
  return loaded.exports
}

test('the shade opens past 35% or on a downward fling, else springs back', () => {
  const { settleShade } = load()
  assert.equal(settleShade(0.34, 0), 'closed')
  assert.equal(settleShade(0.35, 0), 'open')
  assert.equal(settleShade(0.1, 0.9), 'open', 'a quick flick down opens even a short pull')
  assert.equal(settleShade(0.9, -0.9), 'closed', 'a quick flick up closes even a long pull')
})

test('progress follows the finger and stays in 0..1', () => {
  const { dragProgress } = load()
  assert.equal(dragProgress(150, 300), 0.5)
  assert.equal(dragProgress(-20, 300), 0)
  assert.equal(dragProgress(900, 300), 1)
})

test('velocity uses only recent samples, so a pause before lifting is slow', () => {
  const { velocityOf } = load()
  assert.equal(velocityOf([{ t: 0, y: 0 }, { t: 40, y: 40 }]), 1)
  assert.equal(velocityOf([{ t: 0, y: 0 }, { t: 40, y: 200 }, { t: 400, y: 200 }]), 0)
  assert.equal(velocityOf([{ t: 0, y: 0 }]), 0)
})

test('status time never shows AM/PM', () => {
  const { statusTime } = load()
  assert.equal(statusTime(new Date(2026, 8, 27, 22, 5), true), '10:05')
  assert.equal(statusTime(new Date(2026, 8, 27, 0, 7), true), '12:07')
  assert.equal(statusTime(new Date(2026, 8, 27, 9, 30), false), '09:30')
})

test('shade date reads like a Pixel', () => {
  const { shadeDate } = load()
  assert.equal(shadeDate(new Date(2026, 8, 27, 10)), 'Sunday, 27 September')
})

test('relative time is short', () => {
  const { relativeTime } = load()
  const now = 10 * 86_400_000
  assert.equal(relativeTime(now - 20_000, now), 'now')
  assert.equal(relativeTime(now - 5 * 60_000, now), '5 min')
  assert.equal(relativeTime(now - 2 * 3_600_000, now), '2 h')
  assert.equal(relativeTime(now - 30 * 3_600_000, now), 'Yesterday')
  assert.equal(relativeTime(now - 3 * 86_400_000, now), '3 d')
  assert.equal(relativeTime(now + 5000, now), 'now', 'a clock skew never shows a negative time')
})

test('unread icons: newest first, one per app, three plus a dot', () => {
  const { unreadApps } = load()
  const center = ['settings', 'settings', 'clock', 'contact', 'about', 'camera'].map((appId) => ({ appId }))
  assert.deepEqual(unreadApps(center, 0), { apps: [], more: false })
  assert.deepEqual(unreadApps(center, 2), { apps: ['settings'], more: false })
  assert.deepEqual(unreadApps(center, 4), { apps: ['settings', 'clock', 'contact'], more: false })
  assert.deepEqual(unreadApps(center, 6), { apps: ['settings', 'clock', 'contact'], more: true })
})

test('battery never invents a level', () => {
  const { batteryGlyph } = load()
  assert.equal(batteryGlyph(null, false), 'unknown')
  assert.equal(batteryGlyph(0.2, true), 'charging')
  assert.equal(batteryGlyph(0.8, false), 'full')
  assert.equal(batteryGlyph(0.5, false), 'medium')
  assert.equal(batteryGlyph(0.1, false), 'low')
})

test('status bar name counts unread', () => {
  const { statusLabel } = load()
  assert.equal(statusLabel(0), 'Notifications and quick settings')
  assert.equal(statusLabel(2), 'Notifications and quick settings, 2 unread')
})

test('alarm chip names the day only when it is not today', () => {
  const { alarmChip } = load()
  const now = new Date(2026, 8, 27, 10).getTime()
  assert.equal(alarmChip(new Date(2026, 8, 27, 18).getTime(), now, '6:00 PM'), '6:00 PM')
  assert.equal(alarmChip(new Date(2026, 8, 28, 7).getTime(), now, '7:00 AM'), 'Mon 7:00 AM')
})
