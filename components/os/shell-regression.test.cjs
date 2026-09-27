// Run from the worktree root: node components/os/shell-regression.test.cjs
// In-memory store and event probes. These do not replace integrated browser QA.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const root = process.cwd()
const modules = new Map()
let hookRenderer = null
const activityContext = require("react").createContext(true)
let phone = false
let confirmed = false
let sounds = 0
const storage = new Map()
const browser = { matchMedia: () => ({ matches: phone }), confirm: () => confirmed }
function load(file) {
  const full = path.resolve(root, file)
  if (modules.has(full)) return modules.get(full).exports
  const mod = { exports: {} }
  modules.set(full, mod)
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  function localRequire(id) {
    if (id.endsWith('.css')) return {}
    if (hookRenderer && id === 'react') return hookRenderer.react
    if (hookRenderer && id === '@/lib/os/wm-store') return { ...load('lib/os/wm-store.ts'), useWM: Object.assign(() => useWM.getState(), useWM) }
    if (id === '@/lib/os/app-activity') return { AppActivityContext: activityContext, useAppActive: () => require('react').useContext(activityContext) }
    if (id === './sfx') return { playSfx: () => sounds++ }
    if (id.startsWith('.') || id.startsWith('@/')) {
      const base = id.startsWith('@/') ? path.join(root, id.slice(2)) : path.resolve(path.dirname(full), id)
      const candidate = ['', '.ts', '.tsx', '.js'].map(ext => base + ext).find(file => fs.existsSync(file) && fs.statSync(file).isFile())
      return load(candidate)
    }
    return require(id)
  }
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { window: browser, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) }, console, setTimeout, clearTimeout, Date }, { filename: full })(localRequire, mod, mod.exports)
  return mod.exports
}
const { useWM } = load('lib/os/wm-store.ts')
const { useNotify } = load('lib/os/notify-store.ts')
const wm = () => useWM.getState()
const find = id => wm().windows.find(w => w.id === id)
const a = wm().open('notepad', { fileId: 'file-a' })
const b = wm().open('browser')
wm().setPayload(a, { fileId: 'saved-copy', other: 42 })
const size = { ...find(a).size }
wm().minimizeAll()
assert.equal(wm().focusedId, null)
assert.equal(wm().windows.length, 2)
assert(wm().windows.every(w => w.minimized))
assert.equal(find(a).payload.fileId, 'saved-copy')
phone = true
wm().setPhonePanel('recents')
wm().focus(a)
assert.equal(wm().phonePanel, 'closed')
assert.equal(wm().focusedId, a)
assert.equal(find(a).minimized, false)
assert.equal(find(a).payload.other, 42)
assert.deepEqual({ ...find(a).size }, size)
const c = wm().open('contact')
wm().setPhonePanel('expanded')
assert.equal(wm().open('contact'), c)
assert.equal(wm().phonePanel, 'closed')
assert.equal(wm().windows.filter(w => w.appId === 'contact').length, 1)
wm().setQsOpen(true)
assert.equal(wm().phonePanel, 'compact')
assert.equal(wm().qsOpen, false)
wm().setStartOpen(true)
assert.equal(wm().phonePanel, 'drawer')
wm().setNotifOpen(true)
assert.equal(wm().phonePanel, 'compact')
wm().closeFlyouts()
assert.equal(wm().phonePanel, 'closed')
const clean = wm().open('settings')
assert.equal(wm().close(clean), true)
const saved = wm().open('notepad')
wm().setUnsavedWork(saved, true)
wm().setUnsavedWork(saved, false)
assert.equal(wm().close(saved), true)
wm().setUnsavedWork(a, true)
assert.equal(wm().close(a), false)
assert(find(a))
confirmed = true
assert.equal(wm().close(a), true)
assert(!find(a))
confirmed = false
const focusBefore = wm().focusedId
wm().focus('missing')
assert.equal(wm().focusedId, focusBefore)
phone = false
wm().setQsOpen(true)
assert.equal(wm().qsOpen, true)
assert.equal(wm().phonePanel, 'closed')
wm().toggleMaximize(b)
assert.equal(find(b).maximized, true)
const restored = { ...find(b).restore.size }
wm().resize(b, { x: 144, y: 96 }, restored)
assert.equal(find(b).maximized, false)
assert.equal(find(b).snapped, null)
assert.equal(find(b).restore, null)
assert.deepEqual({ ...find(b).size }, restored)
assert.deepEqual({ ...find(b).pos }, { x: 144, y: 40 })
wm().toggleMaximize(b)
assert.equal(find(b).restore.pos.x, 144)
wm().toggleMaximize(b)
assert.equal(find(b).pos.x, 144)
wm().snap(b, 'left')
wm().resize(b, { x: 90, y: 80 }, restored)
assert.equal(find(b).snapped, null)
wm().focus(b)
wm().toggleMinimize(b)
assert.equal(find(b).minimized, true)
wm().toggleMinimize(b)
assert.equal(find(b).minimized, false)
assert.equal(wm().focusedId, b)
const n = () => useNotify.getState()
n().setDnd(true)
n().push({ appId: 'settings', source: 'Probe', title: 'Quiet' })
assert.equal(sounds, 0)
assert.equal(n().toasts.length, 0)
assert.equal(n().center.length, 1)
n().setDnd(false)
n().push({ appId: 'settings', source: 'Probe', title: 'Sound' })
assert.equal(sounds, 1)
assert.equal(n().toasts.length, 1)
const toast = n().toasts[0]
n().dismiss(toast.id)
assert.equal(n().toasts.length, 0)
console.log('PASS: store probes: retained IDs/payload/geometry, Home/resume, singleton and cross-app focus, phone panel routing, close cancellation, invalid focus, restore/snap/minimize, quiet notification sound and dismissal.')

