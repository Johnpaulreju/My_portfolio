"use client"

import { ArrowRight, ChevronRight } from "lucide-react"
import { AppIcon } from "../app-icon"
import { PROFILE } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"
import styles from "./welcome.module.css"

const destinations = [
  { id: "projects", label: "Projects", detail: "See what I built and open the live work." },
  { id: "experience", label: "Experience", detail: "Follow my work and education timeline." },
  { id: "mygpt", label: "MyGPT", detail: "Ask a question about me." },
] as const

export function WelcomeApp({ win }: { win: WindowInstance }) {
  const open = useWM((state) => state.open)
  const close = useWM((state) => state.close)

  function explore(id: (typeof destinations)[number]["id"]) {
    close(win.id)
    open(id)
  }

  return (
    <div className={styles.welcome}>
      <div className={styles.artwork}>
        <p>{PROFILE.name}<small>{PROFILE.title}</small></p>
      </div>
      <div className={styles.panel}>
        <div className={`os-scroll ${styles.intro}`}>
          <p className={styles.kicker}>Quick guide</p>
          <h1>Welcome to my workspace.</h1>
          <p className={styles.instructions}>
            <span className={styles.desktopTip}>Double-click a desktop icon or use Start to find an app.</span>
            <span className={styles.phoneTip}>Tap an app to open it. Swipe up on the home screen to browse all apps.</span>
          </p>
          <div className={styles.destinations}>
            {destinations.map(({ id, label, detail }) => <button key={id} type="button" onClick={() => explore(id)}>
              <AppIcon appId={id} size={26} />
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ChevronRight size={16} aria-hidden />
            </button>)}
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={() => close(win.id)}>Start exploring <ArrowRight size={16} aria-hidden /></button>
        </div>
      </div>
    </div>
  )
}
