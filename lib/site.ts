import type { Metadata } from "next"
import { PROFILE, SKILL_GROUPS } from "@/lib/os/content"

const DEFAULT_SITE_URL = "https://www.johnpaulreju.in"

/** One canonical HTTPS origin. Invalid deployment configuration fails visibly. */
export function resolveSiteUrl(value: string | undefined): string {
  if (!value?.trim()) return DEFAULT_SITE_URL
  const url = new URL(value.trim())
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS origin without credentials, a path, query, or fragment.")
  }
  return url.origin
}

export const SITE_URL = resolveSiteUrl(process.env.NEXT_PUBLIC_SITE_URL)
export const SITE_NAME = `${PROFILE.name} — Portfolio OS`

// These fields are being added to shared content separately. Read safely during integration.
function profileText(key: string, fallback: string): string {
  const value = (PROFILE as Readonly<Record<string, unknown>>)[key]
  return typeof value === "string" && value.trim() ? value : fallback
}

export const PROFILE_SUMMARY = profileText("summary", PROFILE.tagline)
export const PROFILE_AVAILABILITY = profileText("availability", "Open to freelance projects. Tell me what you want to build.")
export const PROFILE_LEARNING = profileText("learning", "I’m studying AI agents and exploring new AI technology. My brain is still downloading updates.")

export function profileLink(value: string): string {
  return value.startsWith("https://") ? value : `https://${value}`
}

export const SITE_PAGES = {
  "/": {
    title: `${PROFILE.name} — ${PROFILE.headline}`,
    description: `${PROFILE.name}, ${PROFILE.title} in ${PROFILE.location}, and ${PROFILE.next}. ${PROFILE.tagline} Open to freelance work.`,
  },
  "/about": {
    title: `About ${PROFILE.name} — ${PROFILE.title}, ${PROFILE.next}`,
    description: `Meet ${PROFILE.name}, a software engineer who builds websites, React Native apps and AI tools, now studying AI agents to become a GenAI engineer.`,
  },
  "/resume": {
    title: `${PROFILE.name} — Resume · ${PROFILE.title}`,
    description: `${PROFILE.name}’s resume: ${PROFILE.headline}. Skills, work and education history, and contact details, ready to print.`,
  },
} as const

export function pageMetadata(path: keyof typeof SITE_PAGES): Metadata {
  const { title, description } = SITE_PAGES[path]
  const url = `${SITE_URL}${path === "/" ? "" : path}`
  const image = { url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630, alt: `${PROFILE.name} — ${PROFILE.headline}. Portfolio OS.` }
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url, ...(path === "/about" ? { types: { "text/markdown": `${SITE_URL}/about.md` } } : {}) },
    openGraph: { type: "website", locale: "en_IN", siteName: SITE_NAME, title, description, url, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

export function siteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person", "@id": `${SITE_URL}/#person`,
        name: PROFILE.name, jobTitle: PROFILE.title, description: `${PROFILE.headline}. ${PROFILE_SUMMARY} ${PROFILE.learning}`,
        knowsAbout: [...SKILL_GROUPS.flatMap((group) => group.items.map((item) => item.name)), "Generative AI"],
        url: `${SITE_URL}/about`,
        sameAs: [profileLink(PROFILE.github), profileLink(PROFILE.linkedin)],
      },
      {
        "@type": "WebSite", "@id": `${SITE_URL}/#website`,
        name: SITE_NAME, url: SITE_URL, inLanguage: "en",
        author: { "@id": `${SITE_URL}/#person` },
      },
    ],
  }
}
