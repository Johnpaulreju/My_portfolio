"use client"

import { useRef, type ReactNode } from "react"

/** Only this handle owns a vertical pull. All surrounding content scrolls normally. */
export function PullHandle({ children, label, onTap, onPullDown, onPullUp, className = "", expanded }: {
  children: ReactNode
  label: string
  onTap: () => void
  onPullDown?: () => void
  onPullUp?: () => void
  className?: string
  expanded?: boolean
}) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null)
  const pulled = useRef(false)
  return (
    <button
      type="button"
      className={`phone-touch ${className}`}
      aria-label={label}
      aria-expanded={expanded}
      style={{ touchAction: "pan-x pinch-zoom" }}
      onPointerDown={(e) => {
        pulled.current = false
        if (!e.isPrimary || e.button !== 0) { start.current = null; return }
        start.current = { id: e.pointerId, x: e.clientX, y: e.clientY }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerUp={(e) => {
        const from = start.current
        start.current = null
        if (!from || from.id !== e.pointerId) return
        const dy = e.clientY - from.y
        const dx = e.clientX - from.x
        if (Math.abs(dy) >= 56 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          pulled.current = true
          if (dy > 0) onPullDown?.()
          else onPullUp?.()
        }
      }}
      onPointerCancel={() => { start.current = null; pulled.current = true }}
      onLostPointerCapture={() => { start.current = null }}
      onClick={() => {
        if (pulled.current) { pulled.current = false; return }
        onTap()
      }}
    >{children}</button>
  )
}
