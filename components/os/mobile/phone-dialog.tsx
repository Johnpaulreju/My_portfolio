"use client"

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react"
import { X, ArrowLeft, Home } from "lucide-react"

/** Native modal supplies focus containment, background inertness and return focus. */
export function PhoneDialog({ title, children, onClose, onBack = onClose, onHome, restoreTo }: {
  title: string
  children: ReactNode
  onClose: () => void
  onBack?: () => void
  onHome: () => void
  restoreTo?: HTMLElement | null
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref, restoreTo)

  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="phone-dialog"
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={title}>
        <header className="flex shrink-0 items-center gap-2 border-b px-3" style={{ borderColor: "var(--os-border)" }}>
          <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</h2>
          <button type="button" className="phone-touch" aria-label={`Close ${title}`} onClick={onClose}><X size={20} /></button>
        </header>
        {children}
        <nav aria-label="Panel navigation" className="flex shrink-0 justify-between border-t px-3" style={{ borderColor: "var(--os-border)" }}>
          <button type="button" className="phone-touch gap-2 px-3 text-sm" onClick={onBack}><ArrowLeft size={18} />Back</button>
          <button type="button" className="phone-touch gap-2 px-3 text-sm" onClick={onHome}><Home size={18} />Home</button>
        </nav>
      </section>
    </dialog>
  )
}

/**
 * showModal on mount (before paint, so a settled shade never flickers), close on
 * unmount, then hand focus back to where it came from, or to a safe fallback.
 */
export function useNativeModal(ref: RefObject<HTMLDialogElement | null>, restoreTo?: HTMLElement | null) {
  const returnFocus = useRef<HTMLElement | null>(restoreTo ?? null)
  useLayoutEffect(() => {
    const dialog = ref.current
    returnFocus.current ??= document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      const target = returnFocus.current
      requestAnimationFrame(() => {
        if (document.querySelector("dialog[open]")) return
        if (target?.isConnected && target !== document.body && !target.closest("[inert]")) target.focus({ preventScroll: true })
        else {
          const activeWindow = document.querySelector<HTMLElement>('[data-window-id]:not([inert])')
          const fallback = activeWindow && !activeWindow.closest("[inert]") ? activeWindow : document.querySelector<HTMLElement>("[data-phone-home]")
          fallback?.focus({ preventScroll: true })
        }
      })
    }
  }, [ref])
}
