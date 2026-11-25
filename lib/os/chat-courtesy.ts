const hello = "Hi! It’s good to meet you. Is there a project or a part of Johnpaul’s background you’re curious about?"
const thanks = "You’re welcome! Let me know if there’s anything else you’d like to explore."

/** Match complete social turns so a greeting never swallows a visitor’s question. */
export function courtesyReply(question: string): string | undefined {
  const words = question.toLowerCase().trim().replace(/[’']/g, "").replace(/[.,!?…\s]+/g, " ").trim()
  if (/^👋[🏻-🏿]?$/u.test(words)) return hello
  const text = words.replace(/(?:^👋[🏻-🏿]?\s*|\s*👋[🏻-🏿]?$)/gu, "")
  const greeting = /^(?:hi+|hello|hey+|good morning|good afternoon|good evening)(?: (?:there|johnpaul|jp|mygpt))?(?= |$)/
  const remainder = text.replace(greeting, "").trim()
  if (text && !remainder) return hello
  if (/^(?:how are you(?: doing)?|how is it going|hows it going|whats up)$/.test(remainder))
    return "Hi! I’m here and ready to help. What would you like to know about Johnpaul?"
  if (/^(?:(?:ok|okay) )?(?:thank you|thanks|thank you so much|thanks so much|thanks a lot|many thanks)(?: for (?:the help|your help|sharing|that))?$/.test(remainder))
    return thanks
}
