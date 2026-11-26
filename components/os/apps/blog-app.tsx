"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react"
import { MEDIUM_PROFILE_URL, PUBLISHED_ARTICLES, type Article } from "@/lib/os/blog"
import { PROFILE } from "@/lib/os/content"
import styles from "./portfolio-collection.module.css"

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" })

function PublicationDate({ story }: { story: Article }) {
  if (!story.date) return null
  const date = new Date(story.date)
  return Number.isNaN(date.getTime()) ? null : <time dateTime={story.date}>{dateFormat.format(date)}</time>
}

export function BlogApp() {
  const [articles, setArticles] = useState(PUBLISHED_ARTICLES)
  const [selection, setSelection] = useState<string | null>(null)
  const reader = useRef<HTMLElement>(null)
  const story = articles.find((item) => item.url === selection) ?? articles[0]
  const position = articles.indexOf(story)

  useEffect(() => {
    const controller = new AbortController()
    async function refresh() {
      const response = await fetch("/api/blog", { signal: controller.signal })
      if (!response.ok) return
      const { articles: recent }: { articles: Article[] } = await response.json()
      const catalogue = new Map(PUBLISHED_ARTICLES.map((article) => [article.url, article]))
      const merged = recent.map((article) => catalogue.get(article.url) ?? article)
      const urls = new Set(merged.map((article) => article.url))
      setArticles([...merged, ...PUBLISHED_ARTICLES.filter((article) => !urls.has(article.url))])
    }
    void refresh().catch(() => {})
    return () => controller.abort()
  }, [])

  function read(article: Article, fromIndex = false) {
    setSelection(article.url)
    if (fromIndex) {
      reader.current?.focus({ preventScroll: true })
      reader.current?.scrollIntoView({ block: "start" })
    }
  }

  return (
    <main className={`os-scroll ${styles.journal}`} aria-label="Blog">
      <div className={styles.paper}>
        <header className={styles.byline}>
          <h1>Blog<span>.</span></h1>
          <div><p>Writing by {PROFILE.name}</p>
            <a href={MEDIUM_PROFILE_URL} target="_blank" rel="noreferrer">Read my blog on Medium <ArrowUpRight size={14} aria-hidden /></a>
          </div>
        </header>

        {story && (
          <article ref={reader} className={styles.lead} tabIndex={-1} aria-label="Article preview">
            <div className={styles.editionBar}>
              <PublicationDate story={story} />
              <span className={styles.turnPage}>
                <button type="button" onClick={() => read(articles[position - 1])} disabled={position <= 0} aria-label="Previous article"><ArrowLeft size={18} aria-hidden /></button>
                <button type="button" onClick={() => read(articles[position + 1])} disabled={position + 1 >= articles.length} aria-label="Next article"><ArrowRight size={18} aria-hidden /></button>
              </span>
            </div>
            <div className={styles.spread}>
              <div className={styles.storyCopy}>
                <h2 aria-live="polite">{story.title}</h2>
                {story.description && <p>{story.description}</p>}
                <a className={styles.readArticle} href={story.url} target="_blank" rel="noreferrer">Read article on Medium <ArrowUpRight size={16} aria-hidden /></a>
              </div>
              {story.cover && <Image src={story.cover.src} width={960} height={540} alt={story.cover.alt} sizes="(max-width: 600px) 90vw, 450px" className={styles.cover} />}
              {story.url.endsWith("-bd84d28832ca") && (
                <div className={styles.complexity} aria-label="Binary search halves the remaining search space.">
                  <span>Binary search</span><strong>O(log n)</strong><small>Each comparison halves the remaining search space.</small>
                </div>
              )}
            </div>
          </article>
        )}

        <section className={styles.contents} aria-label="Article index">
          <h2>Article index</h2>
          {articles.map((article) => (
            <div className={styles.contentsRow} key={article.url}>
              <button type="button" aria-current={story?.url === article.url ? "true" : undefined} onClick={() => read(article, true)}>
                <PublicationDate story={article} /><span>{article.title}</span>
              </button>
              <a href={article.url} aria-label={`Read ${article.title} on Medium`} target="_blank" rel="noreferrer"><ArrowUpRight size={18} aria-hidden /></a>
            </div>
          ))}
        </section>
        <nav className={styles.socials} aria-label="Social profiles">
          <a href={`https://${PROFILE.linkedin}`} target="_blank" rel="noreferrer">LinkedIn <ArrowUpRight size={13} aria-hidden /></a>
          <a href={`https://${PROFILE.github}`} target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13} aria-hidden /></a>
        </nav>
      </div>
    </main>
  )
}
