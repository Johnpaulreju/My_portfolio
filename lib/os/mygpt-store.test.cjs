// Run: node --test lib/os/mygpt-store.test.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, 'mygpt-store.ts'), 'utf8')
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText

function open(saved = new Map()) {
  const localStorage = {
    get length() { return saved.size },
    key: (index) => [...saved.keys()][index] ?? null,
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'window', code)(require, loaded, loaded.exports, { localStorage })
  const state = loaded.exports.useMyGPT.getState
  state().hydrate()
  return state
}

test('a delayed reply stays in its original conversation after switching chats', () => {
  const state = open()
  const first = state().activeId
  const request = state().begin(first, 'Where did Johnpaul study?')
  const second = state().newChat()
  state().setDraft(second, 'Show his projects')
  state().finish(request, { text: 'He attended Kristu Jayanti College.', links: [] })
  assert.equal(state().activeId, second)
  const active = state().sessions.find((s) => s.id === second)
  assert.equal(active.draft, 'Show his projects')
  assert.deepEqual(active.messages, [])
  assert.equal(state().sessions.find((s) => s.id === first).messages.at(-1).text, 'He attended Kristu Jayanti College.')
})

test('a stopped request cannot finish its retry and a deleted chat cannot receive a late reply', () => {
  const saved = new Map()
  const state = open(saved)
  const id = state().activeId
  const first = state().begin(id, 'Show the Mafia repository')
  state().stop(id)
  assert.ok(first.signal.aborted)
  const retry = state().retry(id, first.messageId)
  assert.equal(retry.messageId, first.messageId)
  state().finish(first, { text: 'Late reply', links: [] })
  assert.equal(state().sessions[0].messages.at(-1).status, 'pending')
  state().remove(id)
  assert.ok(retry.signal.aborted)
  state().finish(retry, { text: 'Another late reply', links: [] })
  assert.ok(!state().sessions.some((s) => s.id === id))
  assert.ok(!open(saved)().sessions.some((s) => s.id === id))
})

test('reloading restores the active chat, its draft and a retryable interrupted message', () => {
  const saved = new Map()
  const state = open(saved)
  const id = state().activeId
  const pending = state().begin(id, 'What is Plan0?')
  state().setDraft(id, 'Is it published?')
  const other = state().newChat()
  state().setDraft(other, 'Where did he study?')
  state().select(id)
  const restored = open(saved)
  const chat = restored().sessions.find((s) => s.id === id)
  assert.equal(restored().activeId, id)
  assert.equal(chat.draft, 'Is it published?')
  assert.equal(restored().sessions.find((s) => s.id === other).draft, 'Where did he study?')
  assert.equal(chat.messages.at(-1).status, 'stopped')
  const retry = restored().retry(id, pending.messageId)
  assert.equal(retry.question, 'What is Plan0?')
  assert.equal(retry.messageId, pending.messageId)
  assert.notEqual(retry.token, pending.token)
})
