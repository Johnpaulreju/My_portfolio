"use client"

import { useEffect, useRef, type ReactNode, type RefObject } from "react"

/** The browser's top layer makes every other shell surface inert. */
export function ModalSurface({ children, label, onDismiss, returnFocusRef }: {
  children: ReactNode
  label: string
  onDismiss: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useEffect(() => {
    const el = dialog.current
    if (!el) return
    const previous = document.activeElement as HTMLElement | null
    const returnTarget = returnFocusRef?.current ?? previous
    el.showModal()
    el.querySelector<HTMLElement>('[data-modal-primary]')?.focus()
    return () => {
      el.close()
      if (returnTarget?.isConnected && !returnTarget.closest('[inert]')) returnTarget.focus({ preventScroll: true })
    }
  }, [returnFocusRef])

  return (
    <dialog
      ref={dialog}
      aria-label={label}
      aria-modal="true"
      className="fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0"
      onCancel={(e) => { e.preventDefault(); dismiss.current() }}
      onKeyDown={(e) => {
        // Keep Tab inside the controls as well as the native modal's inert boundary.
        e.stopPropagation()
        if (e.key !== "Tab") return
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }}
    >
      {children}
    </dialog>
  )
}
