import { createHmac, randomUUID } from "node:crypto"

// Both keys share a Redis Cluster hash slot. The datastore clock defines one
// rolling window for all regions, including concurrent or cold instances.
const reserve = `
local window = 86400000
local clock = redis.call("TIME")
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
local cutoff = now - window
local site, visitor = KEYS[1], KEYS[2]
redis.call("ZREMRANGEBYSCORE", site, "-inf", cutoff)
redis.call("ZREMRANGEBYSCORE", visitor, "-inf", cutoff)
if redis.call("ZCARD", visitor) >= tonumber(ARGV[1]) or redis.call("ZCARD", site) >= tonumber(ARGV[2]) then
  return 0
end
redis.call("ZADD", site, now, ARGV[3])
redis.call("ZADD", visitor, now, ARGV[3])
redis.call("PEXPIRE", site, window)
redis.call("PEXPIRE", visitor, window)
return 1
`

/** The caller can spend a Gemini call only after the shared store confirms a reservation. */
export async function reserveGeminiDailyQuota(visitorIp: string): Promise<boolean> {
  const env = process.env
  const nativePair = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  const endpoint = nativePair ? env.UPSTASH_REDIS_REST_URL : env.KV_REST_API_URL
  const token = nativePair ? env.UPSTASH_REDIS_REST_TOKEN : env.KV_REST_API_TOKEN
  const siteLimit = env.GEMINI_SITE_DAILY_LIMIT ?? "200"
  if (!endpoint || !token || !/^[1-9]\d*$/.test(siteLimit) || !Number.isSafeInteger(Number(siteLimit))) return false

  try {
    const url = new URL(endpoint)
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return false

    const stage = env.VERCEL_ENV || env.NODE_ENV || "development"
    const prefix = `jp-portfolio:mygpt:{${stage}}`
    const visitor = createHmac("sha256", env.GEMINI_QUOTA_HMAC_SECRET || token)
      .update(prefix).update("\0").update(visitorIp).digest("hex")
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", reserve, "2", prefix + ":site", prefix + ":visitor:" + visitor, "15", siteLimit, randomUUID()]),
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) { await response.body?.cancel(); return false }
    const receipt = await response.json()
    return receipt?.result === 1 && !receipt.error
  } catch {
    // An unacknowledged request could have committed. Never retry it or call Gemini on that basis.
    return false
  }
}
