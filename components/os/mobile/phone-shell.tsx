"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BatteryFull, ChevronUp, Search, Signal, Square, Wifi, X } from "lucide-react"
import { ALL_APPS, APP_META, PINNED_APPS } from "@/lib/os/app-meta"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { PROFILE } from "@/lib/os/content"
import { AppIcon } from "@/components/os/app-icon"
import { AppHost } from "@/components/os/app-host"
import { Wallpaper } from "@/components/os/wallpaper"
import type { AppId, WindowInstance } from "@/lib/os/types"

/** Apps that only make sense with a mouse and a window manager are left off the phone. */
const PHONE_APPS = ALL_APPS.filter((a) => a.id !== "explorer")
const DOCK: AppId[] = ["about", "projects", "contact", "browser"]

export function PhoneShell() {
  const { theme } = useWM()
  const hydrate = useFS((s) => s.hydrate)

  const [current, setCurrent] = useState<AppId | null>(null)
  const [drawer, setDrawer] = useState(false)
  const [recents, setRecents] = useState<AppId[]>([])
  const [showRecents, setShowRecents] = useState(false)

  useEffect(() => hydrate(), [hydrate])

  const launch = (id: AppId) => {
    setCurrent(id)
    setDrawer(false)
    setShowRecents(false)
    setRecents((r) => [id, ...r.filter((x) => x !== id)].slice(0, 6))
  }

  const goHome = () => {
    setCurrent(null)
    setDrawer(false)
    setShowRecents(false)
  }

  const goBack = () => {
    if (showRecents) return setShowRecents(false)
    if (drawer) return setDrawer(false)
    if (current) return setCurrent(null)
  }

  return (
    <div
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden"
      style={{ color: "var(--os-fg)" }}
    >
      <Wallpaper theme={theme} />

      <StatusBar dark />

      <div className="relative min-h-0 flex-1">
        {current ? (
          <AppSurface appId={current} onClose={goHome} />
        ) : (
          <HomeScreen onLaunch={launch} onOpenDrawer={() => setDrawer(true)} />
        )}

        {drawer && <AppDrawer onLaunch={launch} onClose={() => setDrawer(false)} />}
        {showRecents && (
          <Recents recents={recents} onLaunch={launch} onClear={() => setRecents([])} onClose={() => setShowRecents(false)} />
        )}
      </div>

      <NavBar onBack={goBack} onHome={goHome} onRecents={() => setShowRecents((v) => !v)} />
    </div>
  )
}

