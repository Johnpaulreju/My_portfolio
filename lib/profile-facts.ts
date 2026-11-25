import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES } from "./os/blog"
import { ACHIEVEMENTS, PORTFOLIO_STATUS, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE } from "./os/content"
import { profileLink, SITE_URL } from "./site"

export type ProfileFact = {
  id: string
  text: string
  links?: { label: string; url: string }[]
}

const github = { label: "Johnpaul on GitHub", url: profileLink(PROFILE.github) }
const linkedin = { label: "Johnpaul on LinkedIn", url: profileLink(PROFILE.linkedin) }
const medium = { label: "Johnpaul on Medium", url: MEDIUM_PROFILE_URL }
const kristuJayanti = { label: "Kristu Jayanti campus and directions", url: "https://kristujayanti.edu.in/contact/" }
const jecrc = { label: "JECRC University campus and directions", url: "https://jecrcuniversity.edu.in/contact-us/" }
const mca = "Johnpaul completed his MCA at Kristu Jayanti College in Bengaluru from 2022 to 2024."
const bca = "He earned his BCA at JECRC University in Jaipur from 2019 to 2022."
const mcaCampus = "Kristu Jayanti’s main campus is in K. Narayanapura, Kothanur, Bengaluru, Karnataka 560077."
const bcaCampus = "JECRC University is in the Ramchandrapura Industrial Area, Vidhani, Sitapura Extension, Jaipur, Rajasthan 303905."

// Exact owner-published mappings. A similar name or technology is insufficient.
const repositories = new Map([
  ["repo-portfolio-os", "Johnpaulreju/My_portfolio"],
  ["repo-mafia", "Johnpaulreju/mafia_imposter"],
  ["repo-icu-research", "Johnpaulreju/ICU-Mortality-rate-prediction-using-Ml-Algo"],
])
// The Mafia repository lists this site as its homepage.
const additionalWebsites = new Map([
  ["portfolio-os", SITE_URL],
  ["mafia", "https://mafiaimposter-tvnv.vercel.app"],
])
const projectFacts: ProfileFact[] = PROJECTS.flatMap((project) => {
  const website = project.url ?? additionalWebsites.get(project.id)
  const links = website ? [{ label: project.title, url: website }] : undefined
  const repoId = "repo-" + project.id
  return [
    {
      id: "project-" + project.id,
      text: `Johnpaul describes ${project.title} in his own words. “${project.desc}” The portfolio lists ${project.stack} for this project.`,
      links,
    },
    {
      id: repoId,
      text: repositories.has(repoId)
        ? `${project.title} has an entry in Johnpaul’s public GitHub catalogue.`
        : `Johnpaul’s portfolio includes ${project.title}. It lists no verified public source-code repository for that project.`,
    },
    {
      id: "website-" + project.id,
      text: website
        ? `You can visit ${project.title} at its published website.`
        : `The portfolio describes ${project.title} and does not list a public demo URL.`,
      links,
    },
  ]
})

const articleIds: Record<string, string> = {
  e5230a5214ff: "article-seo",
  bd84d28832ca: "article-complexity",
}
const articleFacts: ProfileFact[] = PUBLISHED_ARTICLES.flatMap((article) => {
  const postId = article.url.split("-").pop() ?? ""
  const id = articleIds[postId] ?? "article-" + postId
  const link = { label: article.title, url: article.url }
  return [
    {
      id,
      text: `Johnpaul published “${article.title}”${article.date ? ` on ${article.date}` : ""}. ${article.description ?? ""}`.trim(),
      links: [link],
    },
    {
      id: "repo-" + id,
      text: `“${article.title}” is a Medium article. Johnpaul hasn’t listed a companion public code repository for it.`,
      links: [link],
    },
  ]
})

