import type { MetadataRoute } from "next"
import { SITE_PAGES, SITE_URL } from "@/lib/site"
import { PUBLISHED_VIDEOS } from "@/lib/os/tube-videos"

export default function sitemap(): MetadataRoute.Sitemap {
  // No placeholder Projects/Lab pages or invented modification dates.
  const paths = [...Object.keys(SITE_PAGES), ...PUBLISHED_VIDEOS.map(({ id }) => `/watch/${id}`)]
  return paths.map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }))
}
