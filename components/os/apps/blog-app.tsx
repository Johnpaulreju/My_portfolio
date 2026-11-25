"use client"

import Image from "next/image"
import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES, type Article } from "@/lib/os/blog"
import { PROFILE } from "@/lib/os/content"
import { seoCaseStudy, seoCover } from "@/components/site/work-media"
import styles from "./portfolio-collection.module.css"

const profiles = [
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
    <main className={`os-scroll ${styles.viewport}`} aria-label="Blog">
      <div className={styles.sheet}>
        <header className={styles.titleRow}>
          <h1 className={styles.title}>Blog</h1>
          <a href={MEDIUM_PROFILE_URL} target="_blank" rel="noreferrer" className={styles.profileLink}>
            Read my blog on Medium <ArrowUpRight size={16} aria-hidden />
          </a>
        </header>
        {articles.map((story) => {
          const hasCover = story.url === seoCaseStudy?.url
          return (
            <article key={story.url} className={`${styles.story} ${hasCover ? styles.leadStory : ""}`}>
              <a href={story.url} target="_blank" rel="noreferrer" className={styles.storyInner}>
                {hasCover && <Image className={styles.storyCover} src={seoCover} width={960} height={540} alt="" />}
                <div className={styles.storyBody}>
                  {story.date && <time className={styles.date} dateTime={story.date}>{dateFormat.format(new Date(story.date))}</time>}
                  <h2>{story.title}</h2>
                  {story.description && <p className={styles.body}>{story.description}</p>}
                  <span className={styles.storyLink}>Read article <ArrowUpRight size={15} aria-hidden /></span>
                </div>
              </a>
            </article>
          )
        })}
        <nav className={styles.socials} aria-label="Social profiles">
          {profiles.map(({ label, url }) => (
            <a className={styles.profileLink} key={label} href={url} target="_blank" rel="noreferrer">{label} <ArrowUpRight size={14} aria-hidden /></a>
          ))}
        </nav>
      </div>
    </main>
  )
}
