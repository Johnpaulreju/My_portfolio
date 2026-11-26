import { courtesyReply } from "./chat-courtesy"
import { PROJECTS } from "./content"
import { recruiterFacts } from "./recruiter-intent"

type RequestType = "overview" | "work" | "repository" | "website" | "demo" | "campus"
type State = { subjects: string[]; places?: string[]; pending?: RequestType; recruiting?: boolean; limitedProject?: boolean }
type Selection = { ids: string[] } | { clarification: string }

const places = {
  mca: { name: "Kristu Jayanti College (MCA)", aliases: ["Kristu Jayanti College", "Kristu Jayanti", "MCA", "master of computer applications", "masters", "master s"], overview: "education-mca", work: ["project-smart-admission-manager", "project-icu-research"] },
  bca: { name: "JECRC University (BCA)", aliases: ["JECRC University", "JECRC", "BCA", "bachelor of computer applications", "bachelors", "bachelor s"], overview: "education-bca", work: ["work-jecrc"] },
  odyssey: { name: "Odyssey Therapeia", aliases: ["Odyssey Therapeia", "Odyssey"], overview: "work-odyssey", work: ["employer-projects"] },
  slimcortex: { name: "SlimCortex", aliases: ["SlimCortex", "Slim Cortex"], overview: "work-slimcortex", work: ["work-slimcortex"] },
  cell: { name: "Kristu Jayanti Software Development Cell", aliases: ["Kristu Jayanti Software Development Cell", "Software Development Cell"], overview: "project-smart-admission-manager", work: ["project-smart-admission-manager"] },
}
type Place = keyof typeof places
const collegeSubjects = ["mca", "bca"]
const workSubjects = ["odyssey", "slimcortex", "cell"]
const projectIds = PROJECTS.map(({ id }) => id)
const projectGroups: Record<string, string[]> = {
  projects: projectIds,
  "personal-projects": ["plan0", "portfolio-os", "mafia"],
  "freelance-projects": ["zion-safety-systems", "spaaronn-technologies"],
  "employer-projects": ["clinical-emr", "from-the-trunk", "conversational-avatars", "crm", "hrms", "candidate-interface"],
}
const shortNames: Record<string, string[]> = {
  "clinical-emr": ["EMR", "AI scribe", "clinical workspace"], "from-the-trunk": ["FTT"],
  "icu-research": ["ICU", "ICU mortality prediction"], "zion-safety-systems": ["Zion"],
  "spaaronn-technologies": ["Spaaronn"], plan0: ["Plan 0", "Plan Zero"],
}
const normalize = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim()
const names = new Map<string, string>()
for (const [id, place] of Object.entries(places)) {
  for (const alias of place.aliases) names.set(normalize(alias), id)
}
for (const project of PROJECTS) {
  for (const alias of [project.title, project.id, ...shortNames[project.id] ?? []]) names.set(normalize(alias), project.id)
}
// Prefer a complete institution name over the degree or college name inside it.
const namedSubject = new RegExp(`\\b(?:${[...names.keys()].sort((a, b) => b.length - a.length).join("|")})\\b`, "g")
const person = /\b(?:john(?: ?paul)?(?: k)?(?: reju)?|jp|you|he)\b/g
const unique = (values: string[]) => [...new Set(values)]
const isPlace = (id: string): id is Place => Object.hasOwn(places, id)
const subjectLabel = (id: string) => isPlace(id) ? places[id].name : PROJECTS.find((p) => p.id === id)?.title

function subjectsOf(ids: readonly string[]) {
  return unique(ids.flatMap((id) => {
    const project = id.replace(/^(?:repo|website|demo|project)-/, "")
    if (project !== id && projectIds.includes(project)) return [project]
    if (Object.hasOwn(projectGroups, id)) return projectGroups[id]
    if (id === "clinical-work") return ["clinical-emr"]
    if (id === "education" || id === "campuses") return collegeSubjects
    if (id === "experience") return workSubjects
    if (id === "work-jecrc") return ["bca"]
    const place = id.replace(/^(?:education|campus|work)-/, "")
    return isPlace(place) ? [place] : []
  }))
}

