"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from "react"
import { Camera, ChevronLeft, ChevronRight, Download, Images, Share2, Trash2, X } from "lucide-react"
import { filterById } from "@/lib/os/camera/filters"
import type { Photo } from "@/lib/os/camera/gallery"
import { FOCUS, FOCUS_ON_DARK, GLASS, PRIMARY, prefersReducedMotion } from "./ui"

/** A swipe must travel this far to change photo; less than that springs back. */
const SWIPE_PX = 56

function ToolButton({ label, onClick, children, danger, compact }: { label: string; onClick: () => void; children: ReactNode; danger?: boolean; compact: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors hover:bg-[var(--os-hover)] active:bg-[var(--os-active)] ${compact ? "" : "flex-col gap-0.5"} ${FOCUS}`}
      style={{ color: danger ? "#ef4444" : "var(--os-fg)" }}
    >
      {children}
      {!compact && <span aria-hidden>{label}</span>}
    </button>
  )
}

const timeText = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })

export function Gallery({
  photos,
  index,
  compact,
  onIndex,
  onClose,
  onDelete,
}: {
  photos: Photo[]
  index: number
  /** Short screens (a phone held sideways) get one toolbar instead of two. */
  compact: boolean
  onIndex: (index: number) => void
  onClose: () => void
  onDelete: (photo: Photo) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)
  const slideRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: number; x: number; dx: number } | null>(null)
  const photo = photos[index] ?? null
  const count = photos.length

  useEffect(() => closeRef.current?.focus({ preventScroll: true }), [])
  useEffect(() => {
    if (!count) backRef.current?.focus({ preventScroll: true })
  }, [count])

  // Only offer Share where the system share sheet takes image files.
  const file = useMemo(() => (photo && typeof File !== "undefined" ? new File([photo.blob], photo.name, { type: "image/jpeg" }) : null), [photo])
  const [canShare, setCanShare] = useState(false)
  useEffect(() => {
    try {
      setCanShare(!!file && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [file] }))
    } catch {
      setCanShare(false)
    }
  }, [file])

  const go = (step: number) => {
    const next = index + step
    if (next >= 0 && next < count) onIndex(next)
  }

  const download = () => {
    if (!photo) return
    const a = document.createElement("a")
    a.href = photo.url
    a.download = photo.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const share = () => {
    if (!file) return
    navigator.share({ files: [file] }).catch(() => {
      /* dismissing the share sheet is not an error */
    })
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      onClose()
    } else if (e.key === "ArrowLeft" && !(e.target as HTMLElement).closest("[data-no-arrows]")) {
      e.preventDefault()
      go(-1)
    } else if (e.key === "ArrowRight" && !(e.target as HTMLElement).closest("[data-no-arrows]")) {
      e.preventDefault()
      go(1)
    } else if (e.key === "Tab") {
      // The rest of Camera is inert while this is open; keep Tab going round in here.
      const controls = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled)") ?? [])
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  /* --- swipe, through refs only --------------------------------------- */
  const setSlide = (dx: number, animate: boolean) => {
    const el = slideRef.current
    if (!el) return
    el.style.transition = animate && !prefersReducedMotion() ? "transform .2s ease-out" : "none"
    el.style.transform = dx ? `translate3d(${dx}px,0,0)` : ""
  }
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (!photo || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
    drag.current = { id: e.pointerId, x: e.clientX, dx: 0 }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    d.dx = e.clientX - d.x
    // Resist at the ends, so it feels like there is nothing more to see.
    const edge = (d.dx > 0 && index === 0) || (d.dx < 0 && index === count - 1)
    setSlide(edge ? d.dx / 3 : d.dx, false)
  }
  const endDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    const step = d.dx < 0 ? 1 : -1
    const next = index + step
    if (Math.abs(d.dx) > SWIPE_PX && next >= 0 && next < count) {
      onIndex(next)
      // The new photo slides in from the side it came from.
      setSlide(step * 48, false)
      requestAnimationFrame(() => setSlide(0, true))
      return
    }
    setSlide(0, true)
  }

  const title = count ? `${index + 1} of ${count}` : "Gallery"
  const alt = photo ? `Photo ${index + 1} of ${count}, ${filterById(photo.filter).label} filter, taken at ${timeText(photo.takenAt)}` : ""

  const actions = photo && (
    <>
      <ToolButton label="Download" onClick={download} compact={compact}>
        <Download size={20} />
      </ToolButton>
      {canShare && (
        <ToolButton label="Share" onClick={share} compact={compact}>
          <Share2 size={20} />
        </ToolButton>
      )}
      <ToolButton label="Delete" onClick={() => onDelete(photo)} danger compact={compact}>
        <Trash2 size={20} />
      </ToolButton>
    </>
  )

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Gallery"
      data-camera-gallery
      className="absolute inset-0 z-40 flex flex-col"
      style={{ background: "var(--os-surface)", color: "var(--os-fg)" }}
      onKeyDown={onKeyDown}
    >
      <header
        className="flex shrink-0 items-center gap-1 px-1.5"
        style={{ minHeight: compact ? 52 : 58, background: "var(--os-chrome)", borderBottom: "1px solid var(--os-border)" }}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close gallery"
          title="Close gallery"
          className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--os-hover)] ${FOCUS}`}
        >
          <X size={20} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="text-[14px] font-semibold leading-tight" aria-live="polite">
            {title}
          </h2>
          <p className="truncate text-[11.5px] leading-tight" style={{ color: "var(--os-muted)" }}>
            Kept here until you close Camera
          </p>
        </div>
        {compact && actions}
      </header>

      <div
        className="relative min-h-0 flex-1 touch-pan-y overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {photo ? (
          <>
            {/* Flex, not grid: a grid row grows to the photo and max-h-full stops clipping it. */}
            <div ref={slideRef} className="absolute inset-0 flex items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- an in-memory blob: URL, never a network image */}
              <img
                src={photo.url}
                alt={alt}
                draggable={false}
                className="max-h-full min-h-0 max-w-full select-none rounded-md object-contain shadow-lg"
              />
            </div>
            {index > 0 && (
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous photo"
                title="Previous photo"
                className={`absolute left-2 top-1/2 -translate-y-1/2 ${GLASS} ${FOCUS_ON_DARK}`}
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {index < count - 1 && (
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next photo"
                title="Next photo"
                className={`absolute right-2 top-1/2 -translate-y-1/2 ${GLASS} ${FOCUS_ON_DARK}`}
              >
                <ChevronRight size={24} />
              </button>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center p-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <Images size={40} style={{ color: "var(--os-muted)" }} aria-hidden />
              <p className="text-[15px]">No photos yet. Say cheese.</p>
              <button
                ref={backRef}
                type="button"
                onClick={onClose}
                className={`${PRIMARY} ${FOCUS}`}
                style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
              >
                <Camera size={18} />
                Back to camera
              </button>
            </div>
          </div>
        )}
      </div>

      {!compact && photo && (
        <footer
          className="flex shrink-0 items-center justify-center gap-6 px-2 py-1.5"
          style={{ background: "var(--os-chrome)", borderTop: "1px solid var(--os-border)" }}
        >
          {actions}
        </footer>
      )}
    </div>
  )
}
