"use client"

import { useEffect, useRef } from "react"
import { X } from "lucide-react"
import { useNotify, type Toast } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { AppIcon } from "@/components/os/app-icon"
import { APP_META } from "@/lib/os/app-meta"
import { launchApp, useSwipeAway } from "@/components/os/mobile/shade/notification-list"

/**
 * Bottom-right toast stack. Dismissal is driven by ONE 250ms tick against an
 * absolute deadline - never a per-toast setTimeout, which drifts, double-fires
 * under StrictMode and cannot be paused.
 */
export function ToastHost({ mobile = false }: { mobile?: boolean }) {
  const { toasts, tick, pause, resume, dismiss } = useNotify()
  const stack = useRef<HTMLDivElement>(null)
  const phonePanel = useWM((s) => s.phonePanel)
  const qsOpen = useWM((s) => s.qsOpen)
  const notifOpen = useWM((s) => s.notifOpen)

  useEffect(() => {
    const id = setInterval(tick, 250)
    // A backgrounded tab throttles timers, so re-settle on return.
    const onVis = () => tick()
    document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [tick])

  useEffect(() => {
    // Removing a focused toast does not reliably dispatch blur. Settle the pause
    // flag when a card or its entire stack disappears, so future toasts expire.
    const el = stack.current
    if (el && ((!mobile && el.matches(":hover")) || el.contains(document.activeElement))) pause()
    else resume()
  }, [toasts.length, qsOpen, notifOpen, phonePanel, mobile, pause, resume])

  // While a tray flyout is open the stack would collide with it; the Center still has everything.
  if (!toasts.length || qsOpen || notifOpen || (mobile && phonePanel !== "closed")) return null

  if (mobile) return (
    <div ref={stack} className="phone-heads-up" onFocusCapture={pause} onBlurCapture={resume}>
      {toasts.map((t) => <HeadsUp key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
    </div>
  )

  return (
    <div
      ref={stack}
      className="pointer-events-none absolute z-[120] flex flex-col gap-2"
      style={mobile ? { bottom: "calc(56px + env(safe-area-inset-bottom, 0px))", right: "calc(8px + env(safe-area-inset-right, 0px))", width: "min(352px, calc(100% - 16px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))" } : { bottom: 56, right: 12, width: 352 }}
      onPointerEnter={pause}
      onPointerLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto group relative overflow-hidden rounded-lg p-3 shadow-2xl"
          style={{
            background: "var(--os-menu)",
            border: "1px solid var(--os-border)",
            backdropFilter: "blur(30px) saturate(160%)",
            color: "var(--os-fg)",
            animation: t.leaving ? "toast-out .2s ease-in forwards" : "toast-in .22s ease-out",
          }}
        >
          <div className="flex gap-3">
            <AppIcon appId={t.appId} size={22} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px]" style={{ color: "var(--os-muted)" }}>
                {t.source}
              </p>
              <p className="truncate text-[13px] font-medium">{t.title}</p>
              {t.body && (
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--os-muted)" }}>
                  {t.body}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className={`shrink-0 rounded transition-opacity hover:bg-[var(--os-hover)] ${mobile ? "phone-touch" : "h-6 w-6 opacity-70 group-hover:opacity-100 focus:opacity-100"}`}
            >
              <X size={13} className="mx-auto" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

/** Phone heads-up: drops from under the status bar; swipe up or sideways to dismiss, tap to open. */
function HeadsUp({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const swipe = useSwipeAway(onDismiss, { up: true })
  const app = APP_META[t.appId].title
  return (
    <div role="status" aria-live="polite" className="phone-heads-up-card" data-leaving={t.leaving || undefined} {...swipe}>
      <button type="button" className="phone-heads-up-open" onClick={() => { onDismiss(); launchApp(t.appId) }} aria-label={`${t.title}. From ${app}. Open ${app}`}>
        <AppIcon appId={t.appId} size={32} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px]" style={{ color: "var(--os-muted)" }}>{app} · now</span>
          <span className="mt-0.5 block truncate text-[14px] font-medium">{t.title}</span>
          {t.body && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug" style={{ color: "var(--os-muted)" }}>{t.body}</span>}
        </span>
      </button>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="phone-touch shrink-0 rounded-full"><X size={16} /></button>
    </div>
  )
}
