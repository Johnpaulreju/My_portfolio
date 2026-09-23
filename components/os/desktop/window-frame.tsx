"use client"

import { useCallback, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import { Minus, Square, X, Copy } from "lucide-react"
import { useWM, MIN_W, MIN_H } from "@/lib/os/wm-store"
import type { Point, Size, WindowInstance } from "@/lib/os/types"
import { AppIcon } from "@/components/os/app-icon"

type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

const HANDLES: { dir: Handle; className: string; cursor: string }[] = [
  { dir: "n", className: "left-2 right-2 top-0 h-1.5", cursor: "ns-resize" },
  { dir: "s", className: "left-2 right-2 bottom-0 h-1.5", cursor: "ns-resize" },
  { dir: "w", className: "top-2 bottom-2 left-0 w-1.5", cursor: "ew-resize" },
  { dir: "e", className: "top-2 bottom-2 right-0 w-1.5", cursor: "ew-resize" },
  { dir: "nw", className: "left-0 top-0 h-3 w-3", cursor: "nwse-resize" },
  { dir: "ne", className: "right-0 top-0 h-3 w-3", cursor: "nesw-resize" },
  { dir: "sw", className: "left-0 bottom-0 h-3 w-3", cursor: "nesw-resize" },
  { dir: "se", className: "right-0 bottom-0 h-3 w-3", cursor: "nwse-resize" },
]

const SNAP_EDGE = 12

export function WindowFrame({ win, children }: { win: WindowInstance; children: ReactNode }) {
  const { focus, close, minimize, toggleMaximize, move, resize, snap, bounds, focusedId } = useWM()
  const active = focusedId === win.id

  // Geometry is tracked locally while a gesture is in flight so only this window
  // re-renders on pointermove; the store is updated once, on release.
  const [ghost, setGhost] = useState<{ pos: Point; size: Size } | null>(null)
  const [snapHint, setSnapHint] = useState<"left" | "right" | "max" | null>(null)
  const gesture = useRef<{ kind: "move" | Handle; sx: number; sy: number; orig: { pos: Point; size: Size } } | null>(null)

  const pos = ghost?.pos ?? win.pos
  const size = ghost?.size ?? win.size

  const endGesture = useCallback(() => {
    const g = gesture.current
    gesture.current = null
    setGhost(null)
    setSnapHint(null)
    return g
  }, [])

  const onTitlePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("[data-no-drag]")) return

    focus(win.id)
    e.currentTarget.setPointerCapture(e.pointerId)

    // Dragging a maximized window tears it loose, cursor-relative, like Windows does.
    let orig = { pos: win.pos, size: win.size }
    if (win.maximized || win.snapped) {
      const r = win.restore ?? { pos: { x: 80, y: 80 }, size: { w: 900, h: 600 } }
      const ratio = (e.clientX - win.pos.x) / Math.max(1, win.size.w)
      orig = { pos: { x: e.clientX - r.size.w * ratio, y: Math.max(0, e.clientY - 16) }, size: r.size }
      setGhost(orig)
    }
    gesture.current = { kind: "move", sx: e.clientX, sy: e.clientY, orig }
  }

  const onResizePointerDown = (dir: Handle) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.stopPropagation()
    focus(win.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = { kind: dir, sx: e.clientX, sy: e.clientY, orig: { pos: win.pos, size: win.size } }
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy

    if (g.kind === "move") {
      const next = { x: g.orig.pos.x + dx, y: Math.max(0, g.orig.pos.y + dy) }
      setGhost({ pos: next, size: g.orig.size })
      if (e.clientY <= SNAP_EDGE) setSnapHint("max")
      else if (e.clientX <= SNAP_EDGE) setSnapHint("left")
      else if (e.clientX >= bounds.w - SNAP_EDGE) setSnapHint("right")
      else setSnapHint(null)
      return
    }

    const dir = g.kind
    let { x, y } = g.orig.pos
    let { w, h } = g.orig.size

    if (dir.includes("e")) w = g.orig.size.w + dx
    if (dir.includes("s")) h = g.orig.size.h + dy
    if (dir.includes("w")) {
      w = g.orig.size.w - dx
      // Clamp x so the left edge stops moving once the window hits its minimum width.
      x = g.orig.pos.x + Math.min(dx, g.orig.size.w - MIN_W)
    }
    if (dir.includes("n")) {
      h = g.orig.size.h - dy
      y = g.orig.pos.y + Math.min(dy, g.orig.size.h - MIN_H)
    }
    setGhost({ pos: { x, y }, size: { w: Math.max(MIN_W, w), h: Math.max(MIN_H, h) } })
  }

  const onPointerUp = () => {
    const g = gesture.current
    if (!g) return
    const hint = snapHint
    const final = ghost
    endGesture()
    if (!final) return

    if (g.kind === "move") {
      if (hint === "max") toggleMaximize(win.id)
      else if (hint === "left" || hint === "right") snap(win.id, hint)
      else move(win.id, final.pos)
    } else {
      resize(win.id, final.pos, final.size)
    }
  }

  if (win.minimized) return null

  return (
    <>
      {snapHint && (
        <div
          className="pointer-events-none fixed z-[60] rounded-lg border-2 border-white/60 bg-white/20 backdrop-blur-sm transition-all duration-150"
          style={
            snapHint === "max"
              ? { left: 0, top: 0, width: bounds.w, height: bounds.h }
              : {
                  left: snapHint === "left" ? 0 : bounds.w / 2,
                  top: 0,
                  width: bounds.w / 2,
                  height: bounds.h,
                }
          }
        />
      )}

      <div
        className="absolute flex flex-col overflow-hidden rounded-lg will-change-transform"
        style={{
          left: pos.x,
          top: pos.y,
          width: size.w,
          height: size.h,
          zIndex: win.z,
          background: "var(--os-window)",
          border: "1px solid var(--os-border)",
          boxShadow: active
            ? "0 24px 60px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)"
            : "0 10px 28px rgba(0,0,0,.35)",
          transition: gesture.current ? "none" : "left .12s ease, top .12s ease, width .12s ease, height .12s ease",
        }}
        onPointerDown={() => focus(win.id)}
        role="dialog"
        aria-label={win.title}
      >
        {/* Title bar */}
        <div
          className="flex h-9 shrink-0 select-none items-center gap-2 pl-3 pr-0"
          style={{ background: "var(--os-chrome)", cursor: gesture.current?.kind === "move" ? "grabbing" : "default" }}
          onPointerDown={onTitlePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => toggleMaximize(win.id)}
        >
          <AppIcon appId={win.appId} size={16} />
          <span
            className="flex-1 truncate text-[12.5px]"
            style={{ color: active ? "var(--os-fg)" : "var(--os-muted)" }}
          >
            {win.title}
          </span>

          <div className="flex h-full items-stretch" data-no-drag>
            <TitleButton label="Minimize" onClick={() => minimize(win.id)}>
              <Minus size={14} />
            </TitleButton>
            <TitleButton label={win.maximized ? "Restore" : "Maximize"} onClick={() => toggleMaximize(win.id)}>
              {win.maximized ? <Copy size={11} className="-scale-x-100" /> : <Square size={11} />}
            </TitleButton>
            <TitleButton label="Close" danger onClick={() => close(win.id)}>
              <X size={15} />
            </TitleButton>
          </div>
        </div>

        {/* App surface */}
        <div className="relative min-h-0 flex-1 overflow-hidden" style={{ background: "var(--os-surface)" }}>
          {children}
        </div>

        {/* A drag in progress must not let the pointer fall into the app below. */}
        {gesture.current && <div className="absolute inset-0 z-10" />}

        {!win.maximized &&
          HANDLES.map((h) => (
            <div
              key={h.dir}
              className={`absolute z-20 ${h.className}`}
              style={{ cursor: h.cursor }}
              onPointerDown={onResizePointerDown(h.dir)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          ))}
      </div>
    </>
  )
}

function TitleButton({
  children,
  onClick,
  label,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`grid w-[46px] place-items-center text-[var(--os-fg)] transition-colors ${
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-[var(--os-hover)]"
      }`}
    >
      {children}
    </button>
  )
}
