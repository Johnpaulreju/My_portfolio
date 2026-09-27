/**
 * A pretend camera for when there is no real one (or the visitor would rather
 * not share it). Everything is drawn in fractions of the frame, so the same
 * moment can be re-drawn at photo size and stay sharp.
 *
 * It has a face on purpose: ASCII and Matrix are much more fun with something
 * to look at.
 */

export const PATTERN_W = 960
export const PATTERN_H = 540

const BARS = ["#e5e7eb", "#facc15", "#22d3ee", "#4ade80", "#e879f9", "#f87171", "#60a5fa"]

const pad = (n: number) => String(Math.floor(n)).padStart(2, "0")

export function drawTestPattern(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, motion: boolean) {
  const u = Math.min(w, h) / 540
  const t = motion ? time : 0

  const bg = ctx.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, "#0f172a")
  bg.addColorStop(1, "#1e1b4b")
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, w, h)

  // Graph-paper grid.
  ctx.strokeStyle = "rgba(148, 163, 184, 0.14)"
  ctx.lineWidth = Math.max(1, u)
  const step = 60 * u
  ctx.beginPath()
  for (let x = (w / 2) % step; x < w; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, h) }
  for (let y = (h / 2) % step; y < h; y += step) { ctx.moveTo(0, y); ctx.lineTo(w, y) }
  ctx.stroke()

  // Colour bars across the top.
  const barH = h * 0.13
  BARS.forEach((c, i) => {
    ctx.fillStyle = c
    ctx.fillRect((w / BARS.length) * i, 0, w / BARS.length + 1, barH)
  })

  // Grey ramp across the bottom.
  for (let i = 0; i < 8; i++) {
    const v = Math.round((i / 7) * 255)
    ctx.fillStyle = `rgb(${v},${v},${v})`
    ctx.fillRect((w / 8) * i, h - h * 0.08, w / 8 + 1, h * 0.08)
  }

  const cx = w / 2
  const cy = h * 0.5
  const radius = h * 0.27
  const ring = radius * 1.18

  // Radar sweep around the face.
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(t * 1.2)
  const sweep = ctx.createLinearGradient(0, 0, radius, 0)
  sweep.addColorStop(0, "rgba(76, 194, 255, 0)")
  sweep.addColorStop(1, "rgba(76, 194, 255, 0.35)")
  ctx.fillStyle = sweep
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.arc(0, 0, ring, -0.5, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Target ring.
  ctx.strokeStyle = "rgba(226, 232, 240, 0.55)"
  ctx.lineWidth = 3 * u
  ctx.beginPath()
  ctx.arc(cx, cy, ring, 0, Math.PI * 2)
  ctx.stroke()

  // The face.
  const face = ctx.createRadialGradient(cx - radius * 0.3, cy - radius * 0.35, radius * 0.1, cx, cy, radius)
  face.addColorStop(0, "#fde68a")
  face.addColorStop(1, "#f59e0b")
  ctx.fillStyle = face
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fill()

  // Eyes blink for a moment every few seconds.
  const blink = motion && t % 3.4 < 0.14
  const eyeY = cy - radius * 0.22
  const eyeDX = radius * 0.36
  const look = motion ? Math.sin(t * 0.9) * radius * 0.05 : 0
  ctx.fillStyle = "#1f2937"
  for (const side of [-1, 1]) {
    const ex = cx + side * eyeDX + look
    const eh = blink ? radius * 0.04 : radius * 0.2
    roundRect(ctx, ex - radius * 0.07, eyeY - eh / 2, radius * 0.14, eh, radius * 0.07)
    ctx.fill()
  }

  // A code-bracket smile.
  ctx.strokeStyle = "#1f2937"
  ctx.lineWidth = radius * 0.08
  ctx.lineCap = "round"
  ctx.beginPath()
  ctx.arc(cx, cy + radius * 0.08, radius * 0.48, Math.PI * 0.2, Math.PI * 0.8)
  ctx.stroke()

  // Label and a running timecode, the way a real test card has one. They sit on
  // the ring as badges, so they stay in frame even in a narrow portrait crop.
  badge(ctx, "TEST PATTERN", cx, cy - ring, 20 * u, `600 ${Math.round(20 * u)}px system-ui, -apple-system, "Segoe UI", sans-serif`, u)
  const secs = time
  badge(ctx, `${pad(secs / 3600)}:${pad((secs / 60) % 60)}:${pad(secs % 60)}`, cx, cy + ring, 17 * u, `${Math.round(17 * u)}px Menlo, Consolas, monospace`, u)

  // A ball that runs along the floor.
  if (motion) {
    const bx = ((t * 0.18) % 1) * (w + 80 * u) - 40 * u
    ctx.fillStyle = "#4cc2ff"
    ctx.beginPath()
    ctx.arc(bx, h * 0.92 - 18 * u, 14 * u, 0, Math.PI * 2)
    ctx.fill()
  }
}

function badge(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, font: string, u: number) {
  ctx.font = font
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const ph = size * 1.7
  const pw = ctx.measureText(text).width + size * 1.4
  roundRect(ctx, x - pw / 2, y - ph / 2, pw, ph, ph / 2)
  ctx.fillStyle = "rgba(15, 23, 42, 0.94)"
  ctx.fill()
  ctx.strokeStyle = "rgba(226, 232, 240, 0.55)"
  ctx.lineWidth = 2 * u
  ctx.stroke()
  ctx.fillStyle = "#e2e8f0"
  ctx.fillText(text, x, y + u)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
