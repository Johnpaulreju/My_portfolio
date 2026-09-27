"use client"

import { useEffect, type RefObject } from "react"

/** Non-modal desktop panels enter keyboard focus, then return it on dismissal. */
export function useFlyoutFocus(open: boolean, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const origin = document.activeElement as HTMLElement | null
    const panel = ref.current
    const raf = requestAnimationFrame(() => {
      const first = panel?.querySelector<HTMLElement>('input,button:not([disabled]),[tabindex="0"]')
      ;(first ?? panel)?.focus({ preventScroll: true })
    })
    return () => {
      cancelAnimationFrame(raf)
      requestAnimationFrame(() => {
        // Launching an app already moved focus there; do not steal it back.
        if (origin?.isConnected && !origin.closest("[inert]") && (document.activeElement === document.body || panel?.contains(document.activeElement))) origin.focus({ preventScroll: true })
      })
    }
  }, [open, ref])
}
