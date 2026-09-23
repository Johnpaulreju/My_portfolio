"use client"

import { useCallback, useEffect, useState } from "react"
import { BootScreen } from "@/components/os/boot-screen"
import { DesktopShell } from "@/components/os/desktop/desktop-shell"
import { PhoneShell } from "@/components/os/mobile/phone-shell"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"

const PHONE_BREAKPOINT = 768

export default function Home() {
  const [booted, setBooted] = useState(false)
  const [isPhone, setIsPhone] = useState<boolean | null>(null)
  const theme = useWM((s) => s.theme)
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

  const reboot = useCallback(() => {
    useWM.getState().closeAll()
    setBooted(false)
  }, [])

  return (
    <main data-theme={theme} className="h-[100dvh] w-full overflow-hidden">
      {!booted && <BootScreen onDone={() => setBooted(true)} />}
      {/* isPhone is null on the very first paint, before the media query is read. */}
      {isPhone === null ? null : isPhone ? <PhoneShell /> : <DesktopShell onReboot={reboot} />}
    </main>
  )
}
