"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react"
import { useWM } from "@/lib/os/wm-store"
import { playSfx } from "@/lib/os/sfx"

/* ------------------------------------------------------------------ *
 * Rules of the board
 * ------------------------------------------------------------------ */

type Level = "beginner" | "intermediate" | "expert"

const LEVELS: Record<Level, { cols: number; rows: number; mines: number; label: string }> = {
  beginner: { cols: 9, rows: 9, mines: 10, label: "Beginner" },
  intermediate: { cols: 16, rows: 16, mines: 40, label: "Intermediate" },
  expert: { cols: 30, rows: 16, mines: 99, label: "Expert" },
}

const LEVEL_ORDER: Level[] = ["beginner", "intermediate", "expert"]

/** 0 = untouched, 1 = flag, 2 = question mark. */
type Mark = 0 | 1 | 2

type Cell = {
  mine: boolean
  /** Mines in the eight neighbouring cells. */
  adj: number
  revealed: boolean
  mark: Mark
  /** The mine that ended the game. */
  boom: boolean
  /** A flag that turned out to be planted on a safe cell. */
  wrong: boolean
}

type Status = "ready" | "playing" | "won" | "lost"

type State = {
  level: Level
  cols: number
  rows: number
  mines: number
  cells: Cell[]
  status: Status
  /** Mines are laid only after the first reveal, so the first click is always safe. */
  seeded: boolean
  flags: number
  /** Safe cells opened so far - the win test. */
  opened: number
  /** Roving-tabindex focus position. */
  cursor: number
  /** Classic "Marks (?)" option. */
  marksOn: boolean
  /** Bumped on every new game so the timer knows to restart. */
  gameId: number
}

type Action =
  | { type: "new"; level?: Level }
  | { type: "reveal"; index: number }
  | { type: "chord"; index: number }
  | { type: "cycle"; index: number }
  | { type: "cursor"; index: number }
  | { type: "marks" }

function blankCells(count: number): Cell[] {
  const out: Cell[] = new Array(count)
  for (let i = 0; i < count; i++) {
    out[i] = { mine: false, adj: 0, revealed: false, mark: 0, boom: false, wrong: false }
  }
  return out
}

function init(level: Level, marksOn: boolean, gameId: number): State {
  const { cols, rows, mines } = LEVELS[level]
  return {
    level,
    cols,
    rows,
    mines,
    cells: blankCells(cols * rows),
    status: "ready",
    seeded: false,
    flags: 0,
    opened: 0,
    cursor: Math.floor(rows / 2) * cols + Math.floor(cols / 2),
    marksOn,
    gameId,
  }
}

/** Indices of the (up to eight) cells touching `i`. */
function neighbours(i: number, cols: number, rows: number): number[] {
  const r = Math.floor(i / cols)
  const c = i - r * cols
  const out: number[] = []
  for (let dr = -1; dr <= 1; dr++) {
    const nr = r + dr
    if (nr < 0 || nr >= rows) continue
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue
      const nc = c + dc
      if (nc < 0 || nc >= cols) continue
      out.push(nr * cols + nc)
    }
  }
  return out
}

/**
 * Lay the mines *after* the opening click, keeping that cell and its whole
 * neighbourhood clear so the first reveal always opens a region. Falls back to
 * protecting just the clicked cell on a hypothetical board too dense for a full
 * safe patch.
 */
function layMines(cells: Cell[], cols: number, rows: number, mines: number, safe: number) {
  const total = cols * rows
  let banned = new Set<number>([safe, ...neighbours(safe, cols, rows)])
  if (total - banned.size < mines) banned = new Set<number>([safe])

  const pool: number[] = []
  for (let i = 0; i < total; i++) if (!banned.has(i)) pool.push(i)

  // Partial Fisher-Yates: only the first `mines` slots need to be settled.
  const take = Math.min(mines, pool.length)
  for (let k = 0; k < take; k++) {
    const j = k + Math.floor(Math.random() * (pool.length - k))
    const tmp = pool[k]
    pool[k] = pool[j]
    pool[j] = tmp
    cells[pool[k]].mine = true
  }

  for (let i = 0; i < total; i++) {
    if (cells[i].mine) continue
    let n = 0
    const ns = neighbours(i, cols, rows)
    for (let k = 0; k < ns.length; k++) if (cells[ns[k]].mine) n++
    cells[i].adj = n
  }
}

