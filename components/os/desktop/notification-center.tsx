"use client"

import { useEffect, useRef } from "react"
import { BellOff } from "lucide-react"
import { useNotify } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { AppIcon } from "@/components/os/app-icon"
import { TASKBAR_H } from "./taskbar"

export function NotificationCenter() {
  const notifOpen = useWM((s) => s.notifOpen)
  const setNotifOpen = useWM((s) => s.setNotifOpen)
  const { center, clearCenter, markRead } = useNotify()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (notifOpen) markRead()
  }, [notifOpen, markRead])

  useEffect(() => {
    if (!notifOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (ref.current?.contains(t) || t.closest("[data-taskbar]")) return
      setNotifOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotifOpen(false)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [notifOpen, setNotifOpen])

  if (!notifOpen) return null

  const fmt = (n: number) => new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Notification Center"
      className="absolute right-3 z-[150] flex max-h-[70vh] w-[372px] flex-col rounded-xl shadow-2xl"
      style={{
        bottom: TASKBAR_H + 10,
        background: "var(--os-menu)",
        border: "1px solid var(--os-border)",
        backdropFilter: "blur(40px) saturate(170%)",
        color: "var(--os-fg)",
        animation: "start-rise .16s ease-out",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[14px] font-semibold">Notifications</span>
        {center.length > 0 && (
          <button
            type="button"
            onClick={clearCenter}
            className="rounded px-2 py-1 text-[12px] hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-muted)" }}
          >
            Clear all
          </button>
        )}
      </div>

      <div className="os-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {center.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14" style={{ color: "var(--os-muted)" }}>
            <BellOff size={26} />
            <p className="text-[12.5px]">No new notifications</p>
          </div>
        ) : (
          center.map((t) => (
            <div
              key={t.id}
              className="mb-1.5 flex gap-3 rounded-lg p-3"
              style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
            >
              <AppIcon appId={t.appId} size={20} />
              <div className="min-w-0 flex-1">
                <p className="flex justify-between text-[11px]" style={{ color: "var(--os-muted)" }}>
                  <span>{t.source}</span>
                  <span>{fmt(t.at)}</span>
                </p>
                <p className="truncate text-[13px] font-medium">{t.title}</p>
                {t.body && (
                  <p className="text-[12px] leading-snug" style={{ color: "var(--os-muted)" }}>
                    {t.body}
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
