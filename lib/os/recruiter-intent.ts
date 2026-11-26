// These decisions select published catalogue records. Only recognize complete
// recruiting questions so an incidental "hire", "package" or "interview" in
// another request does not turn it into a recommendation for Johnpaul.
const recruitingWords = new Set((
  "a about accept add ai am an and any application applied are arrange as ask at availability available background be best better book bring call charge choice " +
  "can candidate career ctc company compensation compensate consider considering contact could current currently date " +
  "developer did discuss do does earn earning email engineer engineering expect expectation expectations expected " +
  "expecting experience fit for from full give good great has have he him hire hiring his how i in interested interview " +
  "interviewing interviews invite is it job join know like looking make makes me meet meeting money much need next " +
  "of offer on open opportunity or our package packages paid pay paying payscale per person phone please position " +
  "potential prefer preferred process qualities qualifications qualified range rate rates reach reason reasons recruiter " +
  "questions recruiting recruitment recommend recommended relevant request right role rounds salary schedule scheduling set should " +
  "skill skills slot software some speak stack stand out start strengths strong suitable take talent team technical " +
  "tell the this time timings to today tomorrow traits up us value want wanted wants we what when where which who why will with work would year"
).split(" "))

function recruitingClause(q: string, hiringContext: boolean): string | undefined {
  // Allow a recruiter's role title without having to list every engineering specialty.
  if (/^(?:(?:why )?(?:can|may|could|would|should) (?:we|i) |(?:we|i) (?:would like|want) to )(?:interview|hire|(?:book|schedule|arrange) an? (?:technical )?interview with) (?:him|he) for (?:an? |the |our |this )?(?:[a-z]+ ){0,6}(?:role|position|opening|job)$/.test(q))
    return q.includes("interview ") ? "interview-contact" : "hiring-fit"
  if (!q || !q.split(" ").every(word => recruitingWords.has(word))) return undefined
  const person = /\b(?:he|him|his)\b/.test(q)
  const compensation = /\b(?:compensation|ctc|salar(?:y|ies)|(?:pay|package|salary) (?:expectations?|range)|expected (?:pay|package)|(?:package|pay) (?:is|does|would|will)|payscale)\b/.test(q)
    || (person && /\bpackage\b/.test(q)) || /\bhow much\b.*\b(?:pay|earn|charge|expect|want|offer|looking for)\b/.test(q)
  if ((compensation && (person || /^(?:(?:and |what about |what is |the |his |salary |expected )*(?:package|salary|ctc|compensation|pay|salary range|salary expectations?))$/.test(q)))
    || (hiringContext && /^(?:and |what about )?(?:the )?(?:package|pay|rate|range)$/.test(q))) return "compensation-contact"

  if (/\binterviews?\b/.test(q) && (person || /\b(?:schedule|arrange|set up|book|request) (?:an? |the )?(?:(?:job|technical) )?interview(?: (?:on|at|next|today|tomorrow|time))*$/.test(q)
    || /^(?:interview(?:s| request| scheduling| availability| timings| slot| process)?|(?:an |the )?interview)$/.test(q))) return "interview-contact"
  if (person && (/\b(?:hire|hiring|recruiting|recommend|consider|considering)\b/.test(q)
    || /\b(?:good|strong|best|suitable|right|great) (?:candidate|fit|choice|hire)\b/.test(q)
    || /\b(?:strengths|qualities|stand out)\b/.test(q) || /\bwhat role would (?:he|him) fit\b/.test(q)
    || /\b(?:bring|add)\b.*\b(?:team|role|company|value)\b/.test(q))) return "hiring-fit"
  return undefined
}

export function recruiterFacts(question: string, hiringContext = false): string[] | undefined {
  const q = question.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'")
    .replace(/(?:[.!?;,]\s*|\s+)(?:please )?(?:e-?mail|reach|contact) me at [\w.+-]+@[\w.-]+\.[a-z]{2,}[.!]?\s*$/, "")
    .replace(/\b(?:what|when|where|who|why)'s\b/g, (word) => word.slice(0, -2) + " is")
    .replace(/\b(i|we)'d\b/g, "$1 would").replace(/\b(we|you)'re\b/g, "$1 are")
    .replace(/\b(?:john(?: ?paul)?(?: k)?(?: reju)?|jp)'?s\b|\byour\b/g, "his")
    .replace(/\b(?:john(?: ?paul)?(?: k)?(?: reju)?|jp|you)\b/g, "him")
    .replace(/(?:[$₹£€]|\b(?:inr|usd|rs\.?)\s+)\s*\d+(?:[.,]\d+)*(?:k\b)?|\b\d+(?:[.,]\d+)*\s*(?:lpa|lakhs?|crores?|k|usd|inr)\b/g, "salary")
    .replace(/\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/g, "today")
    .replace(/\b\d{1,2}(?::\d\d)?\s*(?:am|pm)\b/g, "time")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(?:(?:hello|hey|hi|please|thanks) )+/, "")
    .replace(/^(?:could|can|would) him (?:please )?/, "")
    .replace(/^(?:let (?:me|us) know |tell (?:me|us) )/, "")
  const clauses = q.split(/\s+(?:and(?: also)?|also|then)\s+/)
  const ids = clauses.map(clause => recruitingClause(clause, hiringContext || clauses.length > 1))
  return ids.every((id): id is string => id !== undefined) ? [...new Set(ids)] : undefined
}
