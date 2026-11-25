import { Availability, Learning, ProfileIntro, ReadablePage, SelectedWork, Skills } from "@/components/site/profile"
import { StructuredData } from "@/components/site/structured-data"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata("/about")

export default function AboutPage() {
  return <ReadablePage><StructuredData /><ProfileIntro /><SelectedWork /><Skills /><Learning /><Availability /></ReadablePage>
}
