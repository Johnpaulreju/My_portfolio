"use client"

import { useEffect, useState } from "react"
import { PowerOverlay } from "@/components/os/power/power-overlay"
import { DesktopShell } from "@/components/os/desktop/desktop-shell"
import { PhoneShell } from "@/components/os/mobile/phone-shell"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { usePower } from "@/lib/os/power-store"

const PHONE_BREAKPOINT = 768

export default function Home() {
  const [isPhone, setIsPhone] = useState<boolean | null>(null)
  const theme = useWM((s) => s.theme)
  const powerState = usePower((s) => s.state)
  const hydrate = useFS((s) => s.hydrate)

  // Restore any files the visitor created on a previous visit.
  useEffect(() => hydrate(), [hydrate])

  // Which shell to render is decided on the client, then kept in sync.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${PHONE_BREAKPOINT - 1}px)`)
    const sync = () => setIsPhone(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return (
    <main data-theme={theme} className="h-[100dvh] w-full overflow-hidden">
      {/* The shell stays MOUNTED beneath the overlay, so locking or sleeping never
          loses an open window. */}
      {isPhone === null ? null : isPhone ? <PhoneShell /> : <DesktopShell />}
      <PowerOverlay />
    </main>
  )
}
