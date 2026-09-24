"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, MouseEvent, ReactNode } from "react"
import { RotateCcw, Shuffle, Timer, Trophy, Undo2, Wand2 } from "lucide-react"
import type { WindowInstance } from "@/lib/os/types"
import { playSfx } from "@/lib/os/sfx"

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

type Suit = "S" | "H" | "D" | "C"

/** Foundation `i` is permanently the home of `SUITS[i]`. */
const SUITS: Suit[] = ["S", "H", "D", "C"]
const GLYPH: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" }
const NAME: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" }
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

const isRed = (s: Suit) => s === "H" || s === "D"

type Card = { id: string; suit: Suit; rank: number; up: boolean }

type Game = {
  stock: Card[]
  waste: Card[]
  /** Four piles, index-aligned with SUITS. */
  foundations: Card[][]
  /** Seven piles, index 0 is leftmost. */
  tableau: Card[][]
  moves: number
  recycles: number
}

/* ------------------------------------------------------------------ *
 * Seeded shuffle
 *
 * mulberry32 keeps every deal reproducible, so "Same deal" can re-deal the
 * exact layout you just lost. The seed comes from a deal counter - never from
 * Math.random - which also keeps the first server render and the first client
 * render in agreement.
 * ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Spread consecutive deal numbers apart so deal 7 looks nothing like deal 8. */
const seedOf = (dealNo: number) => (Math.imul(dealNo, 0x9e3779b1) ^ 0x2f6e2b1) >>> 0

let dealCounter = 1
const nextDealNumber = () => ++dealCounter

function deal(dealNo: number): Game {
  const rand = mulberry32(seedOf(dealNo))
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) deck.push({ id: `${suit}${rank}`, suit, rank, up: false })
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }

  const tableau: Card[][] = []
  let k = 0
  for (let pile = 0; pile < 7; pile++) {
    const cards: Card[] = []
    for (let n = 0; n <= pile; n++) cards.push({ ...deck[k++], up: n === pile })
    tableau.push(cards)
  }
  return {
    stock: deck.slice(k).map((c) => ({ ...c, up: false })),
    waste: [],
    foundations: [[], [], [], []],
    tableau,
    moves: 0,
    recycles: 0,
  }
}

function clone(g: Game): Game {
  return {
    stock: g.stock.map((c) => ({ ...c })),
    waste: g.waste.map((c) => ({ ...c })),
    foundations: g.foundations.map((p) => p.map((c) => ({ ...c }))),
    tableau: g.tableau.map((p) => p.map((c) => ({ ...c }))),
    moves: g.moves,
    recycles: g.recycles,
  }
}

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

type Sel =
  | { zone: "waste" }
  | { zone: "foundation"; index: number }
  | { zone: "tableau"; pile: number; index: number }

type Dest = { zone: "foundation"; index: number } | { zone: "tableau"; pile: number }

/** Tableau builds DOWN in alternating colour; only a King opens an empty column. */
function canDropOnTableau(head: Card, pile: Card[]): boolean {
  if (pile.length === 0) return head.rank === 13
  const top = pile[pile.length - 1]
  if (!top.up) return false
  return top.rank === head.rank + 1 && isRed(top.suit) !== isRed(head.suit)
}

/** Foundations build UP by suit from the Ace. Length doubles as "top rank". */
function canDropOnFoundation(card: Card, foundation: Card[], index: number): boolean {
  if (card.suit !== SUITS[index]) return false
  return foundation.length === card.rank - 1
}

/**
 * The cards a selection would carry. A face-up tableau run is always a legal
 * alternating descent (it can only have been built by legal moves), so the run
 * moves whole and only its head is checked against the destination.
 */
function carried(g: Game, sel: Sel): Card[] {
  if (sel.zone === "waste") {
    const c = g.waste[g.waste.length - 1]
    return c ? [c] : []
  }
  if (sel.zone === "foundation") {
    const p = g.foundations[sel.index]
    const c = p[p.length - 1]
    return c ? [c] : []
  }
  const pile = g.tableau[sel.pile]
  if (sel.index < 0 || sel.index >= pile.length || !pile[sel.index].up) return []
  return pile.slice(sel.index)
}

