"use client"

import type { ReactNode } from "react"

/** Scrollable page body used by most content apps. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`os-scroll h-full overflow-y-auto px-7 py-6 ${className}`}>{children}</div>
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--os-fg)" }}>
        {title}
      </h1>
      {sub && (
        <p className="mt-1 text-[13px]" style={{ color: "var(--os-muted)" }}>
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
      className={`rounded-lg ${className}`}
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
      className="flex items-center gap-3 px-4 py-3 [&:not(:last-child)]:border-b"
      style={{ borderColor: "var(--os-border)" }}
    >
      {icon && <span style={{ color: "var(--os-muted)" }}>{icon}</span>}
      <span className="text-[13px]" style={{ color: "var(--os-fg)" }}>
        {label}
      </span>
      <span className="ml-auto truncate text-[13px]" style={{ color: "var(--os-muted)" }}>
        {value}
      </span>
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
      className="rounded-md px-4 py-[7px] text-[13px] font-medium transition-all active:scale-[.98]"
      style={{
        background: accent ? "var(--os-accent)" : "var(--os-card)",
        color: accent ? "#fff" : "var(--os-fg)",
        border: `1px solid ${accent ? "transparent" : "var(--os-border)"}`,
      }}
    >
      {children}
    </button>
  )
}
