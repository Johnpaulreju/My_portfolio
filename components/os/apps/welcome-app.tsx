"use client"

import Link from "next/link"
import { ArrowRight, Mail } from "lucide-react"
import { Github, Linkedin } from "../social-icons"
import { PROFILE } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"
import styles from "./welcome.module.css"

export function WelcomeApp({ win }: { win: WindowInstance }) {
  const close = useWM((state) => state.close)

  return (
    <div className={styles.welcome}>
      <div
        className={styles.artwork}
        style={{ background: "linear-gradient(150deg, #1b3b6f, #0a1230)" }}
      >
        <InitialsArtwork />
        {/* Keeps the location caption legible. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.6), transparent)" }}
        />
        <p className="absolute bottom-4 left-5 text-[12px] font-medium text-white/90">{PROFILE.location}</p>
      </div>

      <div className={styles.panel}>
        <div className={`os-scroll ${styles.intro}`}>
          <p className="mb-2 text-[12.5px] font-medium tracking-wide" style={{ color: "var(--os-accent-fg)" }}>
            Welcome to JP&rsquo;s Windows
          </p>
          <h1
            className="mb-3 text-[28px] font-light leading-[1.18] tracking-tight"
            style={{ color: "var(--os-fg)" }}
          >
            {PROFILE.tagline}
          </h1>
          <p className="mb-4 max-w-[44ch] text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            I&rsquo;m {PROFILE.name}. Explore my projects, or open my resume for my experience and education.
          </p>

          <div className="flex flex-wrap gap-2">
            <Chip icon={<Mail size={13} />} href={`mailto:${PROFILE.email}`} label="Email" />
            <Chip icon={<Github size={13} />} href={`https://${PROFILE.github}`} label="GitHub" />
            <Chip icon={<Linkedin size={13} />} href={`https://${PROFILE.linkedin}`} label="LinkedIn" />
          </div>
        </div>

        <div className={styles.actions}>
          <Link
            href="/about"
            className="inline-flex items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-transform active:scale-[.98]"
            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
          >
            Start here <ArrowRight size={14} aria-hidden />
          </Link>
          <Link
            href="/resume"
            className="inline-flex items-center justify-center rounded-md px-3 text-[13px] transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
          >
            View resume
          </Link>
          <button
            type="button"
            onClick={() => close(win.id)}
            className="rounded-md px-2 text-[13px] text-[var(--os-fg)] transition-colors hover:bg-[var(--os-hover)]"
          >
            Look around
          </button>
        </div>
      </div>
    </div>
  )
}

function Chip({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ border: "1px solid var(--os-border)", color: "var(--os-muted)" }}
    >
      {icon}
      {label}
    </a>
  )
}

/** Current identity artwork; no portrait asset is assumed. */
function InitialsArtwork() {
  return (
    <div className="relative grid h-full w-full place-items-center">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 140" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f7fd6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0a1230" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: 9 }, (_, i) => (
          <circle key={i} cx="50" cy="60" r={12 + i * 9} fill="none" stroke="url(#wg)" strokeWidth="0.6" />
        ))}
      </svg>
      <span className="relative grid h-24 w-24 place-items-center rounded-full bg-white/10 text-[30px] font-light text-white backdrop-blur">
        {PROFILE.initials}
      </span>
    </div>
  )
}
