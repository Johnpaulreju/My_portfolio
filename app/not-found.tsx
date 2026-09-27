import Link from "next/link"
import { ReadablePage } from "@/components/site/profile"
import styles from "@/components/site/site.module.css"

export default function NotFound() {
  return (
    <ReadablePage>
      <p className={styles.eyebrow}>404 · Page not found</p>
      <h1>This page took a wrong turn.</h1>
      <p>Let’s go home. The code probably forgot its map.</p>
      <div className={styles.actions}><Link href="/">Back to Portfolio OS</Link><Link href="/about">Read about Johnpaul</Link></div>
    </ReadablePage>
  )
}
