"use client"

import { useCallback, useRef, type PointerEvent as RPointerEvent, type ReactNode } from "react"

/**
 * The Windows 11 Quick Settings slider: a filled track, a round thumb that grows
 * on hover, click-anywhere-to-jump, drag with pointer capture, and full keyboard
 * control. Used for both brightness and volume.
 */
export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  icon,
  trailing,
  disabled,
}: {
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  label: string
  icon?: ReactNode
  /** Optional control at the right end, e.g. the output-device chevron. */
  trailing?: ReactNode
  disabled?: boolean
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const pct = ((value - min) / (max - min)) * 100

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current
      if (!el) return value
      const r = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width)))
      const raw = min + ratio * (max - min)
      return Math.round(raw / step) * step
    },
    [min, max, step, value],
  )

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(valueFromClientX(e.clientX))
  }

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    onChange(valueFromClientX(e.clientX))
  }

  const endDrag = () => {
    dragging.current = false
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return
    const big = (max - min) / 10
    let next: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + step
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - step
    else if (e.key === "PageUp") next = value + big
    else if (e.key === "PageDown") next = value - big
    else if (e.key === "Home") next = min
    else if (e.key === "End") next = max
    if (next === null) return
    e.preventDefault()
    onChange(Math.min(max, Math.max(min, next)))
  }

  return (
    <div className="flex items-center gap-3" style={{ opacity: disabled ? 0.45 : 1 }}>
      {icon && (
        <span className="grid w-6 shrink-0 place-items-center" style={{ color: "var(--os-fg)" }}>
          {icon}
        </span>
      )}

      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        className="group relative h-6 flex-1 cursor-pointer touch-none outline-none"
      >
        {/* unfilled track */}
        <span
          className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ background: "var(--os-active)" }}
        />
        {/* filled track */}
        <span
          className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${pct}%`, background: "var(--os-accent)" }}
        />
        {/* thumb */}
        <span
          className="absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow transition-transform group-hover:scale-110 group-focus-visible:ring-2"
          style={{
            left: `${pct}%`,
            background: "var(--os-fg)",
            // @ts-expect-error -- CSS custom property for the focus ring colour
            "--tw-ring-color": "var(--os-accent)",
          }}
        >
          <span className="block h-2.5 w-2.5 rounded-full" style={{ background: "var(--os-accent)" }} />
        </span>
      </div>

      {trailing}
    </div>
  )
}
