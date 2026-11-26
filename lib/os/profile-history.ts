import { courtesyReply } from "./chat-courtesy"
import { resolveProfileConversation } from "./profile-conversation"
import { isPortfolioIntroduction, mayAskAboutProfile, profileGuard } from "./profile-intent"

/** Keep only this conversation's recent public subjects. The browser and server both apply this policy. */
export function publicProfileHistory(questions: readonly string[], answerIds: readonly (readonly string[])[] = []) {
  const previous: string[] = []
  const previousFacts: string[][] = []
  for (let index = Math.max(0, questions.length - 3); index < questions.length; index++) {
    const turn = questions[index]
    if (courtesyReply(turn)) continue
    const ids = answerIds[index] ?? []
    const blocked = profileGuard(turn)
    const scoped = !blocked && (mayAskAboutProfile(turn, previous, previousFacts) || isPortfolioIntroduction(turn, previous)
      || !!resolveProfileConversation(turn, previous, previousFacts))
    if (blocked || (!scoped && !ids.length)) {
      previous.length = 0
      previousFacts.length = 0
      continue
    }
    // For a pronoun-only turn at the edge of the window, the answer's IDs retain the subject.
    previous.push(scoped ? turn.slice(0, 500) : "Previous portfolio answer")
    previousFacts.push([...ids])
  }
  return { previous, previousFacts }
}
