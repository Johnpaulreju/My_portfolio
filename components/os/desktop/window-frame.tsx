"use client"

import { inertProps } from "@/components/os/shell-dom"

import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import { Minus, Square, X, Copy } from "lucide-react"
import { useWM, MIN_W, MIN_H, fitGeometry } from "@/lib/os/wm-store"
import type { Point, Size, WindowInstance } from "@/lib/os/types"
import { AppIcon } from "@/components/os/app-icon"
import { APP_META } from "@/lib/os/app-meta"
import { launchOrigin, reducedMotion, takeLaunch } from "@/lib/os/phone-home"

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
/** A press must travel this far before it counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4

export function WindowFrame({ win, children, mobile = false, visible = true, powered = true }: { win: WindowInstance; children: ReactNode; mobile?: boolean; visible?: boolean; powered?: boolean }) {
  const { focus, close, minimize, toggleMaximize, resize, snap, bounds, focusedId } = useWM()
  const active = focusedId === win.id
  const hidden = win.minimized || !visible
  const frameRef = useRef<HTMLDivElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!active || hidden || !powered) return
    const frame = frameRef.current
    const raf = requestAnimationFrame(() => {
      if (!frame || frame.closest("[inert]")) return
      if (frame.contains(document.activeElement)) return
      const target = lastFocus.current
      if (target?.isConnected && !target.closest("[inert]")) target.focus({ preventScroll: true })
      else frame.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [active, hidden, mobile, powered])

  useEffect(() => {
    const frame = frameRef.current
    if (!hidden || !frame?.contains(document.activeElement)) return
    const raf = requestAnimationFrame(() => {
      const state = useWM.getState()
      const target = state.focusedId
        ? document.querySelector<HTMLElement>(`[data-window-id="${state.focusedId}"]`)
        : document.querySelector<HTMLElement>(mobile ? '[data-phone-home]' : `[data-task-app="${win.appId}"]`)
      if (target && !target.closest("[inert]")) target.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [hidden, mobile, win.appId])

  // Phone only: grow out of the icon that was tapped, and shrink back into it on Home.
  // Transform and opacity only, so it stays smooth; skipped when motion is reduced. Launches and Home
  // come from clicks and keys, and React runs effects of those renders before the browser paints.
  const wasHidden = useRef(true)
  useEffect(() => {
    const frame = frameRef.current
    const opening = wasHidden.current && !hidden
    const goingHome = !wasHidden.current && hidden && win.minimized
    wasHidden.current = hidden
    if (!mobile || !frame || typeof frame.animate !== "function" || (!opening && !goingHome)) return
    const from = opening ? takeLaunch(win.appId) : launchOrigin(win.appId)
    if (!from || reducedMotion()) return
    const box = (frame.offsetParent ?? frame).getBoundingClientRect()
    if (!box.width || !box.height) return
    const scale = Math.max(0.08, from.w / box.width)
    const icon = `translate(${from.x + from.w / 2 - (box.left + box.width / 2)}px, ${from.y + from.h / 2 - (box.top + box.height / 2)}px) scale(${scale})`
    const keyframes = opening
      ? [{ transform: icon, opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: "none", opacity: 1 }]
      : [{ transform: "none", opacity: 1, visibility: "visible" }, { transform: icon, opacity: 0, visibility: "visible" }]
    frame.animate(keyframes, { duration: opening ? 250 : 200, easing: "cubic-bezier(.2,0,0,1)" })
  }, [hidden, mobile, win.appId, win.minimized])

  const isDialog = APP_META[win.appId].chrome === "dialog"

  // Geometry is tracked locally while a gesture is in flight so only this window
  // re-renders on pointermove; the store is updated once, on release.
  const [ghost, setGhost] = useState<{ pos: Point; size: Size } | null>(null)
  const [snapHint, setSnapHint] = useState<"left" | "right" | "max" | null>(null)
  const gesture = useRef<{
    kind: "move" | Handle
    sx: number
    sy: number
    orig: { pos: Point; size: Size }
    /** False until the drag threshold is crossed - a click never becomes a move. */
    active: boolean
  } | null>(null)

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
    if (mobile || e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest("[data-no-drag]")) return

    focus(win.id)
    // Pointer capture is deliberately NOT taken here. Capturing on pointerdown makes
    // Chromium swallow the follow-up dblclick, which silently kills double-click-to-
    // maximize. We capture only once the drag threshold is crossed.
    gesture.current = {
      kind: "move",
      sx: e.clientX,
      sy: e.clientY,
      orig: { pos: win.pos, size: win.size },
      active: false,
    }
  }

  const onResizePointerDown = (dir: Handle) => (e: RPointerEvent<HTMLDivElement>) => {
    if (mobile || e.button !== 0) return
    e.stopPropagation()
    focus(win.id)
    e.currentTarget.setPointerCapture(e.pointerId)
    // Resize handles have no dblclick behaviour, so capturing immediately is safe.
    gesture.current = { kind: dir, sx: e.clientX, sy: e.clientY, orig: { pos: win.pos, size: win.size }, active: true }
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    if (e.buttons === 0) { endGesture(); return }
    const dx = e.clientX - g.sx
    const dy = e.clientY - g.sy

    if (g.kind === "move") {
      if (!g.active) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        g.active = true
        e.currentTarget.setPointerCapture(e.pointerId)
        // Dragging a maximized window tears it loose, cursor-relative, like Windows does.
        if (win.maximized || win.snapped) {
          const r = fitGeometry(win.restore ?? { pos: { x: 80, y: 80 }, size: { w: 900, h: 600 } }, bounds)
          const ratio = (g.sx - win.pos.x) / Math.max(1, win.size.w)
          g.orig = { pos: { x: g.sx - r.size.w * ratio, y: Math.max(0, g.sy - 16) }, size: r.size }
        }
      }
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
    // A press that never crossed the threshold is a click, not a drag - commit nothing
    // so the dblclick that may follow is free to maximize.
    if (!g.active) {
      endGesture()
      return
    }
    const hint = snapHint
    const final = ghost
    endGesture()
    if (!final) return

    if (g.kind === "move") {
      // Commit the restored size and clear maximize/snap before applying an edge.
      // A position-only commit leaves a torn-off window maximized in the store.
      resize(win.id, final.pos, final.size)
      if (hint === "max") toggleMaximize(win.id)
      else if (hint === "left" || hint === "right") snap(win.id, hint)
    } else {
      resize(win.id, final.pos, final.size)
    }
  }

  return (
    <>
      {snapHint && !hidden && !mobile && (
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
        ref={frameRef}
        data-window-id={win.id}
        data-window
        tabIndex={-1}
        className={`absolute flex flex-col overflow-hidden outline-none ${mobile ? "" : "rounded-lg"}`}
        aria-hidden={hidden || undefined}
        {...inertProps(hidden)}
        style={{
          // Hidden, not unmounted: React keeps the app's state alive in the taskbar.
          left: mobile ? 0 : pos.x,
          top: mobile ? 0 : pos.y,
          width: mobile ? "100%" : size.w,
          height: mobile ? "100%" : size.h,
          opacity: hidden ? 0 : 1,
          visibility: hidden ? "hidden" : "visible",
          pointerEvents: hidden ? "none" : "auto",
          transform: hidden ? "translateY(18px) scale(.97)" : "none",
          zIndex: win.z,
          // Phone apps are opaque, like real Android apps; the home screen must not show through.
          background: mobile ? "var(--os-surface)" : "var(--os-window)",
          border: "1px solid var(--os-border)",
          boxShadow: mobile ? "none" : active
            ? "0 24px 60px rgba(0,0,0,.55), 0 2px 8px rgba(0,0,0,.4)"
            : "0 10px 28px rgba(0,0,0,.35)",
          transition: ghost ? "none" : `left .12s ease, top .12s ease, width .12s ease, height .12s ease, opacity .18s ease, transform .18s ease, visibility 0s ${hidden ? ".18s" : "0s"}`,
        }}
        onPointerDown={() => focus(win.id)}
        role="dialog"
        aria-label={win.title}
      >
        {/* Title bar */}
        <div
          className={`flex shrink-0 select-none items-center pr-0 ${mobile ? "phone-app-bar h-14 gap-3 pl-4" : "h-9 gap-2 pl-3"}`}
          style={{ background: mobile ? "var(--os-surface)" : "var(--os-chrome)", borderBottom: mobile ? "1px solid var(--os-border)" : undefined, cursor: ghost && gesture.current?.kind === "move" ? "grabbing" : "default" }}
          onPointerDown={onTitlePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onDoubleClick={() => !mobile && !isDialog && toggleMaximize(win.id)}
        >
          <AppIcon appId={win.appId} size={mobile ? 24 : 16} />
          <span
            className={`flex-1 truncate ${mobile ? "text-[17px] font-medium" : "text-[12.5px]"}`}
            style={{ color: active ? "var(--os-fg)" : "var(--os-muted)" }}
          >
            {win.title}
          </span>

          <div className="flex h-full items-stretch" data-no-drag>
            {!mobile && !isDialog && (
              <TitleButton label="Minimize" onClick={() => minimize(win.id)}>
                <Minus size={14} />
              </TitleButton>
            )}
            {!mobile && !isDialog && (
              <TitleButton label={win.maximized ? "Restore" : "Maximize"} onClick={() => toggleMaximize(win.id)}>
                {win.maximized ? <Copy size={11} className="-scale-x-100" /> : <Square size={11} />}
              </TitleButton>
            )}
            <TitleButton label="Close" danger onClick={() => close(win.id)}>
              <X size={15} />
            </TitleButton>
          </div>
        </div>

        {/* App surface */}
        <div className="relative min-h-0 flex-1 overflow-hidden" onFocusCapture={(e) => { lastFocus.current = e.target as HTMLElement }} style={{ background: "var(--os-surface)" }}>
          {children}
        </div>

        {/* A drag in progress must not let the pointer fall into the app below.
            Gated on `ghost`, not `gesture.current`: the latter is set on pointerdown,
            so the shield would cover the title bar and eat the dblclick. */}
        {ghost && <div className="absolute inset-0 z-10" />}

        {!mobile && !win.maximized &&
          !isDialog &&
          HANDLES.map((h) => (
            <div
              key={h.dir}
              className={`absolute z-20 ${h.className}`}
              style={{ cursor: h.cursor }}
              onPointerDown={onResizePointerDown(h.dir)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={endGesture}
              onLostPointerCapture={endGesture}
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
      className={`grid w-12 place-items-center text-[var(--os-fg)] transition-colors ${
        danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-[var(--os-hover)]"
      }`}
    >
      {children}
    </button>
  )
}
