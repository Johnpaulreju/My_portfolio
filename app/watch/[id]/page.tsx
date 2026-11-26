import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ReadablePage } from "@/components/site/profile"
import styles from "@/components/site/site.module.css"
import { getPublishedVideo, PUBLISHED_VIDEOS } from "@/lib/os/tube-videos"
import { SITE_URL } from "@/lib/site"

type WatchProps = { params: Promise<{ id: string }> }

export const dynamicParams = false

export function generateStaticParams() {
  return PUBLISHED_VIDEOS.map(({ id }) => ({ id }))
}

export async function generateMetadata({ params }: WatchProps): Promise<Metadata> {
  const video = getPublishedVideo((await params).id)
  if (!video) notFound()
  const title = `${video.title} | JP Tube`
  const url = `${SITE_URL}/watch/${video.id}`
  return {
    title: { absolute: title },
    description: video.description,
    alternates: { canonical: url },
    openGraph: { type: "video.other", title, description: video.description, url, images: [video.poster], videos: [{ url: SITE_URL + video.src, type: "video/mp4" }] },
    twitter: { card: "summary_large_image", title, description: video.description, images: [video.poster] },
  }
}

export default async function WatchPage({ params }: WatchProps) {
  const video = getPublishedVideo((await params).id)
  if (!video) notFound()
  return (
    <ReadablePage>
      <p className={styles.eyebrow}>JP Tube</p>
      <h1>{video.title}</h1>
      <video className={styles.watchPlayer} controls playsInline preload="metadata" poster={video.poster} aria-label={video.title}>
        <source src={video.src} type="video/mp4" />
        <track kind="captions" srcLang="en" label="English" src={video.captions} default={!video.openCaptions} />
        <a href={video.src}>Open the video file</a>
      </video>
      <p>{video.description}</p>
      <nav className={styles.nav} aria-label="More on JP Tube">
        {PUBLISHED_VIDEOS.filter(({ id }) => id !== video.id).map((other) => (
          <Link key={other.id} href={`/watch/${other.id}`}>{other.title}</Link>
        ))}
      </nav>
    </ReadablePage>
  )
}
