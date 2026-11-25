import { PUBLISHED_ARTICLES } from "@/lib/os/blog"

// WebP previews of the public sites linked by their project entries.
// The writing cover is the original artwork prepared for the published case study.
export const projectPreviews: Readonly<Partial<Record<string, string>>> = {
  "from-the-trunk": "/media/work/from-the-trunk.webp",
  "spaaronn-technologies": "/media/work/spaaronn.webp",
  "zion-safety-systems": "/media/work/zion.webp",
  plan0: "/media/work/plan0.webp",
}

export const seoCaseStudy = PUBLISHED_ARTICLES.find((article) => article.url.endsWith("-e5230a5214ff"))
export const seoCover = "/media/work/seo-attribution.webp"
