export const MEDIUM_PROFILE_URL = "https://medium.com/@johnpaulreju2k"

export type Article = {
  title: string
  url: string
  date?: string
  description?: string
}

export const PUBLISHED_ARTICLES: Article[] = [
  {
    title: "We Removed a Hyphen. Organic Clicks Rose 450%. Here Is What the Data Really Said.",
    url: `${MEDIUM_PROFILE_URL}/we-removed-a-hyphen-organic-clicks-rose-450-here-is-what-the-data-really-said-e5230a5214ff`,
    date: "2026-10-26",
    description: "Organic clicks rose from 2 to 11 after several changes to From The Trunk. I worked with Neel Raval on the case study and prepared it for publication. Neel contributed research and writing, and From The Trunk provided the data.",
  },
  {
    title: "From O(1) to O(n!): A Friendly Guide to Algorithm Complexity (with real code)",
    url: `${MEDIUM_PROFILE_URL}/from-o-1-to-o-n-a-friendly-guide-to-algorithm-complexity-with-real-code-bd84d28832ca`,
    date: "2025-08-12",
    description: "A guide to how runtime and memory grow with input size, using linear search, binary search and other code examples.",
  },
]
