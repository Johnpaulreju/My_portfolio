import { siteStructuredData } from "@/lib/site"

export function StructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteStructuredData()).replace(/</g, "\\u003c") }} />
}
