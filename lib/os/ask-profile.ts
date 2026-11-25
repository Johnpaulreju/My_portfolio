export type ProfileReply = { text: string; links: { label: string; url: string }[] }

export async function askProfile(
  question: string,
  previous: string[] = [],
  signal?: AbortSignal,
): Promise<ProfileReply | null> {
  if (question.length > 1000) return null
  try {
    const timeout = AbortSignal.timeout(18000)
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, previous: previous.slice(-3).map((q) => q.slice(0, 500)) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null
    const reply = await response.json()
    if (!reply || typeof reply.text !== "string" || !Array.isArray(reply.links)) return null
    return {
      text: reply.text,
      links: reply.links.filter((link: { label?: unknown; url?: unknown } | null) =>
        typeof link?.label === "string" && typeof link.url === "string" && /^https:\/\//.test(link.url)),
    }
  } catch {
    return null
  }
}
