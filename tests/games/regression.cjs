/* Run: node --test tests/games/regression.cjs
 * Executes real game functions and component handlers with a small hook/clock
 * harness. No DOM, canvas pixels, browser gestures, or real audio are asserted.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const React = require('react')
const root = path.resolve(__dirname, '../..')

function load(file, names = [], mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    fileName: file,
  }).outputText
  const mod = { exports: {} }
  vm.runInNewContext(js + `\nObject.assign(module.exports, {${names.join(',')}});`, {
    module: mod, exports: mod.exports,
    require: (id) => {
      if (id in mocks) return mocks[id]
      if (id.startsWith('@/')) return {}
      return require(id)
    },
    ...globals,
  }, { filename: file })
  return mod.exports
}

const { createRaceInput } = load('lib/os/games/ridgeline-input.ts')
const mines = load('components/os/apps/minesweeper-app.tsx', ['init', 'reducer', 'neighbours'])
const cards = load('components/os/apps/solitaire-app.tsx', ['deal', 'applyMove', 'applyDraw', 'clone', 'autoFinish', 'isWon'])
const plain = (value) => JSON.parse(JSON.stringify(value))

test('independent fingers can steer, accelerate and strike together', () => {
  const held = new Set()
  const input = createRaceInput((k) => held.add(k), (k) => held.delete(k))
  input.press('pointer:1', 'w')
  input.press('pointer:2', 'a')
  input.press('pointer:3', 'j')
  assert.deepEqual([...held], ['w', 'a', 'j'])
  input.release('pointer:2')
  assert.deepEqual([...held], ['w', 'j'])
  input.clear()
  assert.equal(held.size, 0)
  input.release('pointer:3') // a late lostcapture after pause is harmless
  assert.equal(held.size, 0)
})

test('releasing a finger does not release a keyboard key or second finger', () => {
  const events = []
  const input = createRaceInput((k) => events.push(`down:${k}`), (k) => events.push(`up:${k}`))
  input.press('keyboard:w', 'w')
  input.press('pointer:1', 'w')
  input.press('pointer:2', 'w')
  input.release('pointer:1')
  input.release('keyboard:w')
  assert.deepEqual(events, ['down:w'])
  input.release('pointer:2')
  assert.deepEqual(events, ['down:w', 'up:w'])
})

test('attack repeats remain available, and pausing clears every input source', () => {
  const events = []
  const input = createRaceInput((k) => events.push(k), () => {})
  input.press('keyboard:j', 'j')
  input.press('keyboard:j', 'j', true)
  assert.deepEqual(events, ['j', 'j'])
  input.clear()
  assert.equal(input.keys().size, 0)
  input.press('keyboard:j', 'j')
  assert.equal(events.length, 3)
})

test('Minesweeper first tap protects the cell and neighbours at every level', () => {
  for (const level of ['beginner', 'intermediate', 'expert']) {
    const before = mines.init(level, true, 1)
    const index = Math.floor(before.cells.length / 2)
    const after = mines.reducer(before, { type: 'reveal', index })
    for (const safe of [index, ...mines.neighbours(index, before.cols, before.rows)]) {
      assert.equal(after.cells[safe].mine, false)
    }
    assert.equal(after.cells.filter((c) => c.mine).length, before.mines)
    assert.equal(before.seeded, false)
    assert.ok(after.opened > 0)
  }
})

test('a flagged cell resists reveal; a wrong but satisfied chord loses honestly', () => {
  let state = mines.init('beginner', true, 1)
  state = mines.reducer(state, { type: 'cycle', index: 0 })
  assert.equal(mines.reducer(state, { type: 'reveal', index: 0 }), state)
  state = mines.init('beginner', true, 2)
  state.status = 'playing'
  state.seeded = true
  state.cells[0].mine = true
  state.cells[10].revealed = true
  state.cells[10].adj = 1
  state.cells[1].mark = 1
  state.flags = state.opened = 1
  const lost = mines.reducer(state, { type: 'chord', index: 10 })
  assert.equal(lost.status, 'lost')
  assert.equal(lost.cells[0].boom, true)
  assert.equal(lost.cells[1].wrong, true)
})

test('Solitaire deals are reproducible and conserve all 52 cards through recycling', () => {
  const game = cards.deal(17)
  assert.deepEqual(plain(game), plain(cards.deal(17)))
  const stock = game.stock.map((c) => c.id)
  for (let i = 0; i < 24; i++) assert.equal(cards.applyDraw(game), true)
  cards.applyDraw(game)
  assert.deepEqual(game.stock.map((c) => c.id), stock)
  const all = [...game.stock, ...game.tableau.flat()]
  assert.equal(new Set(all.map((c) => c.id)).size, 52)
})

test('Solitaire rejects illegal moves without mutation and reveals a legal source', () => {
  const game = { stock: [], waste: [], foundations: [[], [], [], []], tableau: [
    [{ id: 'S5', suit: 'S', rank: 5, up: false }, { id: 'H12', suit: 'H', rank: 12, up: true }],
    [{ id: 'C13', suit: 'C', rank: 13, up: true }], [], [], [], [], [],
  ], moves: 0, recycles: 0 }
  const from = { zone: 'tableau', pile: 0, index: 1 }
  const before = plain(game)
  assert.equal(cards.applyMove(game, from, { zone: 'tableau', pile: 2 }), false)
  assert.deepEqual(game, before)
  assert.equal(cards.applyMove(game, from, { zone: 'tableau', pile: 1 }), true)
  assert.equal(game.tableau[0][0].up, true)
  assert.equal(game.tableau[1][1].id, 'H12')
  assert.equal(game.moves, 1)
})

// This harness tests effects, state and handlers, without pretending to be browser QA.
function componentHarness(file, componentName) {
  let active = true, cursor = 0, dirty = false, tree
  const slots = [], pending = [], timers = new Map()
  let timerId = 0
  const hooks = {
    ...React,
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], (value) => {
        const next = typeof value === 'function' ? value(slots[i]) : value
        if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true }
      }]
    },
    useReducer(reducer, arg, init) {
      const [state, set] = hooks.useState(() => init ? init(arg) : arg)
      return [state, (action) => set((old) => reducer(old, action))]
    },
    useRef(initial) { return hooks.useState(() => ({ current: initial }))[0] },
    useMemo(factory) { return factory() },
    useCallback(fn) { return fn },
    useEffect(fn, deps) {
      const i = cursor++
      const old = slots[i]
      if (!old || deps.some((d, k) => !Object.is(d, old.deps[k]))) {
        pending.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() } })
      }
    },
  }
  hooks.useLayoutEffect = hooks.useEffect
  const app = load(file, [], {
    react: hooks,
    '@/lib/os/app-activity': { useAppActive: () => active },
    '@/lib/os/wm-store': { useWM: (select) => select({ theme: 'dark' }) },
    '@/lib/os/sfx': { playSfx: () => {} },
  }, {
    window: {
      setInterval(fn) { const id = ++timerId; timers.set(id, fn); return id },
      clearInterval(id) { timers.delete(id) },
      addEventListener() {}, removeEventListener() {},
    },
  })[componentName]
  const render = () => {
    for (let n = 0; n < 20; n++) {
      dirty = false; cursor = 0; tree = app()
      pending.splice(0).forEach((effect) => effect())
      if (!dirty) return tree
    }
    throw Error('render did not settle')
  }
  const nodes = (node = tree) => {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child))
    return [node, ...nodes(node.props?.children ?? null)]
  }
  render()
  return {
    render, nodes,
    active(value) { active = value; render() },
    tick() { [...timers.values()].forEach((fn) => fn()); render() },
    timers: () => timers.size,
    find: (predicate) => nodes().find(predicate),
    unmount() { slots.forEach((slot) => slot?.cleanup?.()) },
  }
}

test('Minesweeper activity pauses time/input and resumes the same board', () => {
  const app = componentHarness('components/os/apps/minesweeper-app.tsx', 'MinesweeperApp')
  const cell = () => app.find((n) => n.type?.name === 'CellButton' && n.props.index === 40)
  const seconds = () => app.find((n) => n.props?.label === 'Seconds elapsed').props.value
  cell().props.onClick(40); app.render(); app.tick()
  const board = plain(app.nodes().filter((n) => n.type?.name === 'CellButton').map((n) => n.props.cell))
  assert.equal(seconds(), 1)
  app.active(false)
  assert.equal(app.timers(), 0)
  app.tick(); cell().props.onClick(0); app.render()
  assert.equal(seconds(), 1)
  assert.deepEqual(plain(app.nodes().filter((n) => n.type?.name === 'CellButton').map((n) => n.props.cell)), board)
  app.active(true); app.tick()
  assert.equal(seconds(), 2)
  app.unmount(); assert.equal(app.timers(), 0)
})

test('Solitaire activity preserves the deal/selection and rejects hidden draws', () => {
  const app = componentHarness('components/os/apps/solitaire-app.tsx', 'SolitaireApp')
  const stock = () => app.find((n) => n.props?.card?.id === 'stock')
  const click = { stopPropagation() {} }
  stock().props.onClick(click); app.render(); app.tick()
  const waste = () => app.find((n) => n.type?.name === 'PlayingCard' && n.props.card.up && n.props.top === undefined)
  waste().props.onClick(click); app.render()
  const selected = waste().props.card.id
  app.active(false)
  assert.equal(app.timers(), 0)
  stock().props.onClick(click); app.render()
  assert.equal(waste().props.card.id, selected)
  assert.equal(waste().props.selected, true)
  app.active(true)
  assert.equal(app.timers(), 1)
  const undo = app.find((n) => n.props?.label === 'Undo')
  undo.props.onClick(); app.render()
  assert.equal(app.nodes().some((n) => n.props?.card?.id === selected && n.props?.card?.up), false)
  app.unmount(); assert.equal(app.timers(), 0)
})

function raceHarness(width = 320, height = 260) {
  let now = 0, nextFrame = 0
  const frames = new Map(), feedback = []
  const context = new Proxy({}, { get(target, key) {
    if (key in target) return target[key]
    if (key === 'createLinearGradient') return () => ({ addColorStop() {} })
    return () => {}
  } })
  const { createEngine } = load('components/os/apps/ridgeline-app.tsx', ['createEngine'], {}, {
    window: { devicePixelRatio: 1 }, performance: { now: () => now },
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
  })
  const canvas = { style: {}, getContext: () => context }
  const engine = createEngine(canvas, { clientWidth: width, clientHeight: height }, {
    onFinish() {}, onStatus() {}, onFeedback: (message) => feedback.push(message),
  })
  return {
    engine, canvas, feedback, frames,
    advance(count) { for (let i = 0; i < count; i++) { now += 1000 / 60; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn(now)) } },
  }
}

test('Ridgeline fits the entire canvas into a short app surface without cropping', () => {
  const { engine, canvas } = raceHarness(280, 96)
  assert.equal(canvas.style.width, '280px')
  assert.equal(canvas.style.height, '96px')
  assert.equal(canvas.width, 280)
  assert.equal(canvas.height, 96)
  engine.dispose()
})

test('Ridgeline pauses its frame loop and clock, then resumes without held throttle', () => {
  const { engine, advance, frames } = raceHarness()
  engine.start(); engine.keyDown('w'); advance(90)
  const before = engine.statusText()
  assert.ok(parseInt(before) > 0)
  engine.setRunning(false)
  assert.equal(frames.size, 0)
  advance(600)
  assert.equal(engine.statusText(), before)
  engine.setRunning(true); advance(30)
  assert.ok(parseInt(engine.statusText()) < parseInt(before))
  engine.dispose(); assert.equal(frames.size, 0)
})

test('braking works while Gas remains held, using the existing braking physics', () => {
  const { engine, advance } = raceHarness()
  engine.start(); engine.keyDown('w'); advance(90)
  const speed = parseInt(engine.statusText())
  engine.keyDown('s'); advance(15)
  assert.ok(parseInt(engine.statusText()) < speed)
  engine.dispose()
})