function flipExposed(g: Game) {
  for (const pile of g.tableau) {
    const top = pile[pile.length - 1]
    if (top && !top.up) top.up = true
  }
}

/** Mutates `g`. Returns false and leaves `g` untouched when the move is illegal. */
function applyMove(g: Game, sel: Sel, dest: Dest): boolean {
  const moving = carried(g, sel)
  if (moving.length === 0) return false

  if (dest.zone === "foundation") {
    if (moving.length !== 1) return false
    if (sel.zone === "foundation" && sel.index === dest.index) return false
    if (!canDropOnFoundation(moving[0], g.foundations[dest.index], dest.index)) return false
  } else {
    if (sel.zone === "tableau" && sel.pile === dest.pile) return false
    if (!canDropOnTableau(moving[0], g.tableau[dest.pile])) return false
  }

  if (sel.zone === "waste") g.waste.pop()
  else if (sel.zone === "foundation") g.foundations[sel.index].pop()
  else g.tableau[sel.pile].splice(sel.index)

  const landing = moving.map((c) => ({ ...c, up: true }))
  if (dest.zone === "foundation") g.foundations[dest.index].push(...landing)
  else g.tableau[dest.pile].push(...landing)

  flipExposed(g)
  g.moves += 1
  return true
}

/** Draw-1. An empty stock recycles the waste in its original order. */
function applyDraw(g: Game): boolean {
  if (g.stock.length > 0) {
    const c = g.stock.pop() as Card
    c.up = true
    g.waste.push(c)
    g.moves += 1
    return true
  }
  if (g.waste.length > 0) {
    while (g.waste.length > 0) {
      const c = g.waste.pop() as Card
      c.up = false
      g.stock.push(c)
    }
    g.recycles += 1
    g.moves += 1
    return true
  }
  return false
}

function foundationFor(g: Game, card: Card): number {
  const i = SUITS.indexOf(card.suit)
  return canDropOnFoundation(card, g.foundations[i], i) ? i : -1
}

const isWon = (g: Game) => g.foundations.every((f) => f.length === 13)

/** Only offered once the tableau is fully face-up, where it always terminates. */
function autoFinish(g: Game): boolean {
  let progressed = false
  let idleDraws = 0
  for (let guard = 0; guard < 800; guard++) {
    if (isWon(g)) break
    const sources: Sel[] = []
    if (g.waste.length > 0) sources.push({ zone: "waste" })
    for (let i = 0; i < 7; i++) {
      if (g.tableau[i].length > 0) sources.push({ zone: "tableau", pile: i, index: g.tableau[i].length - 1 })
    }
    let moved = false
    for (const src of sources) {
      const cards = carried(g, src)
      if (cards.length !== 1) continue
      const f = foundationFor(g, cards[0])
      if (f >= 0 && applyMove(g, src, { zone: "foundation", index: f })) {
        moved = true
        progressed = true
        break
      }
    }
    if (moved) {
      idleDraws = 0
      continue
    }
    const remaining = g.stock.length + g.waste.length
    // Nothing playable and nothing left to cycle, or a full cycle found nothing.
    if (remaining === 0 || idleDraws > remaining) break
    if (!applyDraw(g)) break
    idleDraws += 1
    progressed = true
  }
  return progressed
}

/* ------------------------------------------------------------------ *
 * Paint
 * ------------------------------------------------------------------ */

/** An opaque card face: the translucent card token laid over the solid surface. */
const FACE_BG = "linear-gradient(var(--os-card), var(--os-card)), var(--os-surface)"
/** Red pips keep their hue but lean toward the foreground so both themes stay legible. */
const RED = "color-mix(in srgb, var(--os-danger) 70%, var(--os-fg))"

