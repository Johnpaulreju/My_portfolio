"use client"

import { useEffect, useRef, useState } from "react"
import { ACHIEVEMENTS, LAB, PROFILE, PROJECTS, SKILL_GROUPS, TIMELINE } from "@/lib/os/content"
import { useFS } from "@/lib/os/fs-store"
import { useWM } from "@/lib/os/wm-store"
import { ALL_APPS } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"

type Line = { text: string; tone?: "out" | "cmd" | "err" | "accent" }

const BANNER: Line[] = [
  { text: `${PROFILE.name} — portfolio shell`, tone: "accent" },
  { text: `Type "help" to see what's available.`, tone: "out" },
  { text: "", tone: "out" },
]

export function TerminalApp() {
  const [lines, setLines] = useState<Line[]>(BANNER)
  const [input, setInput] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { nodes } = useFS()
  const open = useWM((s) => s.open)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" })
  }, [lines])

  const push = (...ls: Line[]) => setLines((prev) => [...prev, ...ls])

  const run = (raw: string) => {
    const cmd = raw.trim()
    push({ text: `visitor@portfolio:~$ ${cmd}`, tone: "cmd" })
    if (!cmd) return

    const [name, ...args] = cmd.split(/\s+/)
    const arg = args.join(" ")

    switch (name.toLowerCase()) {
      case "help":
        push(
          { text: "Available commands", tone: "accent" },
          ...[
            ["about", "who I am"],
            ["projects", "list every project"],
            ["skills", "proficiency by area"],
            ["experience", "work and education"],
            ["awards", "certifications and wins"],
            ["lab", "what's in progress"],
            ["contact", "how to reach me"],
            ["ls", "list files on the Desktop"],
            ["cat <file>", "print a text file"],
            ["open <app>", "launch an app window"],
            ["date", "current date and time"],
            ["clear", "clear the screen"],
          ].map(([c, d]) => ({ text: `  ${c.padEnd(14)} ${d}`, tone: "out" as const })),
        )
        break

      case "about":
      case "whoami":
        push(
          { text: PROFILE.name, tone: "accent" },
          { text: PROFILE.title },
          { text: PROFILE.tagline },
          { text: `Location: ${PROFILE.location}` },
          ...PROFILE.uvp.map((u) => ({ text: `  · ${u}`, tone: "out" as const })),
        )
        break

      case "projects":
        push(
          { text: `${PROJECTS.length} projects`, tone: "accent" },
          ...PROJECTS.map((p) => ({ text: `  ${p.year}  ${p.title.padEnd(26)} ${p.stack}`, tone: "out" as const })),
        )
        break

      case "skills":
        SKILL_GROUPS.forEach((g) => {
          push({ text: g.label, tone: "accent" })
          g.items.forEach((s) => {
            const filled = Math.round(s.level / 5)
            push({ text: `  ${s.name.padEnd(18)} ${"█".repeat(filled)}${"░".repeat(20 - filled)} ${s.level}%` })
          })
        })
        break

      case "experience":
        TIMELINE.forEach((e) => {
          push({ text: `${e.year}  ${e.label} — ${e.org}`, tone: "accent" })
          e.facts.forEach((f) => push({ text: `       · ${f}` }))
        })
        break

      case "awards":
        push(...ACHIEVEMENTS.map((a) => ({ text: `  🏆 ${a.title} — ${a.detail}`, tone: "out" as const })))
        break

      case "lab":
        push(...LAB.map((l) => ({ text: `  ${l.title} (${l.progress}%) — ${l.note}`, tone: "out" as const })))
        break

      case "contact":
        push(
          { text: `Email:    ${PROFILE.email}`, tone: "accent" },
          { text: `Phone:    ${PROFILE.phone}` },
          { text: `GitHub:   ${PROFILE.github}` },
          { text: `LinkedIn: ${PROFILE.linkedin}` },
        )
        break

      case "ls":
        push(
          ...nodes
            .filter((n) => n.parentId === null)
            .map((n) => ({ text: `  ${n.kind === "folder" ? "📁" : "📄"} ${n.name}`, tone: "out" as const })),
        )
        break

      case "cat": {
        const file = nodes.find((n) => n.name.toLowerCase() === arg.toLowerCase() && n.kind === "text")
        if (!file) push({ text: `cat: ${arg || "(no file)"}: No such file`, tone: "err" })
        else push(...(file.body ?? "").split("\n").map((t) => ({ text: t, tone: "out" as const })))
        break
      }

      case "open": {
        const app = ALL_APPS.find((a) => a.id === arg.toLowerCase() || a.short.toLowerCase() === arg.toLowerCase())
        if (!app) push({ text: `open: unknown app "${arg}". Try: ${ALL_APPS.map((a) => a.id).join(", ")}`, tone: "err" })
        else {
          open(app.id as AppId)
          push({ text: `Launching ${app.title}…` })
        }
        break
      }

      case "date":
        push({ text: new Date().toString() })
        break

      case "clear":
        setLines([])
        return

      default:
        push({ text: `${name}: command not found. Try "help".`, tone: "err" })
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      run(input)
      if (input.trim()) setHistory((h) => [...h, input.trim()])
      setInput("")
      setHistIdx(-1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1)
      if (history[idx] !== undefined) {
        setHistIdx(idx)
        setInput(history[idx])
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (histIdx < 0) return
      const idx = histIdx + 1
      if (idx >= history.length) {
        setHistIdx(-1)
        setInput("")
      } else {
        setHistIdx(idx)
        setInput(history[idx])
      }
    }
  }

  const TONE: Record<string, string> = {
    out: "#d4d4d4",
    cmd: "#7dd3fc",
    err: "#f87171",
    accent: "#4ade80",
  }

  return (
    <div
      className="os-scroll h-full overflow-y-auto bg-[#0c0c0c] p-3 font-mono text-[12.5px] leading-[1.55]"
      onClick={() => inputRef.current?.focus()}
    >
      {lines.map((l, i) => (
        <pre key={i} className="whitespace-pre-wrap break-words" style={{ color: TONE[l.tone ?? "out"] }}>
          {l.text || " "}
        </pre>
      ))}
      <div className="flex items-center gap-2">
        <span style={{ color: "#4ade80" }}>visitor@portfolio:~$</span>
        <input
          ref={inputRef}
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="flex-1 bg-transparent font-mono text-[12.5px] text-[#d4d4d4] outline-none"
        />
      </div>
      <div ref={endRef} />
    </div>
  )
}
