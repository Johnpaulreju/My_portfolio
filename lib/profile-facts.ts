import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES } from "./os/blog"
import { ACHIEVEMENTS, PROFILE, PROJECTS, SKILL_GROUPS } from "./os/content"
import { profileContactLinks } from "./os/profile-contact"
import { profileLink, SITE_URL } from "./site"
import { PUBLISHED_VIDEOS } from "./os/tube-videos"

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
const plan0Purpose = "Johnpaul is building Plan0 to help people turn a software idea into a clear project plan they can share with a developer or coding agent."
const clinicalOverview = "At Odyssey Therapeia, Johnpaul built a clinical workspace with an AI scribe to help doctors document consultations."

// Project pages can contain more detail than Johnpaul shares in conversation.
// A new project gets a title until its conversational summary and public link are reviewed.
const chatProjects = new Map<string, { summary: string; shareWebsite?: boolean }>([
  ["clinical-emr", { summary: clinicalOverview }],
  ["from-the-trunk", { summary: "Johnpaul built most of From The Trunk, a storefront for preloved sarees, as part of his work at Odyssey Therapeia.", shareWebsite: true }],
  ["zion-safety-systems", { summary: "Johnpaul built a public website for Zion Safety Systems, a freelance client in Kochi.", shareWebsite: true }],
  ["spaaronn-technologies", { summary: "Johnpaul is developing a product catalogue for Spaaronn Technologies, an industrial instrumentation supplier and freelance client.", shareWebsite: true }],
  ["plan0", { summary: plan0Purpose, shareWebsite: true }],
  ["smart-admission-manager", { summary: "Johnpaul contributed to Smart Admission Manager as a backend developer with the Kristu Jayanti Software Development Cell. The project supported college admissions." }],
  ["conversational-avatars", { summary: "Johnpaul worked on conversational avatars at Odyssey Therapeia." }],
  ["crm", { summary: "Johnpaul contributed to a customer relationship management application at Odyssey Therapeia." }],
  ["hrms", { summary: "Johnpaul worked on a human resources application for Odyssey Therapeia." }],
  ["candidate-interface", { summary: "Johnpaul contributed to a candidate-facing application at Odyssey Therapeia." }],
  ["icu-research", { summary: "For his MCA at Kristu Jayanti College, Johnpaul researched ICU mortality prediction using k-nearest neighbors." }],
  ["portfolio-os", { summary: "Johnpaul built Portfolio OS with Next.js, React and Zustand. Visitors can explore his projects on a windowed desktop, browse them from a phone home screen or print his résumé." }],
  ["mafia", { summary: "Johnpaul built Mafia as a personal game project." }],
])

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
  const overview = chatProjects.get(project.id)
  const website = overview?.shareWebsite ? project.url : additionalWebsites.get(project.id)
  const links = website ? [{ label: project.title, url: website }] : undefined
  const repoId = "repo-" + project.id
  return [
    {
      id: "project-" + project.id,
      text: overview?.summary ?? `Johnpaul lists ${project.title} in his portfolio.`,
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

const articleDetails: Record<string, { id: string; summary: string }> = {
  "85ecacf315b2": { id: "article-sqlite", summary: "Johnpaul looks at why Zerodha chose SQLite for Blobasaur, a service that stores chart settings and other user preferences." },
  e5230a5214ff: { id: "article-seo", summary: "Johnpaul prepared this From The Trunk case study for publication. Neel Raval contributed research and writing, and From The Trunk provided the data." },
  bd84d28832ca: { id: "article-complexity", summary: "Johnpaul uses linear and binary search to explain how runtime and memory change as an input grows." },
}
const articleFacts: ProfileFact[] = PUBLISHED_ARTICLES.flatMap((article) => {
  const postId = article.url.split("-").pop() ?? ""
  const { id, summary } = articleDetails[postId] ?? { id: "article-" + postId, summary: "" }
  const link = { label: article.title, url: article.url }
  return [
    {
      id,
      text: `Johnpaul published “${article.title}”${article.date ? ` on ${article.date}` : ""}. ${summary}`.trim(),
      links: [link],
    },
    {
      id: "repo-" + id,
      text: `“${article.title}” is a Medium article. Johnpaul hasn’t listed a companion public code repository for it.`,
      links: [link],
    },
  ]
})

const projectWalkthroughs: Record<string, string> = { "plan0-demo": "plan0", "portfolio-tour": "portfolio-os" }

export const profileFacts: ProfileFact[] = [
  { id: "profile", text: PROFILE.introduction, links: [{ label: "About Johnpaul", url: SITE_URL + "/about" }] },
  { id: "role", text: `Johnpaul’s portfolio headline is ${PROFILE.headline}. His focus is ${PROFILE.next.toLowerCase()}.` },
  { id: "location", text: `Johnpaul is based in ${PROFILE.location}.` },
  { id: "languages", text: "Johnpaul works in English, Malayalam and Hindi." },
  {
    id: "hiring-fit",
    text: "Johnpaul would be a strong fit for a team building a web product with an AI component. At Odyssey Therapeia, he worked on clinical software and built most of From The Trunk, a storefront for preloved sarees. You can try his product work firsthand in Portfolio OS, where he used React and Next.js to make the same projects easy to explore on a desktop or phone.\n\nHe also brings experience with applied machine learning. During his MCA at Kristu Jayanti College, he used k-nearest neighbors to study ICU mortality prediction. If communicating technical ideas matters to your team, his Medium guide to algorithm complexity is a sample of how he explains code to other developers.",
    links: [
      { label: "Watch the Portfolio OS tour", url: SITE_URL + "/watch/portfolio-tour" },
      ...(articleFacts.find((fact) => fact.id === "article-complexity")?.links ?? []),
    ],
  },
  { id: "compensation-contact", text: `Johnpaul handles compensation discussions directly. Please email ${PROFILE.email} or call ${PROFILE.phone} with the role and its scope so he can discuss his expectations with you.`, links: profileContactLinks },
  { id: "interview-contact", text: `To invite Johnpaul to an interview or discuss the interview process, please email ${PROFILE.email} or call ${PROFILE.phone}. You can include the role and a few times that work for you.`, links: profileContactLinks },
  { id: "project-disclosure", text: `I can share what the project is for and the part Johnpaul played. He keeps the implementation details private. If you’d like to discuss his public work, you can email him at ${PROFILE.email}.`, links: [profileContactLinks[0]] },
  { id: "contact", text: `You can reach Johnpaul at ${PROFILE.email} or ${PROFILE.phone}.`, links: [...profileContactLinks, linkedin] },
  { id: "availability", text: `Johnpaul’s availability: “${PROFILE.availability}” You can email him at ${PROFILE.email}.` },
  { id: "learning", text: `Johnpaul says, “${PROFILE.learning}”` },
  { id: "experience", text: "Johnpaul worked as a backend developer with the Kristu Jayanti Software Development Cell in 2023. He joined Odyssey Therapeia as a Junior AI Engineer, began full-time work there in June 2024 and continued with SlimCortex through an internal transition." },
  { id: "work-odyssey", text: "Johnpaul joined Odyssey Therapeia as a Junior AI Engineer and began full-time work in June 2024. His projects there included a clinical workspace with an AI scribe and the From The Trunk storefront." },
  { id: "work-slimcortex", text: "Johnpaul continued with SlimCortex through an internal transition from Odyssey Therapeia. His public portfolio credits the clinical workspace and From The Trunk to Odyssey. It does not identify a separate SlimCortex project." },
  { id: "work-jecrc", text: "During his BCA at JECRC University, Johnpaul placed in the top ten at a cyber hackathon with an AI-based cybersecurity solution. His public portfolio gives no further implementation details about that project." },
  { id: "clinical-work", text: clinicalOverview },
  { id: "education", text: `${mca} ${bca}`, links: [kristuJayanti, jecrc] },
  { id: "education-mca", text: `${mca} He researched ICU mortality prediction using k-nearest neighbors and helped lead and judge a college robotics festival.`, links: [kristuJayanti] },
  { id: "education-bca", text: `${bca} He placed in the top ten at a cyber hackathon with an AI-based cybersecurity solution.`, links: [jecrc] },
  { id: "campuses", text: `${mcaCampus} ${bcaCampus}`, links: [kristuJayanti, jecrc] },
  { id: "campus-mca", text: mcaCampus, links: [kristuJayanti] },
  { id: "campus-bca", text: bcaCampus, links: [jecrc] },
  { id: "schooling", text: "Johnpaul’s public education history begins with his BCA. He hasn’t named his primary or secondary school." },
  { id: "projects", text: `Johnpaul’s selected work includes ${PROJECTS.map((p) => p.title).join(", ")}.` },
  { id: "employer-projects", text: "At Odyssey Therapeia, Johnpaul worked on clinical software, including an AI scribe, and built most of From The Trunk, a storefront for preloved sarees. His other work there included conversational avatars and business applications." },
  { id: "freelance-projects", text: "Johnpaul’s freelance clients include Zion Safety Systems in Kochi and instrumentation supplier Spaaronn Technologies." },
  { id: "personal-projects", text: "Johnpaul’s personal projects include Plan0, Portfolio OS and the Mafia game." },
  { id: "credits", text: "Johnpaul credits Odyssey Therapeia and his colleagues there for the clinical workspace and From The Trunk. He worked on Smart Admission Manager with the Kristu Jayanti Software Development Cell." },
  { id: "research", text: "Johnpaul researched ICU mortality prediction using k-nearest neighbors during his MCA at Kristu Jayanti College. The portfolio links to his public research repository." },
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
  { id: "articles", text: `Johnpaul writes on Medium. Published articles include ${new Intl.ListFormat("en").format(PUBLISHED_ARTICLES.map((a) => `“${a.title}”`))}.`, links: [medium] },
  { id: "repo-articles", text: "Johnpaul’s publications are on Medium. His portfolio lists no public source-code repositories for those articles.", links: [medium] },
  ...projectFacts,
  ...PUBLISHED_VIDEOS.filter((video) => projectWalkthroughs[video.id]).map((video) => ({
    id: "demo-" + projectWalkthroughs[video.id],
    text: video.id === "plan0-demo" ? `The public walkthrough introduces the idea behind Plan0. ${plan0Purpose}` : video.description,
    links: [{ label: video.title, url: SITE_URL + "/watch/" + video.id }],
  })),
  ...articleFacts,
]

const localFacts = new Map(profileFacts.map((fact) => [fact.id, fact]))

/** A browser without the API can show the published facts. Checking whether a
 * mapped repository is still public requires the normal server lookup. */
export function offlineProfileFacts(ids: readonly string[]) {
  const selected = [...new Set(ids)].flatMap((id) => {
    const fact = localFacts.get(id)
    if (!fact) return []
    if (id === "repositories" || repositories.has(id)) {
      const project = PROJECTS.find((p) => "repo-" + p.id === id)
      const subject = project ? `the repository for ${project.title}` : "the public repository links"
      return [{ id, text: `I can’t verify ${subject} right now. You can check Johnpaul’s GitHub profile.`, links: [github] }]
    }
    return [fact]
  })
  const links = selected.flatMap((fact) => fact.links ?? [])
  return { text: selected.map((fact) => fact.text).join("\n\n"), links: [...new Map(links.map((link) => [link.url, link])).values()], factIds: selected.map((fact) => fact.id) }
}

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
