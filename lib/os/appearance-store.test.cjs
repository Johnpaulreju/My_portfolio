const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "appearance-store.ts"), "utf8")
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
})

function open(storage) {
  const mod = { exports: {} }
  new Function("require", "module", "exports", "localStorage", outputText)(require, mod, mod.exports, storage)
  const state = mod.exports.useAppearance.getState
  state().hydrate()
  return state
}

test("accent and alignment survive a reload and invalid values fall back independently", () => {
  const saved = new Map()
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  const state = open(storage)
  state().setAccent("violet")
  const accentKey = [...saved.keys()][0]
  state().setAlignment("left")
  const restored = open(storage)
  assert.equal(restored().accent, "violet")
  assert.equal(restored().alignment, "left")
  saved.set(accentKey, "ultraviolet")
  const repaired = open(storage)
  assert.equal(repaired().accent, "blue")
  assert.equal(repaired().alignment, "left")
})

test("visitors can personalize their current session when browser storage is unavailable", () => {
  const denied = () => { throw new Error("Unavailable storage") }
  const state = open({ getItem: denied, setItem: denied })
  assert.equal(state().alignment, "center")
  state().setAccent("teal")
  state().setAlignment("left")
  assert.equal(state().accent, "teal")
  assert.equal(state().alignment, "left")
})
