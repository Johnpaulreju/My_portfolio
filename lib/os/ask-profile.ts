import { profileGuard } from "./profile-intent"
import { publicProfileHistory } from "./profile-history"
import { courtesyReply } from "./chat-courtesy"

export type ProfileReply = { text: string; links: { label: string; url: string }[]; factIds?: string[] }

export const profileResponses = {
  private: { text: "I can share Johnpaul’s published work and contact information. That detail is private.", links: [] },
  unrelated: { text: "I’m here to answer questions about Johnpaul. Would you like to explore his projects, experience or education?", links: [] },
  unknown: { text: "Johnpaul hasn’t shared that detail in his public portfolio. Is there a project or part of his background you’d like to explore?", links: [] },
  clarify: { text: "Which project, employer or college do you mean?", links: [] },
} satisfies Record<string, ProfileReply>

export async function askProfile(
  question: string,
  previous: string[] = [],
  signal?: AbortSignal,
  previousFacts?: string[][],
): Promise<ProfileReply | null> {
  if (question.length > 1000) return null
  const courtesy = courtesyReply(question)
  if (courtesy) return { text: courtesy, links: [] }
  const guard = profileGuard(question)
  if (guard) return profileResponses[guard]
  try {
    // Allow for the provider deadline plus the optional public repository lookup.
    const timeout = AbortSignal.timeout(28000)
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, ...publicProfileHistory(previous, previousFacts) }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null
    const reply = await response.json()
    if (!reply || typeof reply.text !== "string" || !Array.isArray(reply.links)) return null
    return {
      text: reply.text,
      factIds: Array.isArray(reply.factIds) ? reply.factIds.filter((id: unknown) => typeof id === "string").slice(0, 6) : undefined,
      links: reply.links.filter((link: { label?: unknown; url?: unknown } | null) =>
        typeof link?.label === "string" && typeof link.url === "string" && /^https:\/\//.test(link.url)),
    }
  } catch {
    return null
  }
}
