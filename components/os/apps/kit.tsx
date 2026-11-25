"use client"

import type { ReactNode } from "react"
import styles from "./kit.module.css"

/** Scrollable page body used by most content apps. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`os-scroll ${styles.page} ${className}`}>{children}</div>
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className={styles.heading}>
      <h1>
        {title}
      </h1>
      {sub && (
        <p>
          {sub}
        </p>
      )}
    </header>
  )
}

/** The rounded "card" Windows 11 Settings uses for every grouped row. */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`${styles.card} ${className}`}
      style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
    >
      {children}
    </div>
  )
}

export function Row({
  icon,
  label,
  value,
  action,
}: {
  icon?: ReactNode
  label: string
  value?: ReactNode
  action?: ReactNode
}) {
  return (
    <div
      className={styles.row}
    >
      <span className={styles.label}>
        {icon}{label}
      </span>
      {value && <span className={styles.value}>{value}</span>}
      {action}
    </div>
  )
}

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium"
      style={
        tone === "accent"
          ? { background: "color-mix(in srgb, var(--os-accent) 22%, transparent)", color: "var(--os-accent-fg)" }
          : { background: "var(--os-hover)", color: "var(--os-muted)" }
      }
    >
      {children}
    </span>
  )
}

export function Meter({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[140px] shrink-0 truncate text-[13px]" style={{ color: "var(--os-fg)" }}>
        {label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--os-hover)" }}>
        <span
          className="block h-full rounded-full"
          style={{
            width: `${value}%`,
            background: "linear-gradient(90deg, var(--os-accent), color-mix(in srgb, var(--os-accent) 55%, #fff))",
            transition: "width .7s cubic-bezier(.22,1,.36,1)",
          }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-[12px] tabular-nums" style={{ color: "var(--os-muted)" }}>
        {hint ?? `${value}%`}
      </span>
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = "default",
  type = "button",
}: {
  children: ReactNode
  onClick?: () => void
  variant?: "default" | "accent"
  type?: "button" | "submit"
}) {
  const accent = variant === "accent"
  return (
    <button
      type={type}
      onClick={onClick}
      className={styles.button}
      style={{
        background: accent ? "var(--os-accent)" : "var(--os-card)",
        color: accent ? "var(--os-on-accent)" : "var(--os-fg)",
        border: `1px solid ${accent ? "transparent" : "var(--os-border)"}`,
      }}
    >
      {children}
    </button>
  )
}

/** Placeholder for a section that exists but isn't published yet. */
export function ComingSoon({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="os-scroll flex h-full flex-col items-center gap-3 overflow-y-auto px-6 py-5 text-center">
      <span
        className="mt-auto grid h-14 w-14 shrink-0 place-items-center rounded-2xl"
        style={{
          background: "color-mix(in srgb, var(--os-accent) 20%, transparent)",
          color: "var(--os-accent-fg)",
        }}
      >
        {icon}
      </span>
      <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
        {title}
      </h1>
      <p className="max-w-[320px] text-[13px]" style={{ color: "var(--os-muted)" }}>
        {body}
      </p>
      <div className="mb-auto">{children}</div>
    </div>
  )
}