function backBg(w: number) {
  const p = Math.max(3, Math.round(w * 0.085))
  const ink = "color-mix(in srgb, var(--os-on-accent) 20%, transparent)"
  return [
    `repeating-linear-gradient(45deg, ${ink} 0 ${p}px, transparent ${p}px ${p * 2}px)`,
    `repeating-linear-gradient(-45deg, ${ink} 0 ${p}px, transparent ${p}px ${p * 2}px)`,
    "linear-gradient(155deg, var(--os-accent), color-mix(in srgb, var(--os-accent) 52%, var(--os-surface)))",
  ].join(", ")
}

function PlayingCard({
  card,
  w,
  h,
  selected = false,
  top = 0,
  onClick,
  onDoubleClick,
}: {
  card: Card
  w: number
  h: number
  selected?: boolean
  top?: number
  onClick?: (e: MouseEvent) => void
  onDoubleClick?: (e: MouseEvent) => void
}) {
  const r = Math.max(4, Math.round(w * 0.11))
  const label = card.up ? `${RANKS[card.rank]} of ${NAME[card.suit]}` : "Face-down card"
  const corner = Math.max(9, Math.round(w * 0.3))

  return (
    <button
      type="button"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-label={label}
      aria-pressed={selected}
      className="absolute left-0 overflow-hidden text-left"
      style={{
        top,
        width: w,
        height: h,
        borderRadius: r,
        background: card.up ? FACE_BG : backBg(w),
        border: `1px solid ${selected ? "var(--os-accent)" : "var(--os-border)"}`,
        boxShadow: selected
          ? "0 0 0 2px var(--os-accent), 0 8px 18px var(--os-scrim)"
          : "0 1px 3px var(--os-scrim)",
        transform: selected ? "translateY(-3px)" : "none",
        transition: "transform .12s ease, box-shadow .12s ease",
      }}
    >
      {card.up ? (
        <span
          className="pointer-events-none absolute inset-0 select-none"
          style={{ color: isRed(card.suit) ? RED : "var(--os-fg)" }}
        >
          <span
            className="absolute font-semibold leading-none"
            style={{ left: Math.round(w * 0.1), top: Math.round(h * 0.07), fontSize: corner }}
          >
            {RANKS[card.rank]}
          </span>
          <span
            className="absolute leading-none"
            style={{
              left: Math.round(w * 0.1),
              top: Math.round(h * 0.07) + corner + 1,
              fontSize: Math.max(8, Math.round(w * 0.24)),
            }}
          >
            {GLYPH[card.suit]}
          </span>
          <span
            className="absolute leading-none"
            style={{
              right: Math.round(w * 0.11),
              bottom: Math.round(h * 0.07),
              fontSize: Math.max(14, Math.round(w * 0.5)),
              opacity: 0.92,
            }}
          >
            {GLYPH[card.suit]}
          </span>
        </span>
      ) : (
        <span
          className="pointer-events-none absolute"
          style={{
            inset: Math.max(3, Math.round(w * 0.08)),
            borderRadius: Math.max(3, Math.round(w * 0.07)),
            border: "1px solid color-mix(in srgb, var(--os-on-accent) 28%, transparent)",
          }}
        />
      )}
    </button>
  )
}