function StatusBar({ dark }: { dark?: boolean }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="relative z-10 flex h-8 shrink-0 items-center justify-between px-5 text-[12px] font-medium"
      style={{ color: dark ? "#fff" : "var(--os-fg)", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <span>{now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}</span>
      <span className="flex items-center gap-1.5">
        <Signal size={13} />
        <Wifi size={13} />
        <BatteryFull size={15} />
      </span>
    </div>
  )
}

function HomeScreen({ onLaunch, onOpenDrawer }: { onLaunch: (id: AppId) => void; onOpenDrawer: () => void }) {
  const grid = PHONE_APPS.filter((a) => !DOCK.includes(a.id))
  const touchStart = useRef<number | null>(null)

  return (
    <div
      className="flex h-full flex-col px-5 pb-2 pt-4"
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientY)}
      onTouchEnd={(e) => {
        // Swipe up anywhere on the home screen opens the app drawer.
        if (touchStart.current !== null && touchStart.current - e.changedTouches[0].clientY > 60) onOpenDrawer()
        touchStart.current = null
      }}
    >
      <ClockWidget />

      <div className="grid grid-cols-4 content-start gap-x-2 gap-y-5">
        {grid.map((a) => (
          <HomeIcon key={a.id} appId={a.id} onLaunch={onLaunch} />
        ))}
      </div>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onOpenDrawer}
        aria-label="All apps"
        className="mx-auto mb-2 flex flex-col items-center gap-0.5 text-white/80"
      >
        <ChevronUp size={18} />
      </button>

      {/* Dock */}
      <div
        className="flex items-center justify-around rounded-3xl px-3 py-3"
        style={{ background: "rgba(255,255,255,.14)", backdropFilter: "blur(20px)" }}
      >
        {DOCK.map((id) => (
          <button key={id} type="button" onClick={() => onLaunch(id)} aria-label={APP_META[id].title}>
            <AppIcon appId={id} size={50} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** At-a-glance widget: the clock Android puts on every home screen, plus who this is. */
function ClockWidget() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="mb-6 px-1">
      <p className="text-[54px] font-extralight leading-none tracking-tight text-white drop-shadow-lg">
        {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
      </p>
      <p className="mt-1 text-[13px] text-white/85 drop-shadow">
        {now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : ""}
      </p>

      <div
        className="mt-4 flex items-center gap-3 rounded-2xl px-3.5 py-3"
        style={{ background: "rgba(255,255,255,.13)", backdropFilter: "blur(18px)" }}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-[13px] font-semibold text-white">
          {PROFILE.initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] font-medium text-white">{PROFILE.name}</span>
          <span className="block truncate text-[11.5px] text-white/80">{PROFILE.title}</span>
        </span>
      </div>
    </div>
  )
}

function HomeIcon({ appId, onLaunch }: { appId: AppId; onLaunch: (id: AppId) => void }) {
  return (
    <button
      type="button"
      onClick={() => onLaunch(appId)}
      className="flex flex-col items-center gap-1.5 active:scale-95"
    >
      <AppIcon appId={appId} size={52} />
      <span className="w-full truncate text-center text-[11px] text-white drop-shadow">
        {APP_META[appId].short}
      </span>
    </button>
  )
}

function AppDrawer({ onLaunch, onClose }: { onLaunch: (id: AppId) => void; onClose: () => void }) {
  const [q, setQ] = useState("")
  const list = useMemo(
    () =>
      PHONE_APPS.filter((a) => a.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) =>
        a.short.localeCompare(b.short),
      ),
    [q],
  )

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col px-5 pt-4"
      style={{ background: "var(--os-drawer)", backdropFilter: "blur(30px)", animation: "drawer-up .22s ease-out" }}
    >
      <div
        className="mb-5 flex items-center gap-2 rounded-full px-4 py-2.5"
        style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
      >
        <Search size={15} style={{ color: "var(--os-muted)" }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search apps"
          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-[var(--os-muted)]"
          style={{ color: "var(--os-fg)" }}
        />
        <button type="button" onClick={onClose} aria-label="Close">
          <X size={16} style={{ color: "var(--os-muted)" }} />
        </button>
      </div>

      <div className="os-scroll grid flex-1 grid-cols-4 content-start gap-x-2 gap-y-5 overflow-y-auto pb-4">
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onLaunch(a.id)}
            className="flex flex-col items-center gap-1.5 active:scale-95"
          >
            <AppIcon appId={a.id} size={52} />
            <span className="w-full truncate text-center text-[11px]" style={{ color: "var(--os-fg)" }}>
              {a.short}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Recents({
  recents,
  onLaunch,
  onClear,
  onClose,
}: {
  recents: AppId[]
  onLaunch: (id: AppId) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col justify-center gap-4 px-5"
      style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(14px)" }}
      onClick={onClose}
    >
      {recents.length === 0 ? (
        <p className="text-center text-[13.5px] text-white/80">No recent apps</p>
      ) : (
        <>
          <div className="os-scroll flex gap-4 overflow-x-auto pb-2">
            {recents.map((id) => (
              <button
                key={id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onLaunch(id)
                }}
                className="flex w-[150px] shrink-0 flex-col overflow-hidden rounded-xl"
                style={{ background: "var(--os-surface)", border: "1px solid var(--os-border)" }}
              >
                <span className="flex items-center gap-2 px-2.5 py-2">
                  <AppIcon appId={id} size={18} />
                  <span className="truncate text-[11.5px]" style={{ color: "var(--os-fg)" }}>
                    {APP_META[id].short}
                  </span>
                </span>
                <span className="h-[150px] w-full" style={{ background: "var(--os-card)" }} />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            className="mx-auto rounded-full bg-white/15 px-5 py-2 text-[12.5px] text-white"
          >
            Clear all
          </button>
        </>
      )}
    </div>
  )
}

function AppSurface({ appId, onClose }: { appId: AppId; onClose: () => void }) {
  // Apps expect a window object; on the phone we hand them a fixed stand-in.
  const stub: WindowInstance = {
    id: `phone-${appId}`,
    appId,
    title: APP_META[appId].title,
    payload: {},
    pos: { x: 0, y: 0 },
    size: { w: 0, h: 0 },
    restore: null,
    minimized: false,
    maximized: true,
    snapped: null,
    z: 1,
  }

  return (
    <div
      className="absolute inset-0 z-10 flex flex-col"
      style={{ background: "var(--os-surface)", animation: "app-open .2s ease-out" }}
    >
      <header
        className="flex h-12 shrink-0 items-center gap-3 border-b px-4"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <AppIcon appId={appId} size={22} />
        <span className="flex-1 truncate text-[14px] font-medium" style={{ color: "var(--os-fg)" }}>
          {APP_META[appId].title}
        </span>
        <button type="button" onClick={onClose} aria-label="Close app" style={{ color: "var(--os-muted)" }}>
          <X size={18} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <AppHost appId={appId} win={stub} />
      </div>
    </div>
  )
}

function NavBar({
  onBack,
  onHome,
  onRecents,
}: {
  onBack: () => void
  onHome: () => void
  onRecents: () => void
}) {
  return (
    <nav
      className="relative z-30 flex h-12 shrink-0 items-center justify-around"
      style={{
        background: "rgba(0,0,0,.35)",
        backdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <button type="button" onClick={onBack} aria-label="Back" className="p-3 text-white/90 active:scale-90">
        {/* Android's back chevron */}
        <svg width="17" height="17" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path d="M13.5 3 6 10l7.5 7v-3.2L9.3 10l4.2-3.8z" />
        </svg>
      </button>
      <button type="button" onClick={onHome} aria-label="Home" className="p-3 text-white/90 active:scale-90">
        <span className="block h-[15px] w-[15px] rounded-full border-2 border-current" />
      </button>
      <button type="button" onClick={onRecents} aria-label="Recent apps" className="p-3 text-white/90 active:scale-90">
        <Square size={14} strokeWidth={2.5} />
      </button>
    </nav>
  )
}
