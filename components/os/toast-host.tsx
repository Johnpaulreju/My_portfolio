"use client"

import { useEffect } from "react"
import { X } from "lucide-react"
import { useNotify } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { AppIcon } from "@/components/os/app-icon"

/**
 * Bottom-right toast stack. Dismissal is driven by ONE 250ms tick against an
 * absolute deadline - never a per-toast setTimeout, which drifts, double-fires
 * under StrictMode and cannot be paused.
 */
export function ToastHost() {
  const { toasts, tick, pause, resume, dismiss } = useNotify()
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

  // While a tray flyout is open the stack would collide with it; the Center still has everything.
  if (!toasts.length || qsOpen || notifOpen) return null

  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-[120] flex w-[352px] flex-col gap-2"
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
              className="h-5 w-5 shrink-0 rounded opacity-0 transition-opacity hover:bg-[var(--os-hover)] group-hover:opacity-100"
            >
              <X size={13} className="mx-auto" />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
