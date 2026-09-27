"use client"

import styles from "./site.module.css"

export function PrintButton() {
  return <button className={styles.button} type="button" onClick={() => window.print()}>Print / save as PDF</button>
}