function clarify(subjects: string[]) {
  if (!subjects.length || subjects.length > 4) return "Which project, employer or college do you mean? For example, you can say Portfolio OS, Odyssey Therapeia or Kristu Jayanti College."
  const options = new Intl.ListFormat("en", { type: "disjunction" }).format(subjects.map(subjectLabel).filter((label): label is string => !!label))
  return `Do you mean ${options}?`
}

function select(request: RequestType, subjects: string[], plural: boolean): Selection {
  if (!subjects.length || (subjects.length > 1 && !plural)) return { clarification: clarify(subjects) }
  if (request === "repository" && subjects.length === projectIds.length) return { ids: ["repositories"] }
  const ids = unique(subjects.flatMap((id) => {
    if (!isPlace(id)) {
      if (request === "repository") return ["repo-" + id]
      if (request === "demo" && (id === "plan0" || id === "portfolio-os")) return ["demo-" + id]
      if (request === "website" || request === "demo") return ["website-" + id]
      return ["project-" + id]
    }
    if (request === "work") return places[id].work
    if (request === "campus" && collegeSubjects.includes(id)) return ["campus-" + id]
    if (request === "overview") return [places[id].overview]
    return []
  }))
  return ids.length ? { ids } : { clarification: "Which of Johnpaul’s projects would you like a link to?" }
}

// Answer only familiar portfolio question forms. Text that contains another
// person's name, a new task, or an unsupported detail goes to the scope classifier.
const linkWords = new Set("a an any are at available can code do does find for get github give has have he heres him his how i in is it its link linked links live me of on ones open page pages profile account handle projects public published repo repos repositories repository see share show site source sources that the their them there these they this those to url urls visit website websites what whats where which with you your demo demos please @".split(" "))
const workWords = new Set("a about academic accomplishments actually all and any are as at attend attended background bca build building built can career client clients college colleges companies company complete completed contribute contributed contributions create created current currently degree degrees design designed develop developed did do does during earn earned education educational employer employers engineering experience first for freelance from full give go graduated has have he held him his history how in independent institution institutions internship internships is it its job jobs lately list make made major me most of on overview own past personal position positions primary professional project projects published pursue pursued research research work researched role roles school schooling schools secondary share show some studies studied study studying tell that the their them there these this those to undergraduate university universities was what whats when where which who with work worked working works you your @".split(" "))

const basicQuestions: [RegExp, string][] = [
  [/^(?:skills|(?:what are|list|show me) his (?:technical )?skills|(?:whats|what is) his (?:tech )?stack|what (?:tools|technologies) does he use)$/, "skills"],
  [/^what is he (?:currently )?(?:learning|studying now)$/, "learning"],
  [/^(?:how (?:do|can) i (?:contact|reach) (?:him|he)|(?:whats|what is|show me|give me) his (?:work |public )?(?:email(?: address)?|contact (?:information|details|number)|phone(?: number)?)|contact)$/, "contact"],
  [/^(?:where (?:is he (?:based|located)|does he live)|(?:whats|what is) his location)$/, "location"],
  [/^(?:what (?:articles|blog posts) (?:has he written|has he published|did he write)|(?:show me|list) his (?:articles|blog posts)|his blog)$/, "articles"],
  [/^(?:is he (?:currently )?(?:available|open) (?:for|to) (?:work|freelance (?:work|projects))|(?:whats|what is) his availability)$/, "availability"],
  [/^(?:what (?:awards|certifications|achievements) (?:does he have|has he earned)|(?:list|show me) his (?:awards|certifications|achievements))$/, "achievements"],
  [/^(?:(?:which|what) languages (?:does|can) he speak|what languages does he work in)$/, "languages"],
  [/^(?:resume|(?:show me|share|open) his (?:resume|cv))$/, "resume"],
]

