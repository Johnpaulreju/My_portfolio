import type { MetadataRoute } from "next"
import { SITE_PAGES, SITE_URL } from "@/lib/site"

export default function sitemap(): MetadataRoute.Sitemap {
  // No placeholder Projects/Lab pages or invented modification dates.
  return Object.keys(SITE_PAGES).map((path) => ({ url: `${SITE_URL}${path === "/" ? "" : path}` }))
}
