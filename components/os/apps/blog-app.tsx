"use client"

import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES, type Article } from "@/lib/os/blog"
import { PROFILE } from "@/lib/os/content"
import { Card, Page, PageTitle } from "./kit"

const profiles = [
  { label: "Medium", url: MEDIUM_PROFILE_URL },
  { label: "LinkedIn", url: `https://${PROFILE.linkedin}` },
  { label: "GitHub", url: `https://${PROFILE.github}` },
]

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" })

export function BlogApp() {
  const [articles, setArticles] = useState(PUBLISHED_ARTICLES)
  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
      const response = await fetch("/api/blog", { signal: controller.signal })
      if (!response.ok) return
      const { articles: recent }: { articles: Article[] } = await response.json()
      const catalogue = new Map(PUBLISHED_ARTICLES.map((story) => [story.url, story]))
      const merged = recent.map((story) => catalogue.get(story.url) ?? story)
      const urls = new Set(merged.map((story) => story.url))
      setArticles([...merged, ...PUBLISHED_ARTICLES.filter((story) => !urls.has(story.url))])
    }
    // The bundled catalogue is available offline and when Medium is unavailable.
    void refresh().catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <Page>
      <PageTitle title="Blog" sub="My writing on Medium" />
      <Card>
        <ul className="divide-y divide-[var(--os-border)]">
          {articles.map((story) => (
            <li key={story.url}>
              <a href={story.url} target="_blank" rel="noreferrer" className="block rounded-lg p-4 hover:bg-[var(--os-hover)]">
                {story.date && <time dateTime={story.date} className="text-xs text-[var(--os-muted)]">{dateFormat.format(new Date(story.date))}</time>}
                <h2 className="mt-1 text-[15px] font-semibold text-[var(--os-fg)]">{story.title} <ArrowUpRight size={14} className="inline" aria-hidden /></h2>
                {story.description && <p className="mt-2 text-[13px] leading-relaxed text-[var(--os-muted)]">{story.description}</p>}
              </a>
            </li>
          ))}
        </ul>
      </Card>
      <h2 className="mb-2 mt-6 text-sm font-semibold text-[var(--os-fg)]">Social profiles</h2>
      <Card>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 px-4 py-3">
          {profiles.map(({ label, url }) => (
            <li key={label}><a href={url} target="_blank" rel="noreferrer" className="text-sm text-[var(--os-accent-fg)] hover:underline">{label} <ArrowUpRight size={13} className="inline" aria-hidden /></a></li>
          ))}
        </ul>
      </Card>
    </Page>
  )
}