function turn(question: string, state: State): { selection: Selection; subjects: string[]; request?: RequestType } | undefined {
  const explicit: string[] = []
  const q = normalize(question.replace(/([a-z])[’']s\b/gi, "$1 's")).replace(namedSubject, (name) => {
    explicit.push(names.get(name)!)
    return "@"
  }).replace(/@ s\b/g, "@").replace(/\b(?:john(?: ?paul)?(?: k)?(?: reju)? s|jp s|your)\b/g, "his")
    .replace(/\b(what|it|where) s\b/g, "$1s").replace(person, "he")
    .replace(/^(?:(?:hi|hey|hello|thanks|please) )+/, "").replace(/^(?:can|could|would) he (?:please )?/, "").trim()
  const named = unique(explicit)
  const reference = /\b(it|its|there|that|this|them|those|these|ones|their|they|the project|the repo)\b/.test(q)
  const plural = /\b(their|these|those|them|they|ones|which projects|all)\b/.test(q)
  const words = q.split(" ")
  const aboutOwner = named.length > 0 || reference || /\b(he|his)\b/.test(q)
  function selected(request: RequestType, subjects: string[]) {
    return { selection: select(request, subjects, plural || named.length > 1), subjects, request }
  }
  function facts(ids: string[]) {
    return { selection: { ids }, subjects: subjectsOf(ids) }
  }
  const recruiting = recruiterFacts(question, state.recruiting)
  if (recruiting) return facts(recruiting)
  const subjects = named.length ? named : state.subjects
  const employerWork = /\b(?:employer|client|company|professional|commercial|internal|workplace) (?:work|projects?|systems?)\b/.test(q)
  const limited = employerWork || subjects.some(id => workSubjects.includes(id)
    || (projectIds.includes(id) && !["portfolio-os", "mafia", "icu-research"].includes(id)))
    || (!named.length && state.limitedProject)
  const technicalTopic = /\b(?:internals?|internally|under the hood|architectures?|implementation|implemented|technical details?|source files?|source code|codebase|schema|prompts?|roadmap|pipelines?|algorithms?|workflow|configurations?|models?|database|stack|frameworks?|logic|infrastructure|tech(?:nologies)?|step by step|exactly how|how exactly|in detail)\b/
  const sourceLocation = /^(?:where (?:can|could) i (?:browse|read|see|find|view|access)|show me) (?:its|the|@) source (?:files?|code)$/.test(q)
  if (sourceLocation && subjects.length) return selected("repository", subjects)
  const publicLink = /\b(?:github|repo|repos|repository|repositories|website|url|link)\b/.test(q) && !/\bprivate\b/.test(q)
  const technicalFollowUp = /^(?:(?:and |what about |which |what |the |his |was |is |what were |tell me about )+)?(?:architecture|tech stack|stack|implementation|databases?|technical details?|internals|models?|frameworks?|technologies|tools?)(?: (?:did he use|were used))?$/.test(q)
  const specific = named.length || employerWork || reference || technicalFollowUp
  if (limited && specific && technicalTopic.test(q) && !publicLink)
    return { selection: { ids: ["project-disclosure"] }, subjects }
  if ((!named.length || named.includes("smart-admission-manager")) && /\b(?:admissions? interviews?|interview scheduling)\b/.test(q) && /\b(?:his|he|project|@)\b/.test(q))
    return facts(["project-smart-admission-manager"])
  if (subjects.length && /^(?:what(?:s| is) (?:the |its )?(?:main )?(?:purpose|goal)(?: of (?:@|it))?|what (?:is (?:@|it) (?:for|about)|does (?:@|it) do)|who is (?:@|it) for|how does (?:@|it) work|(?:whats|what is) @ (?:main )?(?:purpose|goal))$/.test(q))
    return selected("overview", subjects)
  const basic = basicQuestions.find(([pattern]) => pattern.test(q))
  if (basic) return facts([basic[1]])
  if (/^(?:which school|what school|high school|primary school|secondary school|schooling)$/.test(q)
    || /^(?:which|what) (?:high |primary |secondary )?school did he (?:attend|go to)$/.test(q)) return facts(["schooling"])

  if (words.every((word) => linkWords.has(word)) && /\b(github|repo|repos|repositories|repository|source code|link|links|website|url|site|demo)\b/.test(q)) {
    if (!aboutOwner && !/^(?:(?:show|give|share) (?:me )?(?:the )?)?(?:github(?: profile| links?)?|(?:public )?(?:repos?|repositories)|which projects have (?:public )?github links?)$/.test(q)) return undefined
    const repository = /\b(github|repo|repos|repositories|repository|source code)\b/.test(q)
    if (repository && !named.length && /\b(his github|github profile|github account|github handle)\b/.test(q)
      && !/\b(projects|repositories|repos|repo|source code)\b/.test(q) && !reference) return facts(["github"])
    const subjects = named.length ? named : reference || (!/\b(his|he)\b/.test(q) && state.subjects.length) ? state.subjects : []
    if (repository && !subjects.length && !reference) return facts([/\b(projects|repos|repositories|links|source code)\b/.test(q) ? "repositories" : "github"])
    const request = repository ? "repository" : /\bdemo\b/.test(q) ? "demo" : "website"
    return selected(request, subjects)
  }

  if (named.length && /^(?:(?:and |what about |tell me about |i meant |i mean |the )?@(?: and @)*)(?: please)?$/.test(q)) {
    return selected(state.pending ?? "overview", named)
  }
  if (!words.every((word) => workWords.has(word))) {
    // Address lookups are distinct from questions about where Johnpaul studied.
    if (named.length && named.every((id) => collegeSubjects.includes(id)) && /^(?:(?:where is |what is (?:the |its )?(?:campus |college )?address (?:of |for )?|where is the campus of )@(?: located| based| campus)?|@ (?:campus|address|location))$/.test(q)) return selected("campus", named)
    return undefined
  }
  if (!aboutOwner && !/^(?:(?:tell me about|show me|list|share) (?:the )?)?(?:(?:independent|personal|freelance|professional) )?(?:projects|education|work experience|employers)$/.test(q)) return undefined
  if (/\b(high school|primary school|secondary school|schooling|which school|what school)\b/.test(q)) return facts(["schooling"])
  const detail = /\b(build|built|create|created|contribute|contributed|contributions|make|made|develop|developed|worked on|work on|research|projects)\b/.test(q)
    || /\bwhat did he do\b/.test(q)
  if (detail && (named.length || reference)) {
    const subjects = /\bthere\b/.test(q) && state.places?.length ? state.places : state.subjects
    return selected("work", named.length ? named : subjects)
  }
  if (named.length && (/\b(study|studied|degree|education|complete|earn|tell|about|work|experience)\b/.test(q) || /^(?:what is|whats) @|^where did he (?:do|pursue|earn|complete) his @$/.test(q))) return selected("overview", named)
  if (named.length) return undefined
  if (/\b(study|studied|education|college|colleges|university|universities|degrees?)\b/.test(q)) return facts(["education"])
  if (/\bwhere\b.*\b(work|worked|working)\b|\b(work experience|employers|employer history)\b/.test(q)) return facts(["experience"])
  if (detail) {
    if (/\b(personal|independent|own)\b/.test(q)) return facts(["personal-projects"])
    if (/\b(freelance|clients?)\b/.test(q)) return facts(["freelance-projects"])
    if (/\b(professional|employer)\b/.test(q)) return facts(["employer-projects"])
    return facts(["projects"])
  }
  return undefined
}

/** Reconstruct just the public subjects mentioned in this chat. A topic change
 * clears older referents. No visitor-provided prose is treated as an answer. */
export function resolveProfileConversation(question: string, previous: readonly string[] = [], previousFacts: readonly (readonly string[])[] = []): Selection | undefined {
  let state: State = { subjects: [] }
  const start = Math.max(0, previous.length - 3)
  for (let i = start; i < previous.length; i++) {
    if (courtesyReply(previous[i])) continue
    const result = turn(previous[i], state)
    const ids = previousFacts[i]
    if (result && "clarification" in result.selection && !ids?.length) {
      state = { subjects: result.subjects, pending: result.request }
      continue
    }
    const selectedIds = result && "ids" in result.selection ? result.selection.ids : []
    const answeredIds = ids?.length ? ids : selectedIds
    const limitedProject = answeredIds.includes("project-disclosure")
    state = {
      subjects: limitedProject ? result?.subjects ?? [] : subjectsOf(answeredIds),
      limitedProject,
      recruiting: answeredIds.some(id => id === "hiring-fit" || id === "compensation-contact" || id === "interview-contact"),
    }
    // "There" refers to the institution even if the reply named two projects.
    // "It" refers to the project actually returned in the answer.
    if (result && selectedIds.some((id) => answeredIds.includes(id))) state.places = result.subjects.filter(isPlace)
  }
  return turn(question, state)?.selection
}
