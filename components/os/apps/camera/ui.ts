/** Focus ring for buttons on theme-coloured chrome. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--os-accent)]"

/** Focus ring for buttons floating over the (always dark) viewfinder. */
export const FOCUS_ON_DARK =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"

/** Round translucent buttons over the picture, like a phone camera's. */
export const GLASS =
  "grid h-12 w-12 shrink-0 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/60 active:bg-black/70"

export const PRIMARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[14px] font-semibold transition-[filter] hover:brightness-110 active:brightness-95 disabled:opacity-60 aria-disabled:opacity-70"

export const SECONDARY =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[13.5px] font-medium transition-colors hover:bg-[var(--os-hover)] active:bg-[var(--os-active)]"

/**
 * Moves focus to a control that just appeared, but only when focus was lost
 * (the pressed button unmounted) or already belonged to this app. It never
 * pulls focus away from another window.
 */
export function claimFocus(el: HTMLElement | null) {
  if (!el) return
  const root = el.closest("[data-camera-root]")
  const current = document.activeElement
  if (!root || !current || current === document.body || root.contains(current) || current.contains(root)) {
    el.focus({ preventScroll: true })
  }
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}
