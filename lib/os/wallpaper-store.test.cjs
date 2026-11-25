const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function open(saved) {
  const localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) }
  function load(id) {
    if (!id.startsWith("./")) return require(id)
    const source = readFileSync(path.join(__dirname, id + ".ts"), "utf8")
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    const loaded = { exports: {} }
    new Function("require", "module", "exports", "localStorage", code)(load, loaded, loaded.exports, localStorage)
    return loaded.exports
  }
  const state = load("./wallpaper-store").useWallpaper.getState
  state().hydrate()
  return state
}

const prefsKey = "jp-os-wallpaper-v1"
const imagesKey = "jp-os-wallpapers-v1"

test("picture and solid presets persist independently of the uploaded photo library", () => {
  const saved = new Map([[imagesKey, "invalid JSON"]])
  for (const id of ["alpine-dawn", "pine", "coastal-dusk", "midnight", "slate", "default"]) {
    const state = open(saved)
    state().select(id)
    state().select("missing")
    state().remove(id)
    assert.equal(open(saved)().current, id)
    assert.equal(saved.get(imagesKey), "invalid JSON")
  }
})

test("existing custom images still restore and deleting the active one restores Azure folds", () => {
  const photo = { id: "wp-old", name: "My photo", src: "data:image/jpeg;base64,AA==", addedAt: 1 }
  const saved = new Map([[imagesKey, JSON.stringify([photo])], [prefsKey, JSON.stringify({ current: photo.id })]])
  const state = open(saved)
  assert.equal(state().current, photo.id)
  state().select("pine")
  assert.deepEqual(open(saved)().custom, [photo])
  state().select(photo.id)
  state().remove(photo.id)
  const reloaded = open(saved)
  assert.equal(reloaded().current, "default")
  assert.deepEqual(reloaded().custom, [])
})
