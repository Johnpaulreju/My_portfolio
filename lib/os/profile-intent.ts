import { courtesyReply } from "./chat-courtesy"

// A transposed pair in an introduction is common on a phone. Keep corrections
// local to this grammar so other people's names and project titles stay intact.
const spellings = new Map([["abt", "about"], ["tel", "tell"]])
for (const word of ["tell", "about", "johnpaul"]) {
  for (let i = 1; i < word.length; i++) {
    const swapped = word.slice(0, i - 1) + word[i] + word[i - 1] + word.slice(i + 1)
    spellings.set(swapped, word)
  }
}

function introductionWords(question: string) {
  return question.toLowerCase().replace(/\bj\.\s*p\b\.?/g, "jp").replace(/[’']/g, "").replace(/[.,!?…]+/g, " ")
    .replace(/\b[a-z]+\b/g, (word) => spellings.get(word) ?? word)
    .trim().replace(/\s+/g, " ")
    .replace(/^(?:hi|hey|hello|good morning|good afternoon|good evening) /, "")
    .replace(/^please /, "").replace(/^(?:can|could|would) you /, "").replace(/^please /, "")
    .replace(/ (?:please|thanks|thank you)$/, "")
}

// Match the entire request. In "tell me about John Lennon" or "John's salary"
// the additional words carry the subject and must reach the normal question path.
const ownerName = /\b(?:john(?: ?paul)?(?: (?:k )?reju)?|jp)(s)?\b/g
const introductionForms = [
  /^(?:who (?:is|exactly is) |whos |introduce (?:me to )?|describe |about )?@$/,
  /^(?:(?:tell (?:me|us)|what can you tell me) (?:a (?:little(?: bit)?|bit) (?:more )?|more |something |everything )?|more )about @$/,
  /^(?:(?:tell me about|what is|whats|give me) )?@s (?:bio|biography|background|profile|story)$/,
  /^(?:(?:give me|share|show me) )?(?:(?:a|an|the) )?(?:(?:quick|short|brief) )?(?:bio|biography|background|overview|introduction|profile|summary)(?: (?:of|on|to|for) @)?$/,
  /^(?:who is|whos) (?:the (?:person|developer) )?behind (?:this|the) (?:site|website|portfolio)$/,
]

function matchesIntroduction(words: string, allowPronouns: boolean) {
  // @ is an internal placeholder for an identified person.
  if (words.includes("@")) return false
  let subject = words.replace(ownerName, (_name, possessive: string | undefined) => possessive ? "@s" : "@")
  if (allowPronouns) subject = subject.replace(/\b(?:him|he|himself)\b/g, "@").replace(/\bhis\b/g, "@s")
  return introductionForms.some((form) => form.test(subject))
}

export function isPortfolioIntroduction(question: string, previous: readonly string[] = []) {
  const words = introductionWords(question)
  if (matchesIntroduction(words, false)) return true
  if (!/\b(?:him|he|himself|his)\b/.test(words)) return false

  // After another named person or project, an unqualified pronoun is ambiguous.
  const lastSubject = previous.slice(-3).filter((turn) => !courtesyReply(turn)).at(-1)
  return (!lastSubject || matchesIntroduction(introductionWords(lastSubject), false))
    && matchesIntroduction(words, true)
}

/** Keep offline keyword lookups from assigning another person's education or work to Johnpaul. */
export function isOutsideProfileScope(question: string) {
  // A separate writing assignment is outside the assistant's portfolio Q&A.
  if (/(?:^|[.!?;]\s*|\b(?:and|then|also)\s+)(?:please\s+)?(?:write|compose|generate)\s+(?:me\s+)?(?:an? |some )?(?:poem|song|story|essay|joke|script|code)\b/i.test(question)) return true

  // Match an extra surname in the grammatical subject, e.g. "Where did John
  // Lennon study?". JP Tube is the name of the portfolio's own video app.
  const words = introductionWords(question.replace(/[’']s\b/gi, " ~s ")).replace(/\bjp tube\b/g, "video app")
  const subject = words.replace(ownerName, "@")
  const candidate = /\b(?:did|does|has|had|was|is|can) @ ([a-z-]+) (?:study|studied|attend|graduate|go|earn|work|worked|build|create|write|join|live|based)\b/.exec(subject)
  // Ordinary adverbs and helper verbs can also fit between the name and predicate.
  if (candidate && !/^(?:ever|first|last|once|still|help|also|both|most|best|really|actually|currently|previously|originally|usually|primarily|recently)$/.test(candidate[1])) return true

  // A possessive surname marks the subject even without a verb or capitalization.
  return /@ [a-z-]+ ~s\b/.test(subject)
}
