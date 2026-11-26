import { courtesyReply } from "./chat-courtesy"
import { PUBLISHED_ARTICLES } from "./blog"
import { PROJECTS, TIMELINE } from "./content"
import { recruiterFacts } from "./recruiter-intent"

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
  const candidate = /\b(?:did|does|has|had|was|is|can|will|would) @ ([a-z-]+) (?:study|studied|attend|graduate|go|earn|work|worked|build|create|write|join|live|based|want|expect)\b/.exec(subject)
  // Ordinary adverbs and helper verbs can also fit between the name and predicate.
  if (candidate && !/^(?:ever|first|last|once|still|help|also|both|most|best|really|actually|currently|previously|originally|usually|primarily|recently)$/.test(candidate[1])) return true
  const recruit = /\b(?:hire|hiring|interview|interviewing|pay|consider) @ ([a-z-]+)/.exec(subject)
  if (recruit && !/^(?:for|as|in|at|on|and|or|to|with|again|now|today|tomorrow|next|this|please|instead|over|more|less|per|about)$/.test(recruit[1])) return true

  // A possessive surname marks the subject even without a verb or capitalization.
  return /@ [a-z-]+ ~s\b/.test(subject)
}

// These requests can be answered locally without sending the visitor's text to Google.
export function profileGuard(question: string): "private" | "unrelated" | null {
  const q = question.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'")
  if (/\b(?:api[ _-]?keys?|passwords?|passphrases?|access[ _-]?tokens?|private[ _-]?keys?|secret[ _-]?keys?|environment variables?|system (?:prompt|instructions?)|developer (?:message|instructions?)|gemini_api_key)\b|(?:^|\s)\.env\b/.test(q)
      || /\b(?:aiza[\w-]{28,}|bearer\s+[\w.~-]{16,})\b/.test(q)
      || /\b(?:home address|private address|medical records of|patient names?|patient data|date of birth|who is his (?:wife|partner))\b/.test(q)
      || /\b(?:emr|clinical|hospital)\b.{0,35}\b(?:client(?:'s)? (?:name|identity)|which client|name (?:the|that|their) client)\b/.test(q)
      || /\b(?:who|which|name|identify|reveal)\b.{0,35}\b(?:client|clinic|hospital)\b.{0,35}\b(?:emr|scribe|clinical)\b/.test(q)) return "private"
  if (isOutsideProfileScope(question)
      || /^(?:(?:hi|hey|hello)[,!.]?\s+)?(?:what (?:is|are)|explain|define) (?:a |an )?(?:github (?:repos?|repositor(?:y|ies))|git repositor(?:y|ies)|github|sqlite|python|javascript|react|django|fastapi)\s*[?.!]*$/.test(q.trim())
      || /\b(?:ignore|override|disregard)\b.{0,30}\b(?:instructions|guardrails|rules)\b/.test(q)
      || /(?:^|[,.!?;]\s*|\b(?:and|then|also)\s+)(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:write|generate|compose|make|tell)\s+(?:me\s+)?(?:an? |some )?(?:joke|poem|song|recipe|script|essay)\b/.test(q)
      || /\b(?:the (?:current |latest )?weather|weather forecast|latest (?:news|score)|stock price|capital (?:city )?of)\b/.test(q)
      || /\b(?:prepare|prep|practice|train|coach)\b.*\b(?:my|me for (?:an?|the))\b.*\binterview\b|\b(?:what is|define|explain) (?:an? |the term )(?:compensation package|ctc|salary|job interview|interview)\b/.test(q)) return "unrelated"
  if (/\bsalary\b/.test(q) && !recruiterFacts(question)) return "private"
  return null
}

function scopeWords(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

const publicSubjects = [
  ...PROJECTS.flatMap(project => [project.title, project.id]),
  ...TIMELINE.flatMap(event => event.org.split(/→|,/).slice(0, event.org.includes("→") ? 2 : 1)),
  ...PUBLISHED_ARTICLES.map(article => article.title),
  "JP Tube", "Odyssey", "Kristu Jayanti", "JECRC", "Zion", "Spaaronn",
].map(subject => ` ${scopeWords(subject)} `)

function namesPortfolioSubject(words: string): boolean {
  if (/\b(?:johnpaul(?:reju)?|john paul|jp|mygpt)\b/.test(words)) return true
  const padded = ` ${words} `
  return publicSubjects.some(subject => padded.includes(subject))
}

const publicTopics = /\b(?:projects?|repos?|repositories|repository|github|demos?|education|school(?:ing)?|college|university|campus|degree|study|studied|work|job|roles?|career|experience|skills?|stack|publications?|writings?|articles?|blog|medium|research|awards?|resume|portfolio|contact|email|linkedin|hire|hiring|availability|available|freelance|certifications?|languages?)\b/
const bareTopics = /^(?:(?:show|give|list) (?:me |us )?|tell me about |what about )?(?:(?:the |public |selected |personal |professional |freelance |project |github |work |technical |education |coding )*(?:projects?|repos?|repositories|links?|github|education|schooling|college|work|experience|skills?|stack|writings?|articles?|blog|research|awards?|resume|contact|linkedin|availability|certifications?|languages?))(?: please)?$/
const followUp = /\b(?:there|its?|that|those|these|which one|first one|second one|the other|tell me more|what else)\b/

/** Admission for ambiguous questions that need the model; Gemini still checks
 * the subject before selecting public facts. A prior turn alone grants no admission. */
export function mayAskAboutProfile(
  question: string,
  previous: readonly string[] = [],
  previousFacts: readonly (readonly string[])[] = [],
): boolean {
  if (profileGuard(question)) return false
  if (recruiterFacts(question)) return true
  const words = scopeWords(question)
  if (namesPortfolioSubject(words) || bareTopics.test(words)) return true
  if (/\b(?:john|he|his|him)\b/.test(words) && (publicTopics.test(words)
      || /\b(?:build|built|create|make|develop|speak|use|learn|teach|based|live|focus|contribute|lead|specialize|specialise)\b/.test(words))) return true
  if (/\b(?:you|your)\b/.test(words) && /\b(?:your (?:portfolio|projects|work|skills|career|education|github)|(?:did|do|have|are) you (?:study|work|build|built|available|based|learn|speak))\b/.test(words)) return true
  if (/\b(?:sqlite|zerodha|algorithm complexity|organic clicks)\b/.test(words)
      && /\b(?:article|post|blog|writing|wrote|published|case study)\b/.test(words)) return true
  if (!followUp.test(words)) return false
  // Deictic language in a new, unrelated instruction should not inherit the portfolio subject.
  if (!publicTopics.test(words) && !/\b(?:build|built|develop|create|contribute|focus|cost|stack|link|which one|first one|second one|the other|tell me more|what else)\b/.test(words)) return false
  const last = previous.at(-1)
  if (!last || profileGuard(last)) return false
  return Boolean(previousFacts.at(-1)?.length) || namesPortfolioSubject(scopeWords(last)) || bareTopics.test(scopeWords(last))
}