function Slot({
  w,
  h,
  onClick,
  ariaLabel,
  active = false,
  children,
  style,
}: {
  w: number
  h: number
  onClick?: () => void
  ariaLabel: string
  active?: boolean
  children?: ReactNode
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="absolute left-0 top-0 grid place-items-center"
      style={{
        width: w,
        height: h,
        borderRadius: Math.max(4, Math.round(w * 0.11)),
        border: `1px dashed ${active ? "var(--os-accent)" : "var(--os-border)"}`,
        background: "var(--os-hover)",
        color: "var(--os-muted)",
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function ToolButton({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-[6px] text-[12.5px] transition-colors enabled:hover:bg-[var(--os-hover)] disabled:opacity-40"
      style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)", background: "var(--os-card)" }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function clock(total: number) {
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s < 10 ? "0" : ""}${s}`
}

/* ------------------------------------------------------------------ *
 * App
 * ------------------------------------------------------------------ */

export function SolitaireApp(_props: { win?: WindowInstance } = {}) {
  const [dealNo, setDealNo] = useState(1)
  const [game, setGame] = useState<Game>(() => deal(1))
  const [undoStack, setUndoStack] = useState<Game[]>([])
  const [sel, setSel] = useState<Sel | null>(null)
  const [started, setStarted] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  const won = useMemo(() => isWon(game), [game])

  /* --- geometry ------------------------------------------------- */
  const boardRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({ w: 72, gap: 10 })

  useEffect(() => {
    const el = boardRef.current
    if (!el) return
    const measure = () => {
      const avail = el.clientWidth
      if (avail <= 0) return
      const gap = avail < 480 ? 5 : 9
      const w = Math.max(34, Math.min(96, Math.floor((avail - gap * 6) / 7)))
      setMetrics((m) => (m.w === w && m.gap === gap ? m : { w, gap }))
    }
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const cardW = metrics.w
  const cardH = Math.round(cardW * 1.42)
  const radius = Math.max(4, Math.round(cardW * 0.11))

  /** Stack spacing, compressed when a column grows long so nothing is lost. */
  const { stepUp, stepDown } = useMemo(() => {
    const baseUp = Math.max(11, Math.round(cardH * 0.26))
    const baseDown = Math.max(6, Math.round(cardH * 0.13))
    let travel = 0
    for (const pile of game.tableau) {
      let t = 0
      for (let i = 0; i < pile.length - 1; i++) t += pile[i].up ? baseUp : baseDown
      travel = Math.max(travel, t)
    }
    const budget = cardH * 3.4
    const scale = travel > budget ? Math.max(0.45, budget / travel) : 1
    return { stepUp: Math.max(9, Math.round(baseUp * scale)), stepDown: Math.max(5, Math.round(baseDown * scale)) }
  }, [game, cardH])

  /* --- timer ---------------------------------------------------- */
  useEffect(() => {
    if (!started || won) return
    const t = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => window.clearInterval(t)
  }, [started, won])

  useEffect(() => {
    if (won) playSfx("notify")
  }, [won])

  /* --- actions -------------------------------------------------- */
  const start = (n: number) => {
    setDealNo(n)
    setGame(deal(n))
    setUndoStack([])
    setSel(null)
    setStarted(false)
    setElapsed(0)
  }

  const commit = (next: Game) => {
    const before = clone(game)
    setUndoStack((u) => (u.length >= 240 ? [...u.slice(1), before] : [...u, before]))
    setGame(next)
    setSel(null)
    setStarted(true)
  }

  const tryMove = (from: Sel, dest: Dest) => {
    const next = clone(game)
    if (!applyMove(next, from, dest)) return false
    commit(next)
    return true
  }

  const undo = () => {
    if (undoStack.length === 0) return
    setGame(undoStack[undoStack.length - 1])
    setUndoStack((u) => u.slice(0, -1))
    setSel(null)
  }

  const drawStock = () => {
    const next = clone(game)
    if (!applyDraw(next)) return
    commit(next)
  }

  const sendToFoundation = (from: Sel) => {
    const cards = carried(game, from)
    if (cards.length !== 1) return
    const f = foundationFor(game, cards[0])
    if (f < 0) return
    tryMove(from, { zone: "foundation", index: f })
  }

  const runAutoFinish = () => {
    const next = clone(game)
    if (!autoFinish(next)) return
    commit(next)
  }

  const clickWaste = () => {
    if (game.waste.length === 0) {
      setSel(null)
      return
    }
    setSel(sel && sel.zone === "waste" ? null : { zone: "waste" })
  }

  const clickFoundation = (index: number) => {
    if (sel && tryMove(sel, { zone: "foundation", index })) return
    if (game.foundations[index].length === 0) {
      setSel(null)
      return
    }
    setSel(sel && sel.zone === "foundation" && sel.index === index ? null : { zone: "foundation", index })
  }

  const clickTableau = (pile: number, index: number | null) => {
    if (sel && tryMove(sel, { zone: "tableau", pile })) return
    const cards = game.tableau[pile]
    if (index === null || index < 0 || index >= cards.length || !cards[index].up) {
      setSel(null)
      return
    }
    const same = sel && sel.zone === "tableau" && sel.pile === pile && sel.index === index
    setSel(same ? null : { zone: "tableau", pile, index })
  }

  const inSelectedRun = (pile: number, index: number) =>
    !!sel && sel.zone === "tableau" && sel.pile === pile && index >= sel.index

  const canAuto = !won && game.tableau.every((p) => p.every((c) => c.up)) && game.foundations.some((f) => f.length < 13)

  const columns: CSSProperties = {
    display: "grid",
    gridTemplateColumns: `repeat(7, ${cardW}px)`,
    columnGap: metrics.gap,
    justifyContent: "space-between",
  }

  /* --- render --------------------------------------------------- */
  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header
        className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <ToolButton icon={<Shuffle size={14} />} label="New game" onClick={() => start(nextDealNumber())} />
        <ToolButton icon={<RotateCcw size={14} />} label="Same deal" onClick={() => start(dealNo)} />
        <ToolButton icon={<Undo2 size={14} />} label="Undo" onClick={undo} disabled={undoStack.length === 0} />
        <ToolButton icon={<Wand2 size={14} />} label="Auto-finish" onClick={runAutoFinish} disabled={!canAuto} />
        <div
          className="ml-auto flex items-center gap-3 pl-2 text-[12px] tabular-nums"
          style={{ color: "var(--os-muted)" }}
        >
          <span className="hidden sm:inline">Deal #{dealNo}</span>
          <span>{game.moves} moves</span>
          <span className="inline-flex items-center gap-1">
            <Timer size={13} />
            {clock(elapsed)}
          </span>
        </div>
      </header>

      <div
        className="os-scroll min-h-0 flex-1 overflow-auto p-3"
        style={{
          background:
            "radial-gradient(130% 95% at 50% -10%, color-mix(in srgb, var(--os-accent) 17%, var(--os-surface)), var(--os-surface))",
        }}
        onClick={() => setSel(null)}
      >
        <div ref={boardRef} className="mx-auto" style={{ maxWidth: 780 }}>
          {/* Stock + waste, then the four foundations. */}
          <div style={{ ...columns, marginBottom: Math.max(18, Math.round(cardH * 0.24)) }}>
            <div className="relative" style={{ height: cardH }} onClick={(e) => e.stopPropagation()}>
              {game.stock.length > 0 ? (
                <PlayingCard
                  card={{ id: "stock", suit: "S", rank: 0, up: false }}
                  w={cardW}
                  h={cardH}
                  onClick={(e) => {
                    e.stopPropagation()
                    drawStock()
                  }}
                />
              ) : (
                <Slot w={cardW} h={cardH} ariaLabel="Recycle waste into the stock" onClick={drawStock}>
                  <RotateCcw size={Math.max(12, Math.round(cardW * 0.3))} />
                </Slot>
              )}
              <span
                className="pointer-events-none absolute -bottom-[15px] left-0 w-full text-center text-[10px] tabular-nums"
                style={{ color: "var(--os-muted)" }}
              >
                {game.stock.length}
              </span>
            </div>

            <div className="relative" style={{ height: cardH }} onClick={(e) => e.stopPropagation()}>
              {game.waste.length > 0 ? (
                <PlayingCard
                  card={game.waste[game.waste.length - 1]}
                  w={cardW}
                  h={cardH}
                  selected={!!sel && sel.zone === "waste"}
                  onClick={(e) => {
                    e.stopPropagation()
                    clickWaste()
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    sendToFoundation({ zone: "waste" })
                  }}
                />
              ) : (
                <Slot w={cardW} h={cardH} ariaLabel="Waste pile, empty" onClick={() => setSel(null)} />
              )}
            </div>

            <div />

            {SUITS.map((suit, i) => {
              const pile = game.foundations[i]
              const topCard = pile[pile.length - 1]
              return (
                <div
                  key={suit}
                  className="relative"
                  style={{ height: cardH }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {topCard ? (
                    <PlayingCard
                      card={topCard}
                      w={cardW}
                      h={cardH}
                      selected={!!sel && sel.zone === "foundation" && sel.index === i}
                      onClick={(e) => {
                        e.stopPropagation()
                        clickFoundation(i)
                      }}
                    />
                  ) : (
                    <Slot
                      w={cardW}
                      h={cardH}
                      ariaLabel={`Foundation for ${NAME[suit]}, empty`}
                      active={!!sel}
                      onClick={() => clickFoundation(i)}
                    >
                      <span
                        style={{
                          fontSize: Math.max(13, Math.round(cardW * 0.42)),
                          color: "color-mix(in srgb, var(--os-fg) 26%, transparent)",
                        }}
                      >
                        {GLYPH[suit]}
                      </span>
                    </Slot>
                  )}
                </div>
              )
            })}
          </div>

          {/* Seven tableau columns. */}
          <div style={{ ...columns, alignItems: "start" }}>
            {game.tableau.map((pile, p) => {
              const tops: number[] = []
              let y = 0
              for (let i = 0; i < pile.length; i++) {
                tops.push(y)
                y += pile[i].up ? stepUp : stepDown
              }
              const height = pile.length === 0 ? cardH : tops[pile.length - 1] + cardH

              return (
                <div
                  key={p}
                  className="relative"
                  style={{ height, minHeight: cardH }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {pile.length === 0 ? (
                    <Slot
                      w={cardW}
                      h={cardH}
                      ariaLabel={`Empty column ${p + 1}, Kings only`}
                      active={!!sel && carried(game, sel)[0]?.rank === 13}
                      onClick={() => clickTableau(p, null)}
                    />
                  ) : (
                    <button
                      type="button"
                      aria-label={`Column ${p + 1}`}
                      onClick={() => clickTableau(p, null)}
                      className="absolute inset-0"
                      style={{ borderRadius: radius }}
                    />
                  )}
                  {pile.map((card, i) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      w={cardW}
                      h={cardH}
                      top={tops[i]}
                      selected={inSelectedRun(p, i)}
                      onClick={(e) => {
                        e.stopPropagation()
                        clickTableau(p, i)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        sendToFoundation({ zone: "tableau", pile: p, index: i })
                      }}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          <p className="pt-4 text-center text-[11px]" style={{ color: "var(--os-muted)" }}>
            Click a card, then click where it goes. Double-click sends it straight to a foundation.
          </p>
        </div>
      </div>

      {won && (
        <div className="absolute inset-0 z-20 grid place-items-center p-6" style={{ background: "var(--os-scrim)" }}>
          <div
            className="w-full max-w-[300px] rounded-xl px-5 py-6 text-center"
            style={{
              background: "var(--os-menu)",
              border: "1px solid var(--os-border)",
              backdropFilter: "blur(22px)",
              boxShadow: "0 18px 44px var(--os-scrim)",
            }}
          >
            <span
              className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full"
              style={{ background: "var(--os-accent-soft)", color: "var(--os-accent)" }}
            >
              <Trophy size={20} />
            </span>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--os-fg)" }}>
              All fifty-two home
            </h2>
            <p className="mt-1 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
              Deal #{dealNo} cleared in {game.moves} moves and {clock(elapsed)}.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <ToolButton icon={<Shuffle size={14} />} label="New game" onClick={() => start(nextDealNumber())} />
              <ToolButton icon={<RotateCcw size={14} />} label="Replay" onClick={() => start(dealNo)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
