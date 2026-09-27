import { Availability, Learning, ProfileIntro, ReadablePage, Skills } from "@/components/site/profile"
import { StructuredData } from "@/components/site/structured-data"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata("/about")

export default function AboutPage() {
  return <ReadablePage><StructuredData /><ProfileIntro /><Skills /><Learning /><Availability /></ReadablePage>
}
