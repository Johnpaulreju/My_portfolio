"use client"

import { useEffect, useRef } from "react"
import { BellOff } from "lucide-react"
import { useNotify } from "@/lib/os/notify-store"
import { useWM } from "@/lib/os/wm-store"
import { AppIcon } from "@/components/os/app-icon"
import { MonthCalendar } from "@/components/os/clock/month-calendar"
import { TASKBAR_H } from "./taskbar"
import { useFlyoutFocus } from "./use-flyout-focus"

export function NotificationCenter() {
  const notifOpen = useWM((s) => s.notifOpen)
  const notifView = useWM((s) => s.notifView)
  const setNotifOpen = useWM((s) => s.setNotifOpen)
  const { center, fun, clearCenter, clearFun, markRead } = useNotify()
  const open = useWM((s) => s.open)
  const setPayload = useWM((s) => s.setPayload)
  const ref = useRef<HTMLDivElement>(null)
  useFlyoutFocus(notifOpen, ref)

  useEffect(() => {
    if (notifOpen && notifView === "panel") markRead()
  }, [notifOpen, notifView, markRead])

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

  if (notifView === "calendar") {
    // Clock is a singleton, so tell an already-open window to switch tabs too.
    const openAlarms = () => setPayload(open("clock", { tab: "alarm" }), { tab: "alarm" })
    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label="Calendar"
        className="absolute right-3 z-[150] w-[372px] outline-none"
        style={{ bottom: TASKBAR_H + 10, color: "var(--os-fg)", animation: "drawer-up .16s ease-out" }}
      >
        <MonthCalendar onOpenAlarms={openAlarms} />
      </div>
    )
  }

  const fmt = (n: number) => new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const ago = (m: number) => (m <= 1 ? "Just now" : `${m} min ago`)
  const notes = [
    ...center.map((t) => ({ id: t.id, appId: t.appId, source: t.source, title: t.title, body: t.body, when: fmt(t.at) })),
    ...fun.map((n) => ({ ...n, when: ago(n.minutesAgo) })),
  ]
  const clearAll = () => {
    clearCenter()
    clearFun()
  }

  // A side panel that slides in from the right, like the Windows notification pane.
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label="Notifications"
      className="absolute right-2 top-2 z-[150] flex w-[380px] max-w-[calc(100%-16px)] flex-col rounded-xl shadow-2xl outline-none"
      style={{
        bottom: TASKBAR_H + 8,
        color: "var(--os-fg)",
        background: "var(--os-menu)",
        border: "1px solid var(--os-border)",
        backdropFilter: "blur(40px) saturate(170%)",
        animation: "panel-in .2s ease-out",
      }}
    >
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-[14px] font-semibold">Notifications</span>
        {notes.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="rounded px-2 py-1 text-[12px] hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-muted)" }}
          >
            Clear all
          </button>
        )}
      </div>

      <ul className="os-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {notes.length === 0 ? (
          <li className="flex flex-col items-center gap-2 px-6 pb-8 pt-10 text-center" style={{ color: "var(--os-muted)" }}>
            <BellOff size={26} />
            <p className="text-[12.5px]">All quiet. No bugs shouting yet.</p>
            <p className="text-[11.5px]">Reload the page and the gossip comes back.</p>
          </li>
        ) : (
          notes.map((t) => (
            <li
              key={t.id}
              className="mb-1.5 flex gap-3 rounded-lg p-3"
              style={{ background: "var(--os-card)", border: "1px solid var(--os-border)", animation: "panel-in .24s ease-out both" }}
            >
              <AppIcon appId={t.appId} size={20} />
              <div className="min-w-0 flex-1">
                <p className="flex justify-between text-[11px]" style={{ color: "var(--os-muted)" }}>
                  <span>{t.source}</span>
                  <span>{t.when}</span>
                </p>
                <p className="text-[13px] font-medium">{t.title}</p>
                {t.body && (
                  <p className="text-[12px] leading-snug" style={{ color: "var(--os-muted)" }}>
                    {t.body}
                  </p>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
