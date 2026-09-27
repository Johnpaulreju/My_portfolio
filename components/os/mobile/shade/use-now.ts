"use client"

import { useEffect, useState } from "react"

/** The current time, re-read on each minute boundary and when the tab comes back. `null` before hydration. */
export function useMinuteClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const sync = () => {
      clearTimeout(timer)
      const d = new Date()
      setNow(d)
      timer = setTimeout(sync, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50)
    }
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", sync) }
  }, [])
  return now
}

/** Whether the visitor's own clock uses 12-hour time. */
export function prefersTwelveHour(): boolean {
  const cycle = new Intl.DateTimeFormat([], { hour: "numeric" }).resolvedOptions().hourCycle
  return cycle === "h11" || cycle === "h12"
}
