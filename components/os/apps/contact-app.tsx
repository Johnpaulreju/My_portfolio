"use client"

import { useState } from "react"
import { Check, Github, Inbox, Linkedin, Mail, Phone, Send, MapPin } from "lucide-react"
import { PROFILE } from "@/lib/os/content"
import { Button } from "./kit"

export function ContactApp() {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [from, setFrom] = useState("")
  const [sent, setSent] = useState(false)

  // No backend here, so composing hands off to the visitor's own mail client.
  const send = () => {
    const mailto = `mailto:${PROFILE.email}?subject=${encodeURIComponent(
      subject || `Hello from your portfolio`,
    )}&body=${encodeURIComponent(`${body}\n\n— ${from}`)}`
    window.location.href = mailto
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  return (
    <div className="flex h-full min-h-0">
      <aside
        className="hidden w-[176px] shrink-0 border-r p-2 sm:block"
        style={{ borderColor: "var(--os-border)", background: "var(--os-card)" }}
      >
        <div
          className="mb-2 flex items-center gap-2 rounded-md px-2 py-[7px] text-[13px]"
          style={{ background: "var(--os-active)", color: "var(--os-fg)" }}
        >
          <Inbox size={15} />
          New message
        </div>
        {[
          { icon: <Mail size={14} />, label: PROFILE.email, href: `mailto:${PROFILE.email}` },
          { icon: <Phone size={14} />, label: PROFILE.phone, href: `tel:${PROFILE.phone.replace(/\s/g, "")}` },
          { icon: <Github size={14} />, label: "GitHub", href: `https://${PROFILE.github}` },
          { icon: <Linkedin size={14} />, label: "LinkedIn", href: `https://${PROFILE.linkedin}` },
        ].map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.href.startsWith("http") ? "_blank" : undefined}
            rel="noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-[7px] text-[12px] transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-muted)" }}
          >
            <span className="shrink-0">{l.icon}</span>
            <span className="truncate">{l.label}</span>
          </a>
        ))}
        <p className="mt-3 flex items-center gap-2 px-2 text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          <MapPin size={13} /> {PROFILE.location}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5"
          style={{ borderColor: "var(--os-border)" }}
        >
          <Button variant="accent" onClick={send}>
            <span className="flex items-center gap-1.5">
              {sent ? <Check size={14} /> : <Send size={14} />}
              {sent ? "Opening mail app" : "Send"}
            </span>
          </Button>
          <span className="text-[12px]" style={{ color: "var(--os-muted)" }}>
            Opens in your mail app
          </span>
        </div>

        <div className="os-scroll min-h-0 flex-1 overflow-y-auto">
          <Field label="To" value={PROFILE.email} readOnly />
          <Field label="From" value={from} onChange={setFrom} placeholder="your name or email" />
          <Field label="Subject" value={subject} onChange={setSubject} placeholder="What's this about?" />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            className="min-h-[220px] w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-[var(--os-muted)]"
            style={{ color: "var(--os-fg)" }}
          />
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string
  value: string
  onChange?: (v: string) => void
  placeholder?: string
  readOnly?: boolean
}) {
  return (
    <label
      className="flex items-center gap-3 border-b px-4 py-2.5"
      style={{ borderColor: "var(--os-border)" }}
    >
      <span className="w-14 shrink-0 text-[12px]" style={{ color: "var(--os-muted)" }}>
        {label}
      </span>
      <input
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--os-muted)]"
        style={{ color: readOnly ? "var(--os-accent-fg)" : "var(--os-fg)" }}
      />
    </label>
  )
}
