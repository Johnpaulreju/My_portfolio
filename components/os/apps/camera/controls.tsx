"use client"

import { useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent, type Ref } from "react"
import { Images, SwitchCamera, X } from "lucide-react"
import { FILTERS, type FilterId } from "@/lib/os/camera/filters"
import { FOCUS, prefersReducedMotion } from "./ui"

type Orientation = "horizontal" | "vertical"

/**
 * The filter strip is a radio group: one Tab stop, arrow keys move the choice,
 * and on phones it scrolls sideways like a camera's mode picker. The chosen
 * filter slides to the middle.
 */
export function FilterPicker({ value, onChange, orientation }: { value: FilterId; onChange: (id: FilterId) => void; orientation: Orientation }) {
  const listRef = useRef<HTMLDivElement>(null)
  const vertical = orientation === "vertical"
  // Wide windows show all six at once; only a strip that overflows scrolls and centres.
  const [fits, setFits] = useState(false)

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof ResizeObserver === "undefined") return
    const measure = () => {
      const items = Array.from(list.querySelectorAll<HTMLElement>("[data-filter]"))
      const need = items.reduce((sum, el) => sum + (vertical ? el.offsetHeight : el.offsetWidth) + 4, 0)
      setFits(need <= (vertical ? list.clientHeight : list.clientWidth) - 16)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(list)
    return () => ro.disconnect()
  }, [vertical])

  useEffect(() => {
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>(`[data-filter="${value}"]`)
    if (!list || !item) return
    const behavior = prefersReducedMotion() ? "auto" : "smooth"
    // scrollTo, not scrollIntoView: the latter also scrolls the window frame around the app.
    if (vertical) list.scrollTo({ top: item.offsetTop - (list.clientHeight - item.offsetHeight) / 2, behavior })
    else list.scrollTo({ left: item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2, behavior })
  }, [value, vertical, fits])

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    const i = FILTERS.findIndex((f) => f.id === value)
    let next = i
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % FILTERS.length
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + FILTERS.length) % FILTERS.length
    else if (e.key === "Home") next = 0
    else if (e.key === "End") next = FILTERS.length - 1
    else return
    e.preventDefault()
    const id = FILTERS[next].id
    onChange(id)
    listRef.current?.querySelector<HTMLElement>(`[data-filter="${id}"]`)?.focus({ preventScroll: true })
  }

  return (
    <div
      ref={listRef}
      role="radiogroup"
      aria-label="Filter"
      onKeyDown={onKeyDown}
      className={`flex shrink-0 gap-1 ${fits ? "justify-center" : ""} ${vertical ? "h-full w-[96px] snap-y flex-col overflow-y-auto overflow-x-hidden px-1.5" : "w-full snap-x overflow-x-auto overflow-y-hidden py-1.5"}`}
      style={{ scrollbarWidth: "none", overscrollBehavior: "contain" }}
    >
      {/* End spacers let the first and last filter reach the middle too. */}
      {!fits && <span aria-hidden className="shrink-0" style={{ flexBasis: "calc(50% - 44px)" }} />}
      {FILTERS.map((f) => {
        const on = f.id === value
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-filter={f.id}
            onClick={() => onChange(f.id)}
            className={`min-h-12 shrink-0 snap-center rounded-full px-3.5 text-[13px] font-semibold tracking-wide transition-colors ${vertical ? "w-full" : "min-w-[76px]"} ${FOCUS} focus-visible:-outline-offset-2`}
            style={{
              background: on ? "var(--os-accent-soft)" : "transparent",
              color: on ? "var(--os-fg)" : "var(--os-muted)",
            }}
          >
            {f.label}
          </button>
        )
      })}
      {!fits && <span aria-hidden className="shrink-0" style={{ flexBasis: "calc(50% - 44px)" }} />}
    </div>
  )
}

export function Shutter({
  onPress,
  disabled,
  counting,
  size,
  ref,
}: {
  onPress: () => void
  disabled: boolean
  counting: boolean
  size: number
  ref?: Ref<HTMLButtonElement>
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => { if (!disabled) onPress() }}
      // Focusable while the camera wakes up, so keyboard focus has somewhere to land.
      aria-disabled={disabled || undefined}
      aria-label={counting ? "Cancel timer" : "Take photo"}
      data-camera-shutter
      className={`grid shrink-0 place-items-center rounded-full transition-transform active:scale-[.92] aria-disabled:opacity-50 ${FOCUS} focus-visible:outline-offset-4`}
      style={{ width: size, height: size, border: "4px solid var(--os-fg)", padding: 4 }}
    >
      <span
        className="grid h-full w-full place-items-center rounded-full"
        style={{ background: counting ? "#ef4444" : "#ffffff", boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}
      >
        {counting && <X size={Math.round(size * 0.36)} color="#ffffff" strokeWidth={2.5} />}
      </span>
    </button>
  )
}

export function GalleryThumb({ url, count, onOpen, ref }: { url: string | null; count: number; onOpen: () => void; ref?: Ref<HTMLButtonElement> }) {
  const label = count === 0 ? "Open gallery, no photos yet" : `Open gallery, ${count} photo${count === 1 ? "" : "s"}`
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={label}
      title={label}
      data-camera-thumb
      className={`grid h-[52px] w-[52px] shrink-0 place-items-center overflow-hidden rounded-xl ${FOCUS}`}
      style={{ background: "var(--os-card)", border: "2px solid var(--os-border)", color: "var(--os-muted)" }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- an in-memory blob: URL, never a network image
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <Images size={22} />
      )}
    </button>
  )
}

export function SwitchButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onPress() }}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={label}
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-full transition-colors hover:bg-[var(--os-active)] aria-disabled:opacity-50 ${FOCUS}`}
      style={{ background: "var(--os-hover)", color: "var(--os-fg)" }}
    >
      <SwitchCamera size={22} />
    </button>
  )
}
