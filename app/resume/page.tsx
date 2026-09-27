import { Achievements, Experience, PersonalWork, ReadablePage, ResumeProfile, Skills } from "@/components/site/profile"
import { PrintButton } from "@/components/site/print-button"
import styles from "@/components/site/site.module.css"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata("/resume")

export default function ResumePage() {
  return (
    <ReadablePage>
      <article className={styles.resume}>
        <p className={styles.eyebrow}>Resume</p>
        <div className={styles.actions}>
          <PrintButton /><a href="/about.md">Markdown profile</a>
          <p>Print this complete resume, or choose Save as PDF in your browser’s print dialog.</p>
        </div>
        <ResumeProfile />
        <Experience /><Skills showStatus /><PersonalWork /><Achievements />
      </article>
    </ReadablePage>
  )
}
