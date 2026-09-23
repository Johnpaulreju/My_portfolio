"use client"

import type { Theme } from "@/lib/os/types"

/**
 * Original abstract bloom - layered translucent ribbons around a soft core,
 * in the spirit of Windows 11 without using its artwork. Pure SVG, no request.
 */
export function Wallpaper({ theme }: { theme: Theme }) {
  const dark = theme === "dark"

  // Three offset rings of wide, leaning ribbons. They overlap heavily, so the
  // bloom reads as a soft swirl rather than as petals on a flower.
  const rings = [
    { count: 8, len: 70, width: 21, rot: 0, opacity: dark ? 0.34 : 0.4 },
    { count: 8, len: 52, width: 16, rot: 22, opacity: dark ? 0.3 : 0.36 },
    { count: 6, len: 34, width: 12, rot: 44, opacity: dark ? 0.26 : 0.32 },
  ]

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: dark
            ? "radial-gradient(135% 125% at 50% 42%, #24508f 0%, #16305e 38%, #0c1a3a 68%, #060a18 100%)"
            : "radial-gradient(135% 125% at 50% 42%, #6ea9ec 0%, #3f77c9 38%, #26538f 70%, #16386e 100%)",
        }}
      />

      <svg
        className="absolute left-1/2 top-[46%] h-[74vmin] w-[74vmin] -translate-x-1/2 -translate-y-1/2"
        viewBox="-100 -100 200 200"
      >
        <defs>
          <radialGradient id="wp-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={dark ? "#bcd8ff" : "#ffffff"} stopOpacity={dark ? 0.5 : 0.7} />
            <stop offset="55%" stopColor={dark ? "#6ea2e8" : "#bcd8ff"} stopOpacity={dark ? 0.16 : 0.24} />
            <stop offset="100%" stopColor="#6ea2e8" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="wp-petal" x1="0.5" y1="1" x2="0.5" y2="0">
            <stop offset="0%" stopColor={dark ? "#7fb2f0" : "#ffffff"} stopOpacity="0" />
            <stop offset="45%" stopColor={dark ? "#8fc2ff" : "#ffffff"} stopOpacity={dark ? 0.16 : 0.22} />
            <stop offset="100%" stopColor={dark ? "#d5e8ff" : "#ffffff"} stopOpacity={dark ? 0.42 : 0.55} />
          </linearGradient>

          <filter id="wp-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
        </defs>

        <circle cx="0" cy="0" r="84" fill="url(#wp-core)" />

        {rings.map((ring, r) => (
          <g key={r} filter="url(#wp-soft)" opacity={ring.opacity}>
            {Array.from({ length: ring.count }, (_, i) => {
              const angle = (360 / ring.count) * i + ring.rot
              const { len: L, width: W } = ring
              return (
                <path
                  key={i}
                  // Asymmetric ribbon: it bulges to one side and tapers past the
                  // centreline, which is what gives the bloom its swirl.
                  d={`M 0 0 C ${W * 1.35} ${-L * 0.22}, ${W * 1.05} ${-L * 0.7}, ${W * 0.18} ${-L} C ${-W * 0.7} ${-L * 0.7}, ${-W * 0.95} ${-L * 0.22}, 0 0 Z`}
                  fill="url(#wp-petal)"
                  transform={`rotate(${angle})`}
                />
              )
            })}
          </g>
        ))}

        <circle cx="0" cy="0" r="9" fill={dark ? "#e2efff" : "#ffffff"} opacity={dark ? 0.32 : 0.5} filter="url(#wp-soft)" />
      </svg>

      {/* Vignette keeps desktop icon labels readable in the corners. */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(105% 100% at 50% 42%, transparent 48%, rgba(0,0,0,.5) 100%)" }}
      />
    </div>
  )
}
