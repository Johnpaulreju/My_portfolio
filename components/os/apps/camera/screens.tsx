"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { Camera, CameraOff, Images, RefreshCw, Sparkles } from "lucide-react"
import type { CameraErrorKind } from "@/lib/os/camera/media"
import { FOCUS, PRIMARY, SECONDARY, claimFocus } from "./ui"

/** Short, plain and friendly. Each one says what happened and what fixes it. */
export const ERROR_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  denied: {
    title: "Camera is blocked",
    body: "Your browser said no, which is fair. To allow it, tap the lock or settings icon next to the web address, open Site settings and set Camera to Allow. Then tap Try again.",
  },
  "no-camera": {
    title: "No camera found",
    body: "I looked everywhere, even under the keyboard. Plug in a camera, or play with the test pattern.",
  },
  busy: {
    title: "Camera is busy",
    body: "Another app or tab is using the camera. Close it, then tap Try again.",
  },
  unsupported: {
    title: "Camera not supported here",
    body: "This browser can't share its camera. A recent Chrome, Edge, Firefox or Safari can.",
  },
  insecure: {
    title: "Camera needs a secure page",
    body: "Browsers only share the camera on https:// pages. Open the https version of this site.",
  },
  "in-app": {
    title: "Open in your browser",
    body: "This in-app browser keeps the camera to itself. Open the page in Chrome or Safari to use it.",
  },
  stopped: {
    title: "Camera stopped",
    body: "The camera was unplugged or taken by something else. Tap Try again.",
  },
}

function Shell({ icon, children, photos, onGallery }: { icon: ReactNode; children: ReactNode; photos: number; onGallery: () => void }) {
  return (
    <div className="os-scroll flex h-full min-h-0 flex-col items-center overflow-y-auto px-6 py-6 text-center" style={{ background: "var(--os-surface)", color: "var(--os-fg)" }}>
      <div className="my-auto flex w-full max-w-[360px] flex-col items-center gap-4 py-2">
        <span
          className="grid h-20 w-20 place-items-center rounded-[26px] text-white shadow-lg"
          style={{ background: "linear-gradient(145deg, #52525b, #18181b)" }}
          aria-hidden
        >
          {icon}
        </span>
        {children}
        {photos > 0 && (
          <button type="button" onClick={onGallery} className={`${SECONDARY} ${FOCUS}`} style={{ color: "var(--os-fg)" }}>
            <Images size={18} />
            {`Photos (${photos})`}
          </button>
        )}
      </div>
    </div>
  )
}

export function StartScreen({
  asking,
  photos,
  onStart,
  onPattern,
  onGallery,
}: {
  asking: boolean
  photos: number
  onStart: () => void
  onPattern: () => void
  onGallery: () => void
}) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => claimFocus(primary.current), [])
  return (
    <Shell icon={<Camera size={38} strokeWidth={1.8} />} photos={photos} onGallery={onGallery}>
      <p className="text-[15px] leading-snug">Photos stay on this device. Nothing is uploaded.</p>
      <button
        ref={primary}
        type="button"
        onClick={() => { if (!asking) onStart() }}
        // aria-disabled, not disabled: a disabled button drops keyboard focus mid-prompt.
        aria-disabled={asking || undefined}
        aria-busy={asking || undefined}
        className={`${PRIMARY} ${FOCUS}`}
        style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
      >
        <Camera size={18} />
        {asking ? "Waiting for your OK…" : "Turn on camera"}
      </button>
      <button type="button" onClick={onPattern} className={`${SECONDARY} ${FOCUS}`} style={{ color: "var(--os-muted)" }}>
        <Sparkles size={16} />
        Use a test pattern
      </button>
    </Shell>
  )
}

export function ErrorScreen({
  kind,
  photos,
  onRetry,
  onPattern,
  onGallery,
}: {
  kind: CameraErrorKind
  photos: number
  onRetry: () => void
  onPattern: () => void
  onGallery: () => void
}) {
  const primary = useRef<HTMLButtonElement>(null)
  useEffect(() => claimFocus(primary.current), [kind])
  const copy = ERROR_COPY[kind]
  return (
    <Shell icon={<CameraOff size={36} strokeWidth={1.8} />} photos={photos} onGallery={onGallery}>
      <div role="alert" className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-semibold">{copy.title}</h2>
        <p className="text-[13.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          {copy.body}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          ref={primary}
          type="button"
          onClick={onRetry}
          className={`${PRIMARY} ${FOCUS}`}
          style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
        >
          <RefreshCw size={17} />
          Try again
        </button>
        <button
          type="button"
          onClick={onPattern}
          className={`${SECONDARY} ${FOCUS}`}
          style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
        >
          <Sparkles size={16} />
          Use a test pattern
        </button>
      </div>
    </Shell>
  )
}
