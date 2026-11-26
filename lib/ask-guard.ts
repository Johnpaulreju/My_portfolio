// One budget per warm server instance. The Google project quota covers all instances.
const minute = 60_000
const day = 24 * 60 * minute
type ModelCall = { client: string; startedAt: number }
let recent: ModelCall[] = []
const active = new Set<ModelCall>()

/** Reserve a provider call synchronously. Always release the slot in `finally`.
 * Attempts count toward the rolling limits even if the provider fails or times out. */
export function tryAcquireGemini(request: Request): (() => void) | null {
  const client = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.trim() || "unknown"
    : "local"
  const now = Date.now()
  recent = recent.filter(call => now - call.startedAt < day)
  if (active.size >= 4 || recent.length >= 200) return null
  const clientInFlight = [...active].filter(call => call.client === client).length
  if (clientInFlight >= 2) return null

  const recentMinute = recent.filter(call => now - call.startedAt < minute)
  if (recentMinute.length >= 20 || recentMinute.filter(call => call.client === client).length >= 6
      || recent.filter(call => call.client === client).length >= 30) return null

  const call = { client, startedAt: now }
  recent.push(call)
  active.add(call)
  return () => { active.delete(call) }
}