/**
 * Iterative flood fill from `start`. Zero-adjacency cells push their
 * neighbours onto an explicit stack - deep boards would blow a recursive one.
 * Flags block the flood, question marks do not.
 * Returns how many *safe* cells opened, plus any mines that were stepped on.
 */
function floodReveal(cells: Cell[], start: number, cols: number, rows: number) {
  const stack = [start]
  let opened = 0
  const hits: number[] = []

  while (stack.length > 0) {
    const j = stack.pop() as number
    const cell = cells[j]
    if (cell.revealed || cell.mark === 1) continue
    cell.revealed = true
    if (cell.mark === 2) cell.mark = 0
    if (cell.mine) {
      hits.push(j)
      continue
    }
    opened++
    if (cell.adj !== 0) continue
    const ns = neighbours(j, cols, rows)
    for (let k = 0; k < ns.length; k++) {
      const n = ns[k]
      if (!cells[n].revealed && cells[n].mark !== 1) stack.push(n)
    }
  }

  return { opened, hits }
}

/** Expose every mine, and cross out the flags that were guesses. */
function bustBoard(cells: Cell[], hits: number[]) {
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i]
    if (c.mine) {
      // A correctly flagged mine keeps its flag - only unflagged ones surface.
      if (c.mark !== 1) c.revealed = true
    } else if (c.mark === 1) {
      c.wrong = true
      c.revealed = true
    }
  }
  for (let k = 0; k < hits.length; k++) cells[hits[k]].boom = true
}

function countFlags(cells: Cell[]): number {
  let n = 0
  for (let i = 0; i < cells.length; i++) if (cells[i].mark === 1) n++
  return n
}

/** Shared tail for reveal/chord: decide the outcome and recount the flags. */
function settle(state: State, cells: Cell[], opened: number, hits: number[]): State {
  const total = state.cols * state.rows
  let status: Status = "playing"

  if (hits.length > 0) {
    status = "lost"
    bustBoard(cells, hits)
  } else if (opened === total - state.mines) {
    status = "won"
    // Courtesy auto-flag, exactly like the original does on a win.
    for (let i = 0; i < cells.length; i++) if (cells[i].mine) cells[i].mark = 1
  }

  return { ...state, cells, opened, flags: countFlags(cells), status }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "new":
      return init(action.level ?? state.level, state.marksOn, state.gameId + 1)

    case "marks": {
      const marksOn = !state.marksOn
      if (marksOn) return { ...state, marksOn }
      // Turning marks off clears any question mark already on the board.
      let touched = false
      const cells = state.cells.map((c) => {
        if (c.mark !== 2) return c
        touched = true
        return { ...c, mark: 0 as Mark }
      })
      return touched ? { ...state, marksOn, cells } : { ...state, marksOn }
    }

    case "cursor":
      if (action.index === state.cursor) return state
      return { ...state, cursor: action.index }

    case "cycle": {
      if (state.status === "won" || state.status === "lost") return state
      const target = state.cells[action.index]
      if (!target || target.revealed) return state
      const cells = state.cells.map((c) => ({ ...c }))
      const cur = cells[action.index].mark
      cells[action.index].mark = cur === 0 ? 1 : cur === 1 ? (state.marksOn ? 2 : 0) : 0
      return { ...state, cells, flags: countFlags(cells), cursor: action.index }
    }

    case "reveal": {
      if (state.status === "won" || state.status === "lost") return state
      const target = state.cells[action.index]
      if (!target || target.revealed || target.mark === 1) return state

      const cells = state.cells.map((c) => ({ ...c }))
      let seeded = state.seeded
      if (!seeded) {
        layMines(cells, state.cols, state.rows, state.mines, action.index)
        seeded = true
      }
      const { opened, hits } = floodReveal(cells, action.index, state.cols, state.rows)
      return settle({ ...state, seeded, cursor: action.index }, cells, state.opened + opened, hits)
    }

    case "chord": {
      if (state.status !== "playing") return state
      const target = state.cells[action.index]
      if (!target || !target.revealed || target.mine || target.adj === 0) return state

      const ns = neighbours(action.index, state.cols, state.rows)
      let flagged = 0
      let closed = 0
      for (let k = 0; k < ns.length; k++) {
        const n = state.cells[ns[k]]
        if (n.mark === 1) flagged++
        else if (!n.revealed) closed++
      }
      // Only a satisfied number chords, and only when there is something to open.
      if (flagged !== target.adj || closed === 0) return state

      const cells = state.cells.map((c) => ({ ...c }))
      let opened = 0
      const hits: number[] = []
      for (let k = 0; k < ns.length; k++) {
        const n = ns[k]
        if (cells[n].revealed || cells[n].mark === 1) continue
        const res = floodReveal(cells, n, state.cols, state.rows)
        opened += res.opened
        for (let h = 0; h < res.hits.length; h++) hits.push(res.hits[h])
      }
      return settle({ ...state, cursor: action.index }, cells, state.opened + opened, hits)
    }

    default:
      return state
  }
}

