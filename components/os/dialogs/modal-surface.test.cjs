// Focus-lifetime regression harness; real browser coverage remains necessary.
// Run: node --test components/os/dialogs/modal-surface.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

function target({ connected = true, inert = false } = {}) {
  return { isConnected: connected, calls: [], closest: () => inert ? {} : null,
    focus(options) { this.calls.push(options) } }
}

function mount(returnFocusRef, previous = target()) {
  const primary = target()
  const dialog = { open: false, showModal() { this.open = true }, close() { this.open = false }, querySelector: () => primary }
  let effect, refIndex = 0
  const react = {
    useRef: value => ({ current: refIndex++ === 0 ? dialog : value }),
    useEffect: callback => { effect = callback },
  }
  const loaded = { exports: {} }
  const source = fs.readFileSync(path.join(__dirname, 'modal-surface.tsx'), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
  new Function('require', 'module', 'exports', 'document', code)(id => id === 'react' ? react : require(id), loaded, loaded.exports, { activeElement: previous })
  loaded.exports.ModalSurface({ label: 'Save guard', onDismiss() {}, returnFocusRef })
  const cleanup = effect()
  assert.equal(dialog.open, true)
  assert.equal(primary.calls.length, 1)
  return () => { cleanup(); assert.equal(dialog.open, false) }
}

test('returns focus to the editor that opened the dialog even if its ref is reassigned', () => {
  const editor = target(), replacement = target(), ref = { current: editor }
  const close = mount(ref)
  ref.current = replacement
  close()
  assert.deepEqual(editor.calls, [{ preventScroll: true }])
  assert.deepEqual(replacement.calls, [])
})

for (const ref of [undefined, { current: null }]) {
  test(`restores previous focus with ${ref ? 'a nullable' : 'no'} editor ref`, () => {
    const previous = target()
    mount(ref, previous)()
    assert.deepEqual(previous.calls, [{ preventScroll: true }])
  })
}

for (const [name, options] of [['detached', { connected: false }], ['inert', { inert: true }]]) {
  test(`does not focus an editor that becomes ${name} before the dialog closes`, () => {
    const editor = target(), close = mount({ current: editor })
    Object.assign(editor, target(options))
    close()
    assert.deepEqual(editor.calls, [])
  })
}
