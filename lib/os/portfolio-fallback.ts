import { resolveProfileConversation } from "./profile-conversation"
import { mayAskAboutProfile, profileGuard } from "./profile-intent"

/** Select only published facts when a model call is unavailable. The route
 * resolves these IDs using the same catalogue and repository checks as a model answer. */
export function fallbackProfileSelection(question: string, previous: readonly string[] = [], previousFacts: readonly (readonly string[])[] = []) {
  if (profileGuard(question)) return undefined

  // Translate common conversational phrasing into the questions the catalogue
  // already understands. Keep the subject intact for project links and follow-ups.
  const simpler = question.toLowerCase().replace(/[’‘]/g, "'").trim()
    .replace(/[?!.]+$/, "").replace(/^(?:hi|hello|hey)[!,]?\s+/, "")
    .replace(/^(?:(?:can|would|could) you (?:please )?|please )/, "")
    .replace(/^(?:give me (?:a |an )?(?:(?:quick|brief|short) )?(?:rundown|overview|summary) of|walk me through|tell me a (?:little|bit) (?:more )?about|i'd (?:love|like) to (?:learn|know) more about) /, "tell me about ")
    .replace(/^(?:point me to|send me|where (?:can|could) i (?:take a look at|check out|browse|read|see)) /, "show me ")
    .replace(/\b(?:source files|codebase|source repository)\b/g, "source code")
    .replace(/\bduring his time (?:at|with)\b/g, "at")
    .replace(/\b(?:that company|that institution|that college|that organization)\b/g, "there")
    .replace(/\b(?:academic background|educational background|university studies)\b/g, "education")
    .replace(/\b(?:side projects|side-projects)\b/g, "personal projects")
  const direct = resolveProfileConversation(simpler, previous, previousFacts)
  if (direct) return direct
  if (!mayAskAboutProfile(question, previous, previousFacts)) return undefined

  const q = simpler.replace(/\b(?:john(?: ?paul)?(?: k)?(?: reju)?|jp|he)(?:'s)?\b/g, (name) => name.endsWith("'s") ? "his" : "he")
  if (/^(?:which|what) (?:spoken )?languages (?:can|could|does) he (?:speak|use|communicate in|work in)(?: (?:at work|professionally|(?:when (?:working|speaking)|in (?:a )?conversations?) with (?:a client|clients|his team)))?$/.test(q)) return { ids: ["languages"] }
  if (/^(?:(?:what|which) (?:technical )?(?:skills|tools|technologies|frameworks) (?:does|can) he (?:work with|bring to (?:the team|his work)|use (?:at work|in his projects))|tell me about his (?:technical background|technical skills|technology stack))$/.test(q)) return { ids: ["skills"] }
  if (/^(?:(?:which|what) (?:degrees|qualifications) (?:does he (?:hold|have)|has he (?:earned|completed))|where did he (?:go to college|earn his degrees)|tell me about his qualifications)$/.test(q)) return { ids: ["education"] }
  return undefined
}
