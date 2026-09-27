import { ImageResponse } from "next/og"
import { PROFILE } from "@/lib/os/content"

export const alt = `${PROFILE.name} — ${PROFILE.headline}. Portfolio OS.`
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "70px 78px", color: "#f3f3f3", background: "linear-gradient(135deg, #0b1f45, #05070f)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="54" height="54" viewBox="0 0 32 32" fill="#4cc2ff">
            <rect x="2" y="2" width="12" height="12" rx="2" /><rect x="18" y="2" width="12" height="12" rx="2" />
            <rect x="2" y="18" width="12" height="12" rx="2" /><rect x="18" y="18" width="12" height="12" rx="2" />
          </svg>
          <div style={{ display: "flex", fontSize: 30 }}>Portfolio OS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 72, letterSpacing: -3, fontWeight: 700 }}>{PROFILE.name}</div>
          <div style={{ fontSize: 44, color: "#8ad4ff" }}>{PROFILE.title}</div>
          <div style={{ fontSize: 32, color: "#c9b8ff" }}>{PROFILE.next}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#b9c4d6" }}>
          <div>{PROFILE.location}</div><div>A portfolio that boots.</div>
        </div>
      </div>
    ),
    size,
  )
}
