import { Availability, BlogCard, Learning, ProfileIntro, ReadablePage, SelectedWork, Skills } from "@/components/site/profile"
import { StructuredData } from "@/components/site/structured-data"
import { pageMetadata } from "@/lib/site"
import styles from "@/components/site/site.module.css"

export const metadata = pageMetadata("/about")

export default function AboutPage() {
  return (
    <ReadablePage>
      <StructuredData />
      <div className={styles.profileLead}>
        <div><ProfileIntro /></div>
        <BlogCard />
      </div>
      <SelectedWork /><Skills /><Learning /><Availability />
    </ReadablePage>
  )
}
