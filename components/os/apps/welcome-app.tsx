"use client"

import { useState } from "react"
import { ArrowRight, Github, Linkedin, Mail } from "lucide-react"
import { PROFILE } from "@/lib/os/content"
import { useWM } from "@/lib/os/wm-store"
import type { WindowInstance } from "@/lib/os/types"

/** Swap for the real photograph by dropping it at public/media/jp-portrait.jpg. */
const PORTRAIT = "/media/jp-portrait.jpg"

/** The 4-5 words for the right pane. */
const TAGLINE = "Fusing creativity, technology and intelligence."

export function WelcomeApp({ win }: { win: WindowInstance }) {
  const { open, close } = useWM()
  const [photoOk, setPhotoOk] = useState(true)

  return (
    <div className="flex h-full min-h-0">
      {/* Left pane - the photograph, bleeding to the window edge. */}
      <div
        className="relative hidden w-[42%] shrink-0 overflow-hidden sm:block"
        style={{ background: "linear-gradient(150deg, #1b3b6f, #0a1230)" }}
      >
        {photoOk ? (
          // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized is on; this is a static asset
          <img
            src={PORTRAIT}
            alt={`${PROFILE.name}, ${PROFILE.title}`}
            className="h-full w-full object-cover"
            onError={() => setPhotoOk(false)}
          />
        ) : (
          <PortraitPlaceholder />
        )}
        {/* Keeps the caption legible whatever the photo does. */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,.6), transparent)" }}
        />
        <p className="absolute bottom-4 left-5 text-[12px] font-medium text-white/90">{PROFILE.location}</p>
      </div>

      {/* Right pane - the words. */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-8">
        <div>
          <p className="mb-2 text-[12.5px] font-medium tracking-wide" style={{ color: "var(--os-accent-fg)" }}>
            Welcome to JP&rsquo;s Windows
          </p>
          <h1
            className="mb-4 text-[30px] font-light leading-[1.18] tracking-tight"
            style={{ color: "var(--os-fg)" }}
          >
            {TAGLINE}
          </h1>
          <p className="mb-6 max-w-[42ch] text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            I&rsquo;m {PROFILE.name}, {PROFILE.title.toLowerCase()}. This whole portfolio is a desktop —
            open the apps, drag the windows, poke around. Everything works.
          </p>

          <div className="flex flex-wrap gap-2">
            <Chip icon={<Mail size={13} />} href={`mailto:${PROFILE.email}`} label="Email" />
            <Chip icon={<Github size={13} />} href={`https://${PROFILE.github}`} label="GitHub" />
            <Chip icon={<Linkedin size={13} />} href={`https://${PROFILE.linkedin}`} label="LinkedIn" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-6">
          <button
            type="button"
            onClick={() => close(win.id)}
            className="rounded-md px-4 py-[7px] text-[13px] transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
          >
            Just let me look around
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              open("about")
              close(win.id)
            }}
            className="flex items-center gap-1.5 rounded-md px-4 py-[7px] text-[13px] font-medium transition-transform active:scale-[.98]"
            style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
          >
            Start here <ArrowRight size={14} />
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

/** Shown until the real photograph lands - deliberately designed, never a broken frame. */
function PortraitPlaceholder() {
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
      <p className="absolute bottom-16 px-6 text-center text-[11px] leading-relaxed text-white/45">
        Portrait goes here
        <br />
        public/media/jp-portrait.jpg
      </p>
    </div>
  )
}
