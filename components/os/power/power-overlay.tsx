"use client"

import { useEffect, useState } from "react"
import { MapPin, Power } from "lucide-react"
import { usePower } from "@/lib/os/power-store"
import { useFullscreen } from "@/lib/os/use-fullscreen"
import { useWM } from "@/lib/os/wm-store"
import { PROFILE } from "@/lib/os/content"
import { BootScreen, PaneMark } from "@/components/os/boot-screen"
import { Wallpaper } from "@/components/os/wallpaper"
import styles from "./power-entry.module.css"
import { PhoneLockScreen, PhoneSleepScreen, usePhoneViewport } from "@/components/os/mobile/shade/phone-lock"

export function PowerOverlay({ entry = false, onStart }: { entry?: boolean; onStart?: () => void }) {
  const state = usePower((s) => s.state)

  if (state === "running") return null
  if (state === "off") return <PowerScreen entry={entry} onStart={onStart} />
  if (state === "booting") return <BootScreen onDone={() => usePower.getState().go("running")} />
  if (state === "restarting") return <TransitionScreen caption="Restarting" />
  if (state === "shuttingDown") return <TransitionScreen caption="Shutting down" />
  if (state === "sleeping") return <SleepScreen />
  return <LockScreen />
}

/** The `off` state: one click buys fullscreen AND audio, which no page load can. */
function PowerScreen({ entry, onStart }: { entry: boolean; onStart?: () => void }) {
  const { powerOn, wantFullscreen, setWantFullscreen } = usePower()
  const { supported, enter } = useFullscreen()

  const start = () => {
    // Order matters: unlock audio first (inside powerOn), then ask for fullscreen,
    // because requestFullscreen is treated as consuming the user activation.
    onStart?.()
    powerOn()
    if (wantFullscreen && supported) enter()
  }

  return (
    <main data-power-entry={entry || undefined} className={styles.screen}>
      <Wallpaper theme="dark" />
      <div className={styles.shade} aria-hidden />
      <header className={styles.top}>
        <span><PaneMark size={23} />Portfolio OS</span>
        <span className={styles.location}><MapPin size={14} aria-hidden />{PROFILE.location}</span>
      </header>
      <section className={styles.identity} aria-labelledby="power-name">
        <h1 id="power-name">{PROFILE.name}</h1>
        <p>{PROFILE.title}</p>
        <div className={styles.controls}>
          <button type="button" onClick={start} autoFocus={!entry} aria-label="Power on" className={styles.power}>
            <Power size={21} aria-hidden />Power on
          </button>
          {supported && <label className={styles.fullscreen}>
            <input type="checkbox" checked={wantFullscreen} onChange={(event) => setWantFullscreen(event.target.checked)} />
            Open in full screen
          </label>}
        </div>
      </section>
    </main>
  )
}

function TransitionScreen({ caption }: { caption: string }) {
  return (
    <div className="fixed inset-0 z-[9999] grid place-items-center bg-black" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-8">
        <Spinner />
        <p className="text-[15px] font-light tracking-wide text-white/90">{caption}</p>
      </div>
    </div>
  )
}

/** Sleep is a black screen that wakes to the lock screen, as Windows does. Phones show a dim clock. */
function SleepScreen() {
  return usePhoneViewport() ? <PhoneSleepScreen /> : <DesktopSleepScreen />
}

function DesktopSleepScreen() {
  const go = usePower((s) => s.go)
  useEffect(() => {
    const wake = () => go("locked")
    window.addEventListener("pointerdown", wake)
    window.addEventListener("keydown", wake)
    return () => {
      window.removeEventListener("pointerdown", wake)
      window.removeEventListener("keydown", wake)
    }
  }, [go])
  return <div className="fixed inset-0 z-[9999] bg-black" aria-label="Display is asleep" />
}

function LockScreen() {
  return usePhoneViewport() ? <PhoneLockScreen /> : <DesktopLockScreen />
}

function DesktopLockScreen() {
  const unlock = usePower((s) => s.unlock)
  const theme = useWM((s) => s.theme)
  const [revealed, setRevealed] = useState(false)
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const go = () => setRevealed(true)
    window.addEventListener("pointerdown", go, { once: true })
    window.addEventListener("keydown", go, { once: true })
    return () => {
      window.removeEventListener("pointerdown", go)
      window.removeEventListener("keydown", go)
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      <Wallpaper theme={theme} />
      <div className="absolute inset-0 bg-black/35" />

      {!revealed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white">
          <p className="text-[76px] font-extralight leading-none tracking-tight drop-shadow-lg">
            {now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--"}
          </p>
          <p className="text-[17px] font-light drop-shadow">
            {now ? now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) : ""}
          </p>
          <p className="mt-10 text-[12.5px] text-white/70">Click anywhere or press a key</p>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              unlock()
            }}
            className="flex w-[300px] flex-col items-center gap-4 text-center text-white"
          >
            <span className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-[30px] font-semibold shadow-xl">
              {PROFILE.initials}
            </span>
            <p className="text-[21px] font-light">{PROFILE.name}</p>
            <div className="flex w-full items-center gap-2">
              <input
                autoFocus
                type="password"
                placeholder="No password needed — just press →"
                aria-label="Password"
                className="min-w-0 flex-1 rounded-md border border-white/25 bg-white/10 px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-white/45 focus:border-white/50"
              />
              <button
                type="submit"
                aria-label="Sign in"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/20"
              >
                →
              </button>
            </div>
            <p className="text-[11.5px] text-white/50">Any password works. It&rsquo;s a portfolio.</p>
          </form>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <div className="relative h-12 w-12">
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="absolute left-1/2 top-1/2 block h-1.5 w-1.5 rounded-full bg-white"
          style={{
            animation: "boot-orbit 1.9s cubic-bezier(.52,.08,.48,.92) infinite",
            animationDelay: `${i * 0.13}s`,
            marginLeft: -3,
            marginTop: -3,
          }}
        />
      ))}
    </div>
  )
}