/* ------------------------------------------------------------------ *
 * Best times - module scope so they survive closing the window.
 * ------------------------------------------------------------------ */

const BEST: Partial<Record<Level, number>> = {}

/* ------------------------------------------------------------------ *
 * Classic number palette
 *
 * The one place a literal colour is unavoidable: "1 is blue, 3 is red" is a
 * rule of the game, not a theme choice. Two tuned sets keep the contrast
 * honest on both our light and dark surfaces.
 * ------------------------------------------------------------------ */

const NUM_LIGHT = ["", "#0f3fd8", "#0c7a32", "#ce1126", "#101f7a", "#8a1a1a", "#0b7d78", "#1b1b1b", "#6a7280"]
const NUM_DARK = ["", "#69b0ff", "#5fd37a", "#ff7d72", "#aab4ff", "#f0977a", "#40d6c6", "#e8e8e8", "#a8adb8"]

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

export function MinesweeperApp() {
  const theme = useWM((s) => s.theme)
  const numbers = theme === "light" ? NUM_LIGHT : NUM_DARK

  const [state, dispatch] = useReducer(reducer, undefined, () => init("beginner", true, 1))
  const [seconds, setSeconds] = useState(0)
  const [pressing, setPressing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [flagMode, setFlagMode] = useState(false)

  const gridRef = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef<HTMLDivElement | null>(null)
  /** A both-button chord fires on mousedown - swallow the contextmenu/click it drags along. */
  const swallowMenu = useRef(false)
  const swallowClick = useRef(false)
  const secondsRef = useRef(0)
  secondsRef.current = seconds

  const { cols, rows, mines, cells, status, flags, cursor } = state
  const total = cols * rows
  const over = status === "won" || status === "lost"

  /* ---- timer: one interval, restarted per game, stopped the moment it ends ---- */

  useEffect(() => {
    setSeconds(0)
  }, [state.gameId])

  useEffect(() => {
    if (status !== "playing") return
    const id = window.setInterval(() => setSeconds((s) => (s >= 999 ? 999 : s + 1)), 1000)
    return () => window.clearInterval(id)
  }, [status, state.gameId])

  /* ---- end of game: sound, and a personal best worth keeping ---- */

  const [, bumpBest] = useReducer((n: number) => n + 1, 0)
  const scored = useRef(0)
  useEffect(() => {
    if (!over || scored.current === state.gameId) return
    scored.current = state.gameId
    if (status === "lost") {
      playSfx("error")
      return
    }
    playSfx("notify")
    const prev = BEST[state.level]
    if (prev === undefined || secondsRef.current < prev) {
      BEST[state.level] = secondsRef.current
      bumpBest()
    }
  }, [over, status, state.gameId, state.level])

  /* ---- the face reacts while the mouse is held down anywhere on the board ---- */

  useEffect(() => {
    if (!pressing) return
    const up = () => setPressing(false)
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    return () => {
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
    }
  }, [pressing])

  /* ---- menu closes on an outside press or Escape ---- */

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", esc)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", esc)
    }
  }, [menuOpen])

  /* ---- fit the board to the window ---- */

  const [box, setBox] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = fitRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const size = useMemo(() => {
    if (box.w < 40 || box.h < 40) return 24
    // container padding + board padding + borders, then one hairline per gap
    const byW = Math.floor((box.w - 34 - (cols - 1)) / cols)
    const byH = Math.floor((box.h - 34 - (rows - 1)) / rows)
    return Math.max(15, Math.min(34, Math.min(byW, byH)))
  }, [box, cols, rows])

  /* ---- input ---- */

  const focusCell = useCallback((index: number) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`button[data-idx="${index}"]`)
    el?.focus()
  }, [])

  const newGame = useCallback((level?: Level) => dispatch({ type: "new", level }), [])

  const onCellMouseDown = (e: ReactMouseEvent<HTMLButtonElement>, index: number) => {
    // Left+right together, or the middle button: chord.
    if (e.buttons === 3 || e.button === 1) {
      e.preventDefault()
      if (e.buttons === 3) swallowMenu.current = true
      swallowClick.current = true
      dispatch({ type: "chord", index })
      return
    }
    if (e.button === 0) {
      swallowClick.current = false
      swallowMenu.current = false
      dispatch({ type: "cursor", index })
    }
  }

  const onCellClick = (index: number) => {
    if (swallowClick.current) {
      swallowClick.current = false
      return
    }
    const cell = cells[index]
    // A satisfied number chords on a plain click too - handy on a trackpad,
    // and the only way to chord at all with flag mode on.
    if (cell.revealed) dispatch({ type: "chord", index })
    else if (flagMode) dispatch({ type: "cycle", index })
    else dispatch({ type: "reveal", index })
  }

  const onCellContextMenu = (e: ReactMouseEvent<HTMLButtonElement>, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (swallowMenu.current) {
      swallowMenu.current = false
      return
    }
    dispatch({ type: "cycle", index })
  }

  const onGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = e.key
    const c = state.cursor
    let next = c

    if (key === "ArrowLeft") next = c % cols === 0 ? c : c - 1
    else if (key === "ArrowRight") next = c % cols === cols - 1 ? c : c + 1
    else if (key === "ArrowUp") next = c - cols < 0 ? c : c - cols
    else if (key === "ArrowDown") next = c + cols >= total ? c : c + cols
    else if (key === "Home") next = c - (c % cols)
    else if (key === "End") next = c - (c % cols) + cols - 1
    else if (key === "Enter" || key === " ") {
      e.preventDefault()
      if (cells[c].revealed) dispatch({ type: "chord", index: c })
      else dispatch({ type: "reveal", index: c })
      return
    } else if (key === "f" || key === "F") {
      e.preventDefault()
      dispatch({ type: "cycle", index: c })
      return
    } else if (key === "c" || key === "C") {
      e.preventDefault()
      dispatch({ type: "chord", index: c })
      return
    } else if (key === "F2") {
      e.preventDefault()
      newGame()
      return
    } else {
      return
    }

    e.preventDefault()
    if (next !== c) {
      dispatch({ type: "cursor", index: next })
      focusCell(next)
    }
  }

  const face: FaceMood = status === "lost" ? "dead" : status === "won" ? "cool" : pressing ? "surprised" : "happy"
  const best = BEST[state.level]

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ color: "var(--os-fg)" }}>
      {/* ---------- menu bar ---------- */}
      <div
        className="relative flex shrink-0 items-center gap-1 border-b px-1.5 py-1"
        style={{ borderColor: "var(--os-border)" }}
      >
        <button
          type="button"
          onPointerDown={(e: ReactPointerEvent<HTMLButtonElement>) => {
            e.stopPropagation()
            setMenuOpen((o) => !o)
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="rounded px-2.5 py-1 text-[12.5px] transition-colors"
          style={{ background: menuOpen ? "var(--os-active)" : "transparent", color: "var(--os-fg)" }}
        >
          Game
        </button>

        <button
          type="button"
          onClick={() => setFlagMode((f) => !f)}
          aria-pressed={flagMode}
          title="Tap-to-flag - useful without a right mouse button"
          className="flex items-center gap-1.5 rounded px-2.5 py-1 text-[12.5px] transition-colors"
          style={{
            background: flagMode ? "var(--os-accent-soft)" : "transparent",
            color: flagMode ? "var(--os-accent)" : "var(--os-muted)",
          }}
        >
          <FlagGlyph size={12} />
          Flag mode
        </button>

        <span className="ml-auto pr-2 text-[11.5px] tabular-nums" style={{ color: "var(--os-muted)" }}>
          {LEVELS[state.level].label}
          {best !== undefined ? ` · best ${clock(best)}` : ""}
        </span>

        {menuOpen && (
          <div
            role="menu"
            onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => e.stopPropagation()}
            className="absolute left-1.5 top-[calc(100%+4px)] z-20 w-[210px] overflow-hidden rounded-lg py-1 shadow-2xl"
            style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(20px)" }}
          >
            <MenuItem
              label="New game"
              hint="F2"
              onPick={() => {
                setMenuOpen(false)
                newGame()
              }}
            />
            <MenuSep />
            {LEVEL_ORDER.map((l) => (
              <MenuItem
                key={l}
                label={LEVELS[l].label}
                hint={`${LEVELS[l].cols}×${LEVELS[l].rows} · ${LEVELS[l].mines}`}
                checked={state.level === l}
                onPick={() => {
                  setMenuOpen(false)
                  newGame(l)
                }}
              />
            ))}
            <MenuSep />
            <MenuItem
              label="Marks (?)"
              checked={state.marksOn}
              onPick={() => {
                setMenuOpen(false)
                dispatch({ type: "marks" })
              }}
            />
          </div>
        )}
      </div>

      {/* ---------- scoreboard ---------- */}
      <div className="flex shrink-0 items-center justify-center px-3 pb-2 pt-3">
        <div
          className="flex w-full max-w-[420px] items-center justify-between gap-3 rounded-lg px-3 py-2"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
        >
          <Readout value={mines - flags} label="Mines remaining" />
          <button
            type="button"
            onClick={() => newGame()}
            aria-label="New game"
            title="New game"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-transform active:scale-95"
            style={{ background: "var(--os-hover)", border: "1px solid var(--os-border)" }}
          >
            <Face mood={face} />
          </button>
          <Readout value={seconds} label="Seconds elapsed" />
        </div>
      </div>

      {/* ---------- minefield ---------- */}
      <div ref={fitRef} className="os-scroll relative min-h-0 flex-1 overflow-auto p-3">
        {/* "safe center" keeps a board bigger than the window from being clipped
            out of reach; browsers that don't know it fall back to the classes. */}
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={{ justifyContent: "safe center", alignItems: "safe center" }}
        >
          <div
            className="os-no-select rounded-lg p-1.5"
            style={{ background: "var(--os-surface)", border: "1px solid var(--os-border)" }}
            onPointerDown={() => setPressing(true)}
            onContextMenu={(e: ReactMouseEvent<HTMLDivElement>) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <div
              ref={gridRef}
              onKeyDown={onGridKeyDown}
              role="group"
              aria-label={`Minefield, ${cols} by ${rows}, ${mines} mines`}
              className="grid overflow-hidden rounded"
              style={{
                gridTemplateColumns: `repeat(${cols}, ${size}px)`,
                gap: 1,
                background: "var(--os-border)",
                border: "1px solid var(--os-border)",
              }}
            >
              {cells.map((cell, i) => (
                <CellButton
                  key={i}
                  cell={cell}
                  index={i}
                  size={size}
                  cols={cols}
                  numbers={numbers}
                  over={over}
                  tab={i === cursor}
                  onMouseDown={onCellMouseDown}
                  onClick={onCellClick}
                  onContextMenu={onCellContextMenu}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- status bar ---------- */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-[11.5px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)", background: "var(--os-card)" }}
      >
        <span style={{ color: over ? "var(--os-fg)" : "var(--os-muted)" }}>
          {status === "won"
            ? `Cleared in ${clock(seconds)}${best === seconds ? " — new best" : ""}`
            : status === "lost"
              ? "Boom. Hit the face to try again."
              : status === "ready"
                ? "Click any square to begin — the first one is always safe."
                : `${state.opened} of ${total - mines} squares clear`}
        </span>
        <span className="ml-auto hidden sm:inline">
          Right-click flags · both buttons chord · arrows move · Enter opens · F flags
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Cell
 * ------------------------------------------------------------------ */

function CellButton({
  cell,
  index,
  size,
  cols,
  numbers,
  over,
  tab,
  onMouseDown,
  onClick,
  onContextMenu,
}: {
  cell: Cell
  index: number
  size: number
  cols: number
  numbers: string[]
  over: boolean
  tab: boolean
  onMouseDown: (e: ReactMouseEvent<HTMLButtonElement>, index: number) => void
  onClick: (index: number) => void
  onContextMenu: (e: ReactMouseEvent<HTMLButtonElement>, index: number) => void
}) {
  const row = Math.floor(index / cols) + 1
  const col = (index % cols) + 1

  const base: CSSProperties = {
    width: size,
    height: size,
    lineHeight: 1,
    position: "relative",
  }

  let body: ReactNode = null
  let label = `Row ${row}, column ${col}`

  if (cell.revealed) {
    base.background = cell.boom ? "var(--os-danger)" : "var(--os-surface)"
    if (cell.mine) {
      body = <MineGlyph size={Math.round(size * 0.66)} />
      label += cell.boom ? ", detonated mine" : ", mine"
    } else if (cell.wrong) {
      body = (
        <span className="relative grid place-items-center">
          <MineGlyph size={Math.round(size * 0.66)} />
          <Cross size={Math.round(size * 0.72)} />
        </span>
      )
      label += ", wrongly flagged"
    } else if (cell.adj > 0) {
      body = (
        <span style={{ color: numbers[cell.adj], fontSize: Math.round(size * 0.6), fontWeight: 700 }}>{cell.adj}</span>
      )
      label += `, ${cell.adj}`
    } else {
      label += ", empty"
    }
  } else {
    base.background = "linear-gradient(155deg, var(--os-active), var(--os-hover))"
    base.boxShadow = "inset 0 1px 0 var(--os-hover)"
    if (over) {
      base.opacity = 0.55
      base.cursor = "default"
    }
    if (cell.mark === 1) {
      body = <FlagGlyph size={Math.round(size * 0.66)} />
      label += ", flagged"
    } else if (cell.mark === 2) {
      body = (
        <span style={{ color: "var(--os-accent)", fontSize: Math.round(size * 0.62), fontWeight: 700 }}>?</span>
      )
      label += ", question mark"
    } else {
      label += ", hidden"
    }
  }

  return (
    <button
      type="button"
      data-idx={index}
      tabIndex={tab ? 0 : -1}
      aria-label={label}
      onMouseDown={(e) => onMouseDown(e, index)}
      onClick={() => onClick(index)}
      onContextMenu={(e) => onContextMenu(e, index)}
      className={`grid place-items-center outline-none tabular-nums ${
        cell.revealed || over ? "" : "hover:brightness-125"
      } focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--os-accent)]`}
      style={base}
    >
      {body}
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Artwork - all drawn here, all token-coloured
 * ------------------------------------------------------------------ */

function MineGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <g fill="var(--os-fg)">
        <rect x="11" y="1.5" width="2" height="21" rx="1" />
        <rect x="1.5" y="11" width="21" height="2" rx="1" />
        <rect
          x="11"
          y="1.5"
          width="2"
          height="21"
          rx="1"
          transform="rotate(45 12 12)"
        />
        <rect
          x="11"
          y="1.5"
          width="2"
          height="21"
          rx="1"
          transform="rotate(-45 12 12)"
        />
        <circle cx="12" cy="12" r="7" />
      </g>
      {/* the little gleam the original mines always had */}
      <rect x="8" y="8" width="3" height="3" rx="1" fill="var(--os-surface)" opacity="0.85" />
    </svg>
  )
}

function FlagGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M11 4.5 L4 8.2 L11 11.9 Z" fill="var(--os-danger)" />
      <rect x="10.6" y="3" width="1.9" height="14" rx="0.9" fill="var(--os-fg)" />
      <rect x="6.5" y="19.4" width="11" height="2.4" rx="1.2" fill="var(--os-fg)" />
      <rect x="8.6" y="16.6" width="6.8" height="2.4" rx="1.2" fill="var(--os-fg)" />
    </svg>
  )
}

function Cross({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      className="absolute inset-0 m-auto"
    >
      <g stroke="var(--os-danger)" strokeWidth="3.2" strokeLinecap="round">
        <line x1="4" y1="4" x2="20" y2="20" />
        <line x1="20" y1="4" x2="4" y2="20" />
      </g>
    </svg>
  )
}

type FaceMood = "happy" | "surprised" | "dead" | "cool"

function Face({ mood }: { mood: FaceMood }) {
  const fg = "var(--os-fg)"
  return (
    <svg width={26} height={26} viewBox="0 0 32 32" aria-hidden focusable="false">
      <circle cx="16" cy="16" r="13.5" fill="var(--os-accent-soft)" stroke="var(--os-border)" strokeWidth="1.5" />
      {mood === "dead" ? (
        <g stroke={fg} strokeWidth="2" strokeLinecap="round">
          <line x1="8.5" y1="10.5" x2="13.5" y2="15.5" />
          <line x1="13.5" y1="10.5" x2="8.5" y2="15.5" />
          <line x1="18.5" y1="10.5" x2="23.5" y2="15.5" />
          <line x1="23.5" y1="10.5" x2="18.5" y2="15.5" />
          <path d="M10.5 23 Q16 18.5 21.5 23" fill="none" />
        </g>
      ) : mood === "cool" ? (
        <g>
          <path
            d="M6.5 12.5 h19 v2.2 a4.6 4.6 0 0 1 -4.6 4.6 h-1.4 a3.4 3.4 0 0 1 -3.4 -3.4 a3.4 3.4 0 0 0 -0.2 0 a3.4 3.4 0 0 1 -3.4 3.4 h-1.4 a4.6 4.6 0 0 1 -4.6 -4.6 Z"
            fill={fg}
          />
          <path d="M11 23.5 Q16 27 21 23.5" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : mood === "surprised" ? (
        <g fill={fg}>
          <circle cx="11" cy="13" r="2.3" />
          <circle cx="21" cy="13" r="2.3" />
          <ellipse cx="16" cy="22" rx="3.2" ry="3.8" />
        </g>
      ) : (
        <g>
          <g fill={fg}>
            <circle cx="11" cy="13" r="2.1" />
            <circle cx="21" cy="13" r="2.1" />
          </g>
          <path d="M10 20 Q16 25.5 22 20" fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
    </svg>
  )
}

/* ---- three-digit seven-segment readout, drawn from scratch ---- */

const SEGMENTS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
}

const T = 2.4

function hbar(cy: number) {
  const x0 = 2
  const x1 = 12
  return `${x0},${cy} ${x0 + T / 2},${cy - T / 2} ${x1 - T / 2},${cy - T / 2} ${x1},${cy} ${x1 - T / 2},${cy + T / 2} ${x0 + T / 2},${cy + T / 2}`
}

function vbar(cx: number, y0: number, y1: number) {
  return `${cx},${y0} ${cx + T / 2},${y0 + T / 2} ${cx + T / 2},${y1 - T / 2} ${cx},${y1} ${cx - T / 2},${y1 - T / 2} ${cx - T / 2},${y0 + T / 2}`
}

const SEG_SHAPE: Record<string, string> = {
  a: hbar(2),
  g: hbar(12),
  d: hbar(22),
  f: vbar(2, 2, 12),
  b: vbar(12, 2, 12),
  e: vbar(2, 12, 22),
  c: vbar(12, 12, 22),
}

function Digit({ char }: { char: string }) {
  const lit = SEGMENTS[char] ?? ""
  return (
    <svg width={13} height={22} viewBox="0 0 14 24" aria-hidden focusable="false">
      {Object.keys(SEG_SHAPE).map((k) => (
        <polygon
          key={k}
          points={SEG_SHAPE[k]}
          fill="var(--os-danger)"
          opacity={lit.indexOf(k) >= 0 ? 1 : 0.13}
        />
      ))}
    </svg>
  )
}

/** Three digits, negative-aware, exactly like the original counters. */
function Readout({ value, label }: { value: number; label: string }) {
  let text: string
  if (value < 0) {
    const n = Math.min(99, -value)
    text = `-${n < 10 ? "0" : ""}${n}`
  } else {
    const n = Math.min(999, value)
    text = n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`
  }

  return (
    <span
      role="img"
      aria-label={`${label}: ${value}`}
      className="flex items-center gap-[3px] rounded-md px-2 py-1.5"
      style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
    >
      {text.split("").map((ch, i) => (
        <Digit key={i} char={ch} />
      ))}
    </span>
  )
}

/* ---- menu bits ---- */

function MenuItem({
  label,
  hint,
  checked,
  onPick,
}: {
  label: string
  hint?: string
  checked?: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onPick}
      className="flex w-full items-center gap-2 px-2.5 py-[7px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ color: "var(--os-fg)" }}
    >
      <span className="w-3 shrink-0 text-center" style={{ color: "var(--os-accent)" }}>
        {checked ? "•" : ""}
      </span>
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className="shrink-0 text-[11px] tabular-nums" style={{ color: "var(--os-muted)" }}>
          {hint}
        </span>
      )}
    </button>
  )
}

function MenuSep() {
  return <div className="my-1 h-px" style={{ background: "var(--os-border)" }} />
}

function clock(total: number): string {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? "0" : ""}${s}`
}
