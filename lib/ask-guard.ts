import { reserveGeminiDailyQuota } from "./gemini-quota"

// Bound bursts and in-flight work on this instance before contacting the shared daily ledger.
const minute = 60_000
type Attempt = { client: string; startedAt: number }
let recent: Attempt[] = []
const active = new Set<Attempt>()

export async function tryAcquireGemini(request: Request): Promise<(() => void) | null> {
  const client = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.trim() || "unknown"
    : "local"
  const now = Date.now()
  recent = recent.filter(call => now - call.startedAt < minute)
  if (active.size >= 4 || recent.length >= 20) return null
  if ([...active].filter(call => call.client === client).length >= 2 || recent.filter(call => call.client === client).length >= 6) return null

  const attempt = { client, startedAt: now }
  active.add(attempt)
  recent.push(attempt)
  const release = () => { active.delete(attempt) }
  try {
    if (!request.signal.aborted && await reserveGeminiDailyQuota(client)) return release
  } catch {
    // The provider can run only after the shared store acknowledges both counters.
  }
  release()
  return null
}