export const profileFacts: ProfileFact[] = [
  { id: "profile", text: `${PROFILE.name} describes his work this way. “${PROFILE.summary}”` },
  { id: "role", text: `Johnpaul’s portfolio headline is ${PROFILE.headline}. His focus is ${PROFILE.next.toLowerCase()}.` },
  { id: "location", text: `Johnpaul is based in ${PROFILE.location}.` },
  { id: "languages", text: "Johnpaul works in English, Malayalam and Hindi." },
  { id: "contact", text: `You can reach Johnpaul at ${PROFILE.email} or ${PROFILE.phone}.`, links: [linkedin] },
  { id: "availability", text: `Johnpaul’s availability: “${PROFILE.availability}” You can email him at ${PROFILE.email}.` },
  { id: "learning", text: `Johnpaul says, “${PROFILE.learning}”` },
  { id: "experience", text: TIMELINE.filter((t) => t.kind === "work").map((t) => t.facts[0]).join(" ") },
  { id: "clinical-work", text: "At Odyssey Therapeia, Johnpaul designed the appointment-to-scribe workflow, where a doctor can open a consultation and start taking notes. The team built a session portal for invited doctors. Staff can redact personal details before exporting records." },
  { id: "education", text: `${mca} ${bca}`, links: [kristuJayanti, jecrc] },
  { id: "education-mca", text: `${mca} He researched ICU mortality prediction using k-nearest neighbors and helped lead and judge a college robotics festival.`, links: [kristuJayanti] },
  { id: "education-bca", text: `${bca} He placed in the top ten at a cyber hackathon with an AI-based cybersecurity solution.`, links: [jecrc] },
  { id: "campuses", text: `${mcaCampus} ${bcaCampus}`, links: [kristuJayanti, jecrc] },
  { id: "campus-mca", text: mcaCampus, links: [kristuJayanti] },
  { id: "campus-bca", text: bcaCampus, links: [jecrc] },
  { id: "schooling", text: "Johnpaul’s public education history begins with his BCA. He hasn’t named his primary or secondary school." },
  { id: "projects", text: `Johnpaul’s selected work includes ${PROJECTS.map((p) => p.title).join(", ")}.` },
  { id: "employer-projects", text: "Johnpaul’s work for Odyssey Therapeia includes the clinical workspace and scribe, From The Trunk, conversational avatars, a CRM, and an HR management system. He also developed a candidate interface for Odyssey’s partner Alpha Company." },
  { id: "freelance-projects", text: "Johnpaul’s freelance clients include Zion Safety Systems in Kochi and instrumentation supplier Spaaronn Technologies." },
  { id: "personal-projects", text: "Johnpaul’s personal projects include Plan0, Portfolio OS and the Mafia game." },
  { id: "credits", text: "Johnpaul credits Odyssey Therapeia for his clinical and storefront work, his clinical teammates for the invited-doctor portal, and the Kristu Jayanti Software Development Cell for Smart Admission Manager. Alpha Company supplied the brief for its candidate interface." },
  { id: "research", text: `Johnpaul describes his experiments this way. “${PORTFOLIO_STATUS.lab.body}”` },
  { id: "skills", text: SKILL_GROUPS.map((group) => `${group.label}: ${group.items.map((item) => item.name).join(", ")}.`).join(" ") },
  ...SKILL_GROUPS.map((group) => ({
    id: "skills-" + group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
    text: `Johnpaul lists ${group.items.map((item) => item.name).join(", ")} under ${group.label}.`,
  })),
  { id: "achievements", text: ACHIEVEMENTS.map((a) => `${a.title} — ${a.detail}`).join(". ") + "." },
  { id: "resume", text: "Johnpaul’s résumé covers his work, projects, technical skills and education. The résumé page includes a print or save-as-PDF option.", links: [{ label: "Read Johnpaul’s résumé", url: SITE_URL + "/resume" }] },
  { id: "about", text: "The About page introduces Johnpaul and his work across healthcare, e-commerce and independent projects.", links: [{ label: "About Johnpaul", url: SITE_URL + "/about" }] },
  { id: "linkedin", text: "Johnpaul lists LinkedIn as a professional contact channel.", links: [linkedin] },
  { id: "github", text: "Johnpaul publishes code on GitHub under Johnpaulreju.", links: [github] },
  { id: "repositories", text: "The portfolio has identified public GitHub repositories for Portfolio OS, Mafia and the ICU mortality prediction research. Select a project to check its repository.", links: [github] },
  { id: "articles", text: `Johnpaul writes on Medium. Published articles include ${PUBLISHED_ARTICLES.map((a) => `“${a.title}”`).join(" and ")}.`, links: [medium] },
  { id: "repo-articles", text: "Johnpaul’s publications are on Medium. His portfolio lists no public source-code repositories for those articles.", links: [medium] },
  ...projectFacts,
  ...articleFacts,
]

type RepoStatus = "public" | "missing" | "unavailable"
const repoCache = new Map<string, { expires: number; status: Promise<RepoStatus> }>()

async function checkRepo(slug: string): Promise<RepoStatus> {
  try {
    const response = await fetch("https://api.github.com/repos/" + slug, {
      headers: { Accept: "application/vnd.github+json" },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(4000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return response.status === 404 ? "missing" : "unavailable"
    }
    const data = await response.json()
    return data?.private === false && data.full_name === slug && data.html_url === "https://github.com/" + slug
      ? "public"
      : "unavailable"
  } catch {
    return "unavailable"
  }
}

export async function resolveProfileFact(fact: ProfileFact): Promise<ProfileFact> {
  if (fact.id === "repositories") {
    const results = await Promise.all(
      Array.from(repositories.keys(), (id) => resolveProfileFact({ id, text: "" })),
    )
    return {
      id: fact.id,
      text: results.map((repo) => repo.text).join(" "),
      links: results.flatMap((repo) => repo.links ?? []),
    }
  }
  const slug = repositories.get(fact.id)
  if (!slug) return fact
  let entry = repoCache.get(slug)
  if (!entry || entry.expires <= Date.now()) {
    entry = { expires: Date.now() + 60_000, status: checkRepo(slug) }
    repoCache.set(slug, entry)
  }
  const status = await entry.status
  const title = PROJECTS.find((project) => "repo-" + project.id === fact.id)?.title ?? slug
  if (status === "public") {
    return { id: fact.id, text: `${title} has a public repository on Johnpaul’s GitHub.`, links: [{ label: `${title} on GitHub`, url: "https://github.com/" + slug }] }
  }
  const message = status === "missing"
    ? `GitHub didn’t return a public repository for ${title} at its recorded address.`
    : `I couldn’t verify the public GitHub repository for ${title} just now.`
  return { id: fact.id, text: message }
}
