"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"
import { ArrowLeft, Home, Square } from "lucide-react"
import { PullHandle } from "../pull-handle"

/**
 * Native modal with the same focus safety as PhoneDialog: showModal traps focus and makes the
 * rest inert; on close, focus returns to where it came from, or to the active app or Home.
 */
export function useNativeModal(ref: RefObject<HTMLDialogElement | null>, restoreTo?: HTMLElement | null, initialFocus?: () => HTMLElement | null | undefined) {
  const returnFocus = useRef<HTMLElement | null>(restoreTo ?? null)
  const pickFocus = useRef(initialFocus)
  useEffect(() => {
    const dialog = ref.current
    returnFocus.current ??= document.activeElement as HTMLElement | null
    dialog?.showModal()
    pickFocus.current?.()?.focus({ preventScroll: true })
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

/** A full-height sheet that slides up, with its own copy of the phone's 3-button nav (the real one is inert under a modal). */
export function PhoneSheet({ title, children, onClose, onBack = onClose, onHome, onRecents, recentsLabel, restoreTo, initialFocus }: {
  title: string
  children: ReactNode
  onClose: () => void
  onBack?: () => void
  onHome: () => void
  onRecents: () => void
  recentsLabel: string
  restoreTo?: HTMLElement | null
  initialFocus?: () => HTMLElement | null | undefined
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref, restoreTo, () => initialFocus?.() ?? ref.current?.querySelector<HTMLElement>("[data-sheet-body]"))
  return (
    <dialog
      ref={ref}
      aria-label={title}
      className="phone-sheet"
      onCancel={(e) => { e.preventDefault(); onBack() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <section data-sheet-body tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-hidden outline-none" aria-label={title}>
        <PullHandle label={`Close ${title}`} onTap={onClose} onPullDown={onClose} className="phone-sheet-grip mx-auto w-24">
          <span className="h-1 w-9 rounded-full bg-[var(--os-muted)] opacity-70" />
        </PullHandle>
        {children}
      </section>
      <nav aria-label="Panel navigation" className="phone-sheet-nav flex shrink-0 items-center justify-around">
        <button type="button" className="phone-touch" aria-label="Back" onClick={onBack}><ArrowLeft size={20} /></button>
        <button type="button" className="phone-touch" aria-label="Home" onClick={onHome}><Home size={20} /></button>
        <button type="button" className="phone-touch" aria-label={recentsLabel} onClick={onRecents}><Square size={18} /></button>
      </nav>
    </dialog>
  )
}