// Exercise the real WindowFrame pointer handlers with deterministic hook slots.
// No DOM rendering or native pointer-capture behavior is asserted by this harness.
function hooks() {
  const slots = []
  let cursor = 0
  return {
    reset: () => { cursor = 0 },
    react: {
      useRef: initial => { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }) },
      useState: initial => {
        const i = cursor++
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
        return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
      },
      useEffect: () => {},
      useCallback: fn => fn,
    },
  }
}
hookRenderer = hooks()
const { WindowFrame } = load('components/os/desktop/window-frame.tsx')
const renderFrame = () => { hookRenderer.reset(); return WindowFrame({ win: find(b), children: 'retained content' }) }
const titlebar = frame => frame.props.children[1].props.children[0]
const pointer = (x, y) => ({ button: 0, buttons: 1, pointerId: 1, clientX: x, clientY: y, target: { closest: () => null }, currentTarget: { setPointerCapture: () => {} } })
wm().resize(b, { x: 80, y: 70 }, { w: 780, h: 500 })
wm().toggleMaximize(b)
let frame = renderFrame()
titlebar(frame).props.onPointerDown(pointer(500, 16))
titlebar(frame).props.onPointerMove(pointer(540, 116))
frame = renderFrame()
titlebar(frame).props.onPointerUp()
assert.equal(find(b).maximized, false)
assert.equal(find(b).snapped, null)
assert.equal(find(b).restore, null)
assert.equal(find(b).size.w, 780)
assert.equal(find(b).size.h, 500)
assert.equal(find(b).pos.y, 100)
wm().toggleMaximize(b)
frame = renderFrame()
titlebar(frame).props.onPointerDown(pointer(500, 16))
titlebar(frame).props.onPointerMove(pointer(560, 116))
frame = renderFrame()
titlebar(frame).props.onPointerCancel()
assert.equal(find(b).maximized, true)
assert.equal(find(b).pos.y, 0)
frame = renderFrame()
titlebar(frame).props.onPointerDown(pointer(500, 16))
titlebar(frame).props.onPointerMove(pointer(520, 5))
frame = renderFrame()
titlebar(frame).props.onPointerUp()
assert.equal(find(b).maximized, true)
assert.equal(find(b).size.w, wm().bounds.w)
assert.equal(find(b).restore.size.w, 780)
console.log('PASS: real WindowFrame handlers commit torn-off geometry, cancel without commit, and re-maximize at the top edge.')

const { Taskbar } = load('components/os/desktop/taskbar.tsx')
const b2 = wm().open('browser')
wm().focus(b)
function descendants(node) {
  if (!node || typeof node !== 'object') return []
  const children = [node.props?.children].flat(Infinity)
  return [node, ...children.flatMap(descendants)]
}
let taskButton = descendants(Taskbar({ openMenu: () => {} })).find(node => node.props?.['data-task-app'] === 'browser')
taskButton.props.onClick()
assert.equal(find(b).minimized, true)
assert.equal(find(b2).minimized, false)
wm().minimizeAll()
taskButton = descendants(Taskbar({ openMenu: () => {} })).find(node => node.props?.['data-task-app'] === 'browser')
taskButton.props.onClick()
assert.equal(wm().focusedId, b)
assert.equal(find(b).minimized, false)
console.log('PASS: actual Taskbar click targets the focused older instance and restores the most-recent minimized instance.')

hookRenderer = null
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { PortfolioShell } = load('components/os/portfolio-shell.tsx')
const html = renderToStaticMarkup(React.createElement(PortfolioShell, null,
  React.createElement('article', { id: 'readable-portfolio' }, 'About, experience, and contact information.'),
))
assert(html.includes('id="readable-portfolio"'))
assert(html.includes('About, experience, and contact information.'))
assert(!html.includes('data-shell-sessions'))
assert(!html.includes('Display is asleep'))
assert(html.includes('data-power-entry'))
assert(html.includes('aria-label="Power on"'))
assert(html.includes('href="#readable-portfolio"'))
console.log('PASS: server render exposes a stable power entry plus readable content.')

// Shrink, restore and snap must retain identity/payload and fit all controls.
const g = wm().open('solitaire', { deal: 'retained' })
const original = JSON.parse(JSON.stringify(find(g)))
wm().setBounds({ w: 844, h: 342 })
let fitted = find(g)
assert(fitted.pos.x >= 0 && fitted.pos.y >= 0)
assert(fitted.pos.x + fitted.size.w <= 844)
assert(fitted.pos.y + fitted.size.h <= 342)
assert.equal(fitted.payload.deal, 'retained')
wm().setBounds({ w: 1280, h: 720 })
assert.deepEqual(JSON.parse(JSON.stringify(find(g).size)), original.size)
assert.deepEqual(JSON.parse(JSON.stringify(find(g).pos)), original.pos)
wm().toggleMaximize(g)
wm().setBounds({ w: 844, h: 342 })
wm().toggleMaximize(g)
assert(find(g).pos.y + find(g).size.h <= 342)
wm().setBounds({ w: 1280, h: 720 })
assert.equal(find(g).size.h, original.size.h)
wm().snap(g, 'right')
wm().setBounds({ w: 768, h: 252 })
assert.equal(find(g).size.w, 384)
assert.equal(find(g).pos.x, 384)
wm().toggleMaximize(g)
assert(find(g).pos.x + find(g).size.w <= 768)
assert(find(g).pos.y + find(g).size.h <= 252)
console.log('PASS: free/maximized/snapped resize fits the desktop and restores preferred geometry without losing payload.')
