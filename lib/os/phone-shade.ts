/**
 * Pure rules behind the phone status bar and notification shade. No React, no
 * DOM, so node tests can pin them: lib/os/phone-shade.test.cjs.
 */

/** A pull opens the shade once it is this far down. */
export const OPEN_AT = 0.35
/** A flick faster than this (px per ms) decides by direction alone. */
export const FLING = 0.5
/** A drag counts once the finger moves this far; less is a tap. */
export const SLOP = 8

/** Where the shade settles after the finger lifts: its progress and speed decide. */
export function settleShade(progress: number, velocity: number): "open" | "closed" {
  if (velocity > FLING) return "open"
  if (velocity < -FLING) return "closed"
  return progress >= OPEN_AT ? "open" : "closed"
}

/** How far the shade is open, 0 to 1, when the finger has moved `dy` over a shade `height` tall. */
export function dragProgress(dy: number, height: number): number {
  if (height <= 0) return dy > 0 ? 1 : 0
  return Math.min(1, Math.max(0, dy / height))
}

/**
 * Speed in px/ms over the last few samples. Old samples are dropped, so a finger
 * that stops before lifting reads as slow, the way Android's VelocityTracker does.
 */
export function velocityOf(samples: { t: number; y: number }[], windowMs = 80): number {
  if (samples.length < 2) return 0
  const last = samples[samples.length - 1]
  let first = last
  for (let i = samples.length - 1; i >= 0 && last.t - samples[i].t <= windowMs; i--) first = samples[i]
  const dt = last.t - first.t
  return dt > 0 ? (last.y - first.y) / dt : 0
}

/** "10:42" in 12-hour locales, "22:42" in 24-hour ones. Never AM/PM: a status bar has no room. */
export function statusTime(now: Date, twelveHour: boolean): string {
  const h = now.getHours()
  const m = String(now.getMinutes()).padStart(2, "0")
  return twelveHour ? `${h % 12 || 12}:${m}` : `${String(h).padStart(2, "0")}:${m}`
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "Sunday, 27 September", as a Pixel shade header writes it. */
export function shadeDate(now: Date): string {
  return `${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`
}

/** "now", "5 min", "2 h", "Yesterday", "3 d": short enough for a card header. */
export function relativeTime(at: number, now: number): string {
  const min = Math.floor(Math.max(0, now - at) / 60_000)
  if (min < 1) return "now"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? "Yesterday" : `${d} d`
}

/**
 * The newest `unread` notifications, one icon per app, at most `max` of them.
 * `more` is true when another app also has something new: the status bar shows a dot.
 */
export function unreadApps<T extends string>(center: { appId: T }[], unread: number, max = 3): { apps: T[]; more: boolean } {
  const apps: T[] = []
  for (const item of center.slice(0, Math.max(0, unread))) if (!apps.includes(item.appId)) apps.push(item.appId)
  return { apps: apps.slice(0, max), more: apps.length > max }
}

/** Which battery glyph to draw. `null` level means the browser would not say: draw the plain icon. */
export function batteryGlyph(level: number | null, charging: boolean): "charging" | "full" | "medium" | "low" | "unknown" {
  if (charging) return "charging"
  if (level === null) return "unknown"
  if (level >= 0.7) return "full"
  if (level >= 0.25) return "medium"
  return "low"
}

/** Status bar name: "Notifications and quick settings, 2 unread". */
export function statusLabel(unread: number): string {
  return `Notifications and quick settings${unread ? `, ${unread} unread` : ""}`
}

/** "7:00 AM" when the alarm rings today, "Mon 7:00 AM" when it rings on another day. */
export function alarmChip(at: number, now: number, time: string): string {
  const a = new Date(at), n = new Date(now)
  const today = a.getFullYear() === n.getFullYear() && a.getMonth() === n.getMonth() && a.getDate() === n.getDate()
  return today ? time : `${DAYS[a.getDay()].slice(0, 3)} ${time}`
}
