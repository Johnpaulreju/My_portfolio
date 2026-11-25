import { SaxesParser } from "saxes"
import { MEDIUM_PROFILE_URL, type Article } from "@/lib/os/blog"

const profile = new URL(MEDIUM_PROFILE_URL)
const feedUrl = new URL("/feed" + profile.pathname.replace(/\/$/, ""), profile.origin)
const maxFeedBytes = 4 * 1024 * 1024

function articleUrl(value: string): string | undefined {
  if (!URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password || url.port) return
  if (url.hostname !== "medium.com" && !url.hostname.endsWith(".medium.com")) return
  url.searchParams.delete("source")
  url.hash = ""
  return url.href
}

async function readArticles(body: ReadableStream<Uint8Array>): Promise<Article[]> {
  const articles: Article[] = []
  const parser = new SaxesParser()
  const path: string[] = []
  let title = ""
  let link = ""
  let field: "title" | "link" | undefined

  parser.on("opentag", (tag) => {
    path.push(tag.name)
    if (path.length === 4 && path[0] === "rss" && path[1] === "channel" && path[2] === "item") {
      if (tag.name === "title" || tag.name === "link") field = tag.name
    }
  })
  function capture(value: string) {
    if (field === "title") title += value
    if (field === "link") link += value
  }
  parser.on("text", capture)
  parser.on("cdata", capture)
  parser.on("closetag", () => {
    if (path.length === 4) field = undefined
    if (path.length === 3 && path[0] === "rss" && path[1] === "channel" && path[2] === "item") {
      const url = articleUrl(link.trim())
      if (title.trim() && url) articles.push({ title: title.trim(), url })
      title = ""
      link = ""
    }
    path.pop()
  })

  const decoder = new TextDecoder()
  const reader = body.getReader()
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxFeedBytes) throw new Error("Feed exceeds size limit")
      parser.write(decoder.decode(value, { stream: true }))
    }
    parser.write(decoder.decode()).close()
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  return articles
}

export async function GET() {
  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(5000),
      redirect: "error",
      cache: "no-store",
    })
    if (response.ok && response.body) {
      const articles = await readArticles(response.body)
      if (articles.length) {
        return Response.json({ articles }, {
          headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
        })
      }
    }
  } catch {
    // The Blog app also includes John's verified articles when Medium is unavailable.
  }
  return Response.json({ articles: [] }, {
    headers: { "Cache-Control": "public, s-maxage=60" },
  })
}
