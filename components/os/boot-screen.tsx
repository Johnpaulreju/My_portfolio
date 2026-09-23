"use client"

import { useEffect, useState } from "react"
import { PROFILE } from "@/lib/os/content"

/** Original four-pane mark - evokes a window without using the Windows logo. */
export function PaneMark({ size = 96 }: { size?: number }) {
  const gap = size * 0.07
  const cell = (size - gap) / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      {[
        [0, 0],
        [cell + gap, 0],
        [0, cell + gap],
        [cell + gap, cell + gap],
      ].map(([x, y], i) => (
        <rect
          key={i}
          x={x}
          y={y}
          width={cell}
          height={cell}
          rx={size * 0.045}
          fill="#fff"
          opacity={0.92}
          // Slight perspective skew, the way the Win8 boot logo leans.
          transform={`skewY(-4)`}
          style={{ transformOrigin: `${size / 2}px ${size / 2}px` }}
        />
      ))}
    </svg>
  )
}

const STEPS = [
  "Starting services",
  "Loading projects",
  "Mounting experience",
  "Preparing desktop",
]

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // Respect users who'd rather not sit through an animation.
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (reduced) {
      onDone()
      return
    }

    const timers: ReturnType<typeof setTimeout>[] = []
    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => setStep(i), 480 * (i + 1)))
    })
    timers.push(setTimeout(() => setLeaving(true), 2400))
    timers.push(setTimeout(onDone, 2900))
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div
      className={`fixed inset-0 z-[9999] grid place-items-center bg-[#1b64c4] transition-opacity duration-500 ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-14 px-6 text-center">
        <PaneMark size={104} />

        <div className="flex flex-col items-center gap-5">
          <BootSpinner />
          <p className="text-[15px] font-light tracking-wide text-white/90">
            {STEPS[step]}
            <span className="inline-block w-6 text-left">...</span>
          </p>
        </div>
      </div>

      <p className="absolute bottom-10 text-[13px] font-light tracking-wider text-white/55">
        {PROFILE.name}
      </p>
    </div>
  )
}

/** Five dots chasing each other around a circle, as on the Windows boot screen. */
function BootSpinner() {
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
