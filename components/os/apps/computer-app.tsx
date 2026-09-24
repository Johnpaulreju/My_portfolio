"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  AppWindow, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, Clock3, Copy, Cpu,
  Download, FileArchive, FileText, FileType2, Film, Folder, Gauge, HardDrive, House,
  Image as ImageIcon, Images, Info, LayoutGrid, List as ListIcon, MemoryStick, Monitor,
  Music2, Network, RefreshCw, Search, ShieldAlert, Wifi, WifiOff, type LucideIcon,
} from "lucide-react"

import { AppIcon } from "@/components/os/app-icon"
import { ALL_APPS } from "@/lib/os/app-meta"
import { PROFILE, PROJECTS, TIMELINE } from "@/lib/os/content"
import { useFS } from "@/lib/os/fs-store"
import { useNotify } from "@/lib/os/notify-store"
import { playSfx, type SfxName } from "@/lib/os/sfx"
import { useSystem } from "@/lib/os/system-store"
import type { FSNode, WindowInstance } from "@/lib/os/types"
import { useWM } from "@/lib/os/wm-store"
import { Card, Row } from "./kit"

/* ------------------------------------------------------------------ model */

const DEVICE_NAME = "PORTFOLIO-PC"
/** Session start, used for the ticking "Up time" row on the About page. */
const BOOT_AT = Date.now()
/** Stable fallback so an empty filesystem still prints a sensible install date. */
const EPOCH = 1_700_000_000_000

type ShellKey = "documents" | "downloads" | "pictures" | "music" | "videos"

type Route =
  | { view: "home" }
  | { view: "gallery" }
  | { view: "pc" }
  | { view: "system" }
  | { view: "network" }
  | { view: "programs" }
  | { view: "shell"; key: ShellKey }
  | { view: "fs"; id: string | null }
  | { view: "drive"; id: "C" | "P"; cat?: string | null }

type Crumb = { label: string; route: Route }

/** One row / tile in any listing view. Everything navigable funnels through this. */
type Item = {
  id: string
  name: string
  sub?: string
  type: string
  size?: string
  modified?: number
  glyph: ReactNode
  onOpen: () => void
}

const SHELL: Record<ShellKey, { label: string; icon: LucideIcon; blurb: string }> = {
  documents: { label: "Documents", icon: FileText, blurb: "Every text and doc file on this PC, wherever it lives." },
  downloads: { label: "Downloads", icon: Download, blurb: "Three things that arrived with the machine." },
  pictures: { label: "Pictures", icon: ImageIcon, blurb: "One frame, grabbed from the intro reel." },
  music: { label: "Music", icon: Music2, blurb: "The system sounds. Double-click one and it really plays." },
  videos: { label: "Videos", icon: Film, blurb: "Playable in the Media Player app." },
}

const SHELL_ORDER: ShellKey[] = ["documents", "downloads", "pictures", "music", "videos"]

const SOUNDS: { key: SfxName; name: string; note: string }[] = [
  { key: "boot", name: "Startup.mp3", note: "Plays while the desktop boots" },
  { key: "unlock", name: "Unlock.mp3", note: "Sign-in chime" },
  { key: "notify", name: "Notification.mp3", note: "Toast arrival" },
  { key: "device-connect", name: "Device Connect.mp3", note: "Hardware attached" },
  { key: "device-disconnect", name: "Device Disconnect.mp3", note: "Hardware removed" },
  { key: "recycle", name: "Recycle.mp3", note: "Something hits the bin" },
  { key: "error", name: "Error.mp3", note: "Refused write, denied folder" },
  { key: "shutdown", name: "Shutdown.mp3", note: "Lights out" },
]

/* -------------------------------------------------------------- formatting */

function fmtGB(v: number) {
  return v >= 100 ? v.toFixed(0) : v.toFixed(1)
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

/** UTC on purpose: the server and the browser must agree, or hydration complains. */
function fmtDate(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`
}

function fmtDateTime(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${fmtDate(ms)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function fmtUptime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const p = (n: number) => String(n).padStart(2, "0")
  return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}`
}

/* ------------------------------------------------------------------ pieces */

function Tile({ icon: Icon, size = 40 }: { icon: LucideIcon; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.24),
        background: "var(--os-accent-soft)",
        border: "1px solid var(--os-border)",
      }}
    >
      <Icon size={Math.round(size * 0.52)} strokeWidth={1.75} style={{ color: "var(--os-accent)" }} />
    </span>
  )
}

function Thumb({ src, alt, width = 40 }: { src: string; alt: string; width?: number }) {
  return (
    <span
      className="grid shrink-0 overflow-hidden"
      style={{
        width,
        height: Math.round(width * 0.62),
        borderRadius: 8,
        background: "var(--os-hover)",
        border: "1px solid var(--os-border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="h-full w-full object-cover" />
    </span>
  )
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
        {children}
      </h2>
      {hint && (
        <span className="text-[11.5px]" style={{ color: "var(--os-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  )
}

function ToolButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)] disabled:opacity-35"
      style={{ color: "var(--os-fg)", background: active ? "var(--os-active)" : "transparent" }}
    >
      {children}
    </button>
  )
}

function ActionButton({
  children,
  onClick,
  accent,
}: {
  children: ReactNode
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-[6px] text-[12.5px] font-medium transition-all active:scale-[.98]"
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

function CapacityBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min(100, Math.max(1, Math.round((used / total) * 100)))
  const low = pct >= 90
  return (
    <span className="block h-[6px] overflow-hidden rounded-full" style={{ background: "var(--os-hover)" }}>
      <span
        className="block h-full rounded-full"
        style={{
          width: `${pct}%`,
          background: low ? "var(--os-danger)" : "var(--os-accent)",
          transition: "width .7s cubic-bezier(.22,1,.36,1)",
        }}
      />
    </span>
  )
}

type Drive = { id: "C" | "P"; label: string; total: number; used: number; note: string }

function DriveTile({
  drive,
  selected,
  onSelect,
  onOpen,
}: {
  drive: Drive
  selected: boolean
  onSelect: () => void
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          onOpen()
        }
      }}
      className="flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors"
      style={{
        background: selected ? "var(--os-active)" : "var(--os-card)",
        border: `1px solid ${selected ? "var(--os-accent)" : "var(--os-border)"}`,
      }}
    >
      <Tile icon={HardDrive} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium" style={{ color: "var(--os-fg)" }}>
          {drive.label}
        </span>
        <span className="mt-2 block">
          <CapacityBar used={drive.used} total={drive.total} />
        </span>
        <span className="mt-1.5 block text-[11.5px] tabular-nums" style={{ color: "var(--os-muted)" }}>
          {fmtGB(drive.total - drive.used)} GB free of {drive.total} GB
        </span>
      </span>
    </button>
  )
}

/* ----------------------------------------------------------------- listing */

function Listing({
  items,
  density,
  cell,
  selected,
  onSelect,
  empty,
}: {
  items: Item[]
  density: "grid" | "details"
  cell: number
  selected: string | null
  onSelect: (id: string) => void
  empty: string
}) {
  if (items.length === 0) {
    return (
      <p className="py-14 text-center text-[13px]" style={{ color: "var(--os-muted)" }}>
        {empty}
      </p>
    )
  }

  if (density === "details") {
    return (
      <div>
        <div
          className="flex items-center gap-3 border-b px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide"
          style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
        >
          <span className="min-w-0 flex-1">Name</span>
          <span className="hidden w-[132px] shrink-0 lg:block">Date modified</span>
          <span className="hidden w-[150px] shrink-0 md:block">Type</span>
          <span className="hidden w-[86px] shrink-0 text-right sm:block">Size</span>
        </div>
        {items.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            onDoubleClick={it.onOpen}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                it.onOpen()
              }
            }}
            className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
              selected === it.id ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"
            }`}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="grid h-[22px] w-[22px] shrink-0 place-items-center">
                <span className="scale-[.55] origin-center">{it.glyph}</span>
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
                  {it.name}
                </span>
                {it.sub && (
                  <span className="block truncate text-[11px]" style={{ color: "var(--os-muted)" }}>
                    {it.sub}
                  </span>
                )}
              </span>
            </span>
            <span
              className="hidden w-[132px] shrink-0 truncate text-[11.5px] tabular-nums lg:block"
              style={{ color: "var(--os-muted)" }}
            >
              {it.modified ? fmtDateTime(it.modified) : "—"}
            </span>
            <span
              className="hidden w-[150px] shrink-0 truncate text-[11.5px] md:block"
              style={{ color: "var(--os-muted)" }}
            >
              {it.type}
            </span>
            <span
              className="hidden w-[86px] shrink-0 truncate text-right text-[11.5px] tabular-nums sm:block"
              style={{ color: "var(--os-muted)" }}
            >
              {it.size ?? ""}
            </span>
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cell}px, 1fr))` }}>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onSelect(it.id)}
          onDoubleClick={it.onOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              it.onOpen()
            }
          }}
          className={`flex flex-col items-center gap-2 rounded-md p-2.5 transition-colors ${
            selected === it.id
              ? "bg-[var(--os-active)] ring-1 ring-[var(--os-accent)]"
              : "hover:bg-[var(--os-hover)]"
          }`}
        >
          {it.glyph}
          <span
            className="line-clamp-2 w-full break-words text-center text-[11.5px] leading-tight"
            style={{ color: "var(--os-fg)" }}
          >
            {it.name}
          </span>
          {it.sub && (
            <span className="line-clamp-1 w-full break-words text-center text-[10.5px]" style={{ color: "var(--os-muted)" }}>
              {it.sub}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- app */

export function ComputerApp({ win }: { win: WindowInstance }) {
  const nodes = useFS((s) => s.nodes)
  const hydrate = useFS((s) => s.hydrate)
  const openWin = useWM((s) => s.open)
  const setTitle = useWM((s) => s.setTitle)
  const push = useNotify((s) => s.push)
  const conn = useSystem((s) => s.conn)
  const ssid = useSystem((s) => s.ssid)
  const wifiOn = useSystem((s) => s.wifiOn)
  const setWifi = useSystem((s) => s.setWifi)

  const [route, setRoute] = useState<Route>(() => {
    const folderId = win.payload?.folderId
    if (typeof folderId === "string") return { view: "fs", id: folderId }
    const section = win.payload?.section
    if (section === "system") return { view: "system" }
    if (section === "desktop") return { view: "fs", id: null }
    if (section === "pc") return { view: "pc" }
    return { view: "home" }
  })
  const [past, setPast] = useState<Route[]>([])
  const [future, setFuture] = useState<Route[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [density, setDensity] = useState<"grid" | "details">("grid")
  const [query, setQuery] = useState("")
  const [copied, setCopied] = useState(false)
  const [uptimeMs, setUptimeMs] = useState(0)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])

  /* ------------------------------------------------------------ navigation */

  const go = useCallback(
    (r: Route) => {
      setPast((p) => [...p, route])
      setFuture([])
      setRoute(r)
      setSelected(null)
      setQuery("")
    },
    [route],
  )

  const back = useCallback(() => {
    if (past.length === 0) return
    setRoute(past[past.length - 1])
    setPast(past.slice(0, -1))
    setFuture([route, ...future])
    setSelected(null)
  }, [past, future, route])

  const forward = useCallback(() => {
    if (future.length === 0) return
    setRoute(future[0])
    setFuture(future.slice(1))
    setPast([...past, route])
    setSelected(null)
  }, [past, future, route])

  const crumbs = useMemo<Crumb[]>(() => {
    const home: Crumb = { label: "Home", route: { view: "home" } }
    const pc: Crumb = { label: "This PC", route: { view: "pc" } }
    switch (route.view) {
      case "home":
        return [home]
      case "gallery":
        return [home, { label: "Gallery", route: { view: "gallery" } }]
      case "pc":
        return [home, pc]
      case "system":
        return [home, pc, { label: "About this PC", route: { view: "system" } }]
      case "network":
        return [home, { label: "Network", route: { view: "network" } }]
      case "programs":
        return [
          home,
          pc,
          { label: "Local Disk (C:)", route: { view: "drive", id: "C" } },
          { label: "Program Files", route: { view: "programs" } },
        ]
      case "shell":
        return [home, pc, { label: SHELL[route.key].label, route }]
      case "drive": {
        const trail: Crumb[] = [
          home,
          pc,
          {
            label: route.id === "C" ? "Local Disk (C:)" : "Portfolio (P:)",
            route: { view: "drive", id: route.id },
          },
        ]
        if (route.id === "P" && route.cat) trail.push({ label: route.cat, route })
        return trail
      }
      case "fs": {
        const trail: Crumb[] = [home, pc, { label: "Desktop", route: { view: "fs", id: null } }]
        const chain: FSNode[] = []
        let cur = route.id ? byId.get(route.id) : undefined
        while (cur) {
          chain.unshift(cur)
          cur = cur.parentId ? byId.get(cur.parentId) : undefined
        }
        for (const n of chain) trail.push({ label: n.name, route: { view: "fs", id: n.id } })
        return trail
      }
    }
  }, [route, byId])

  const here = crumbs[crumbs.length - 1]
  const upTo = crumbs.length > 1 ? crumbs[crumbs.length - 2].route : null

  useEffect(() => {
    setTitle(win.id, here.label === "Home" ? "This PC" : `${here.label} — This PC`)
  }, [here.label, setTitle, win.id])

  useEffect(() => {
    const update = () => setUptimeMs(Date.now() - BOOT_AT)
    update()
    if (route.view !== "system") return
    const t = window.setInterval(update, 1000)
    return () => window.clearInterval(t)
  }, [route.view])

  /* ----------------------------------------------------------- live numbers */

  const stats = useMemo(() => {
    const alive = nodes.filter((n) => !n.deletedAt)
    const chars = alive.reduce((t, n) => t + (n.body?.length ?? 0), 0)
    const oldest = alive.reduce((t, n) => Math.min(t, n.createdAt), Number.MAX_SAFE_INTEGER)
    return {
      alive,
      chars,
      binned: nodes.length - alive.length,
      installedOn: alive.length ? oldest : EPOCH,
    }
  }, [nodes])

  const drives = useMemo<Drive[]>(() => {
    const cUsed = Math.min(512, stats.alive.length * 3.2 + stats.chars * 0.001 + PROJECTS.length * 12)
    const pUsed = Math.min(128, PROJECTS.length * 9 + TIMELINE.length * 2)
    return [
      {
        id: "C",
        label: "Local Disk (C:)",
        total: 512,
        used: cUsed,
        note: `3.2 GB per file or folder on this desktop (${stats.alive.length}), 1 MB per character inside them (${stats.chars.toLocaleString("en-US")}), 12 GB per shipped project (${PROJECTS.length}).`,
      },
      {
        id: "P",
        label: "Portfolio (P:)",
        total: 128,
        used: pUsed,
        note: `9 GB per shipped project (${PROJECTS.length}) and 2 GB per chapter of the timeline (${TIMELINE.length}). Nearly full, which is the point.`,
      },
    ]
  }, [stats])

  /* --------------------------------------------------------------- opening */

  const openNode = useCallback(
    (n: FSNode) => {
      if (n.kind === "folder") {
        go({ view: "fs", id: n.id })
        return
      }
      if (n.kind === "video") {
        openWin("player", { fileId: n.id }, n.name)
        return
      }
      if (n.kind === "doc") {
        openWin("docs", { fileId: n.id }, `${n.name} — JP's Docs`)
        return
      }
      if (n.kind === "app-link" && n.appId) {
        openWin(n.appId)
        return
      }
      if (n.kind === "zip") {
        push({
          appId: "computer",
          source: "Compressed folder",
          title: `${n.name} stays sealed`,
          body: "Restore it from the Recycle Bin to get the contents back.",
          sound: "error",
        })
        return
      }
      openWin("notepad", { fileId: n.id }, `${n.name} — Notepad`)
    },
    [go, openWin, push],
  )

  const denied = useCallback(
    (what: string, why: string) => {
      push({ appId: "computer", source: DEVICE_NAME, title: what, body: why, sound: "error" })
    },
    [push],
  )

  const glyphFor = useCallback((n: FSNode) => {
    if (n.kind === "folder") return <Tile icon={Folder} />
    if (n.kind === "video") return <Tile icon={Film} />
    if (n.kind === "doc") return <Tile icon={FileType2} />
    if (n.kind === "zip") return <Tile icon={FileArchive} />
    if (n.kind === "app-link") return <Tile icon={AppWindow} />
    return <Tile icon={FileText} />
  }, [])

  const sizeOf = useCallback((n: FSNode) => {
    if (n.kind === "folder") return undefined
    if (n.kind === "video") return "18.4 MB"
    if (n.kind === "zip") return fmtBytes((n.zipOf?.length ?? 0) * 1_200)
    if (n.kind === "app-link") return undefined
    return fmtBytes(n.body?.length ?? 0)
  }, [])

  const typeOf = useCallback((n: FSNode) => {
    if (n.kind === "folder") return "File folder"
    if (n.kind === "video") return "MP4 video"
    if (n.kind === "doc") return "JP document"
    if (n.kind === "zip") return "Compressed folder"
    if (n.kind === "app-link") return "Shortcut"
    return "Text document"
  }, [])

  const fsItem = useCallback(
    (n: FSNode, withPath = false): Item => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      return {
        id: n.id,
        name: n.name,
        sub: withPath ? (parent ? `in ${parent.name}` : "on Desktop") : undefined,
        type: typeOf(n),
        size: sizeOf(n),
        modified: n.modifiedAt,
        glyph: glyphFor(n),
        onOpen: () => openNode(n),
      }
    },
    [byId, glyphFor, openNode, sizeOf, typeOf],
  )

  const introVideoId = useMemo(
    () => stats.alive.find((n) => n.kind === "video")?.id,
    [stats.alive],
  )

  const playIntro = useCallback(() => {
    if (introVideoId) openWin("player", { fileId: introVideoId }, "Meet Johnpaul.mp4")
    else openWin("player")
  }, [introVideoId, openWin])

  /* ----------------------------------------------------------------- items */

  const items = useMemo<Item[]>(() => {
    switch (route.view) {
      case "fs":
        return stats.alive
          .filter((n) => n.parentId === route.id)
          .sort((a, b) => {
            if (a.kind === "folder" && b.kind !== "folder") return -1
            if (b.kind === "folder" && a.kind !== "folder") return 1
            return a.name.localeCompare(b.name)
          })
          .map((n) => fsItem(n))

      case "shell": {
        if (route.key === "documents")
          return stats.alive.filter((n) => n.kind === "text" || n.kind === "doc").map((n) => fsItem(n, true))
        if (route.key === "videos") return stats.alive.filter((n) => n.kind === "video").map((n) => fsItem(n))
        if (route.key === "music")
          return SOUNDS.map((s) => ({
            id: `snd-${s.key}`,
            name: s.name,
            sub: s.note,
            type: "MP3 audio",
            size: "—",
            glyph: <Tile icon={Music2} />,
            onOpen: () => playSfx(s.key),
          }))
        if (route.key === "pictures")
          return [
            {
              id: "pic-poster",
              name: "intro-poster.jpg",
              sub: "1280 × 720",
              type: "JPG image",
              size: "96.0 KB",
              glyph: <Thumb src="/media/intro-poster.jpg" alt="Frame from the intro video" width={72} />,
              onOpen: playIntro,
            },
          ]
        return [
          {
            id: "dl-resume",
            name: "Resume.pdf",
            sub: `${PROFILE.name} — ${PROFILE.title}`,
            type: "PDF document",
            size: "318 KB",
            glyph: <Tile icon={FileText} />,
            onOpen: () => openWin("resume"),
          },
          {
            id: "dl-archive",
            name: "portfolio-projects.zip",
            sub: `${PROJECTS.length} projects, unextracted`,
            type: "Compressed folder",
            size: "104 MB",
            glyph: <Tile icon={FileArchive} />,
            onOpen: () => openWin("projects"),
          },
          {
            id: "dl-setup",
            name: "PortfolioOS-11-Setup.exe",
            sub: "Downloaded once, never run",
            type: "Application",
            size: "4.61 GB",
            glyph: <Tile icon={AppWindow} />,
            onOpen: () =>
              push({
                appId: "computer",
                source: "Downloads",
                title: "Portfolio OS 11 is already installed",
                body: "You are looking at it. Nothing to do here.",
                sound: "notify",
              }),
          },
        ]
      }

      case "programs":
        return [...ALL_APPS]
          .sort((a, b) => a.title.localeCompare(b.title))
          .map((a) => ({
            id: `prog-${a.id}`,
            name: a.title,
            sub: a.short,
            type: "Application",
            size: `${(a.title.length * 6.4 + 12).toFixed(1)} MB`,
            glyph: <AppIcon appId={a.id} size={40} />,
            onOpen: () => openWin(a.id),
          }))

      case "drive": {
        if (route.id === "C")
          return [
            {
              id: "c-users",
              name: "Users",
              sub: "johnpaul",
              type: "File folder",
              glyph: <Tile icon={Folder} />,
              onOpen: () => go({ view: "fs", id: null }),
            },
            {
              id: "c-programs",
              name: "Program Files",
              sub: `${ALL_APPS.length} applications`,
              type: "File folder",
              glyph: <Tile icon={Folder} />,
              onOpen: () => go({ view: "programs" }),
            },
            {
              id: "c-windows",
              name: "Windows",
              sub: "System files",
              type: "File folder",
              glyph: <Tile icon={ShieldAlert} />,
              onOpen: () =>
                denied(
                  "Access is denied",
                  `You need permission from ${DEVICE_NAME}\\Administrator to open this folder.`,
                ),
            },
          ]
        const cats = Array.from(new Set(PROJECTS.map((p) => p.category)))
        if (!route.cat)
          return cats.map((c) => ({
            id: `p-${c}`,
            name: c,
            sub: `${PROJECTS.filter((p) => p.category === c).length} projects`,
            type: "File folder",
            glyph: <Tile icon={Folder} />,
            onOpen: () => go({ view: "drive", id: "P", cat: c }),
          }))
        return PROJECTS.filter((p) => p.category === route.cat).map((p) => ({
          id: `proj-${p.id}`,
          name: `${p.title}.proj`,
          sub: p.stack,
          type: p.category,
          size: `${(p.desc.length * 1.7 + 40).toFixed(1)} MB`,
          glyph: <Tile icon={FileType2} />,
          onOpen: () => openWin("projects", { projectId: p.id }),
        }))
      }

      case "gallery": {
        const media: Item[] = stats.alive
          .filter((n) => n.kind === "video")
          .map((n) => ({
            id: n.id,
            name: n.name,
            sub: "20 s · 1280 × 720",
            type: "MP4 video",
            size: "18.4 MB",
            modified: n.modifiedAt,
            glyph: <Thumb src="/media/intro-poster.jpg" alt={n.name} width={148} />,
            onOpen: () => openWin("player", { fileId: n.id }, n.name),
          }))
        media.push({
          id: "gal-poster",
          name: "intro-poster.jpg",
          sub: "Cover frame",
          type: "JPG image",
          size: "96.0 KB",
          glyph: <Thumb src="/media/intro-poster.jpg" alt="Cover frame" width={148} />,
          onOpen: playIntro,
        })
        return media
      }

      case "network": {
        if (conn !== "connected") return []
        return [
          {
            id: "net-pc",
            name: DEVICE_NAME,
            sub: "This device",
            type: "Computer",
            glyph: <Tile icon={Monitor} />,
            onOpen: () => go({ view: "pc" }),
          },
          {
            id: "net-phone",
            name: "JP-PHONE",
            sub: "Media device",
            type: "Phone",
            glyph: <Tile icon={AppWindow} />,
            onOpen: () =>
              denied("JP-PHONE is not accessible", "The device is paired but sharing is switched off."),
          },
          {
            id: "net-tv",
            name: "LIVING-ROOM-TV",
            sub: "Media renderer",
            type: "Display",
            glyph: <Tile icon={Monitor} />,
            onOpen: () =>
              push({
                appId: "computer",
                source: "Network",
                title: "Casting is not supported",
                body: "Open the video in the Media Player instead.",
                sound: "notify",
              }),
          },
        ]
      }

      default:
        return []
    }
  }, [route, stats, fsItem, openWin, push, go, denied, playIntro, conn])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sub ?? "").toLowerCase().includes(q))
  }, [items, query])

  const isListing =
    route.view === "fs" ||
    route.view === "shell" ||
    route.view === "programs" ||
    route.view === "drive" ||
    route.view === "gallery" ||
    route.view === "network"

  const selectedItem = filtered.find((i) => i.id === selected) ?? null

  const statusLeft = route.view === "network" && conn !== "connected"
    ? "Network discovery is off"
    : isListing
    ? `${filtered.length} item${filtered.length === 1 ? "" : "s"}${
        query.trim() ? ` of ${items.length}` : ""
      }`
    : route.view === "pc"
      ? "8 items"
      : route.view === "system"
        ? `${DEVICE_NAME} · up ${fmtUptime(uptimeMs)}`
        : `${stats.alive.length} items on this PC · ${stats.binned} in the Recycle Bin`

  const specText = useMemo(
    () =>
      [
        `Device name        ${DEVICE_NAME}`,
        `Owner              ${PROFILE.name}`,
        `Processor          AI Engineer @ 3.2GHz`,
        `Installed RAM      16.0 GB (11.4 GB usable)`,
        `System type        64-bit operating system, x64-based processor`,
        `Edition            Portfolio OS 11 Pro`,
        `Version            24H2`,
        `Installed on       ${fmtDate(stats.installedOn)}`,
        `Contact            ${PROFILE.email}`,
      ].join("\n"),
    [stats.installedOn],
  )

  const copySpecs = useCallback(() => {
    try {
      void navigator.clipboard?.writeText(specText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      denied("Copy failed", "This browser would not hand over the clipboard.")
    }
  }, [specText, denied])

  /* ------------------------------------------------------------------- nav */

  const navActive = (r: Route) => {
    if (r.view !== route.view) return false
    if (r.view === "shell" && route.view === "shell") return r.key === route.key
    if (r.view === "fs" && route.view === "fs") return route.id === null && r.id === null
    if (r.view === "drive" && route.view === "drive") return r.id === route.id
    return true
  }

  const nav = (icon: LucideIcon, label: string, to: Route, indent?: boolean) => (
    <NavItem
      key={label}
      icon={icon}
      label={label}
      indent={indent}
      active={navActive(to)}
      onGo={() => go(to)}
    />
  )

  /* ------------------------------------------------------------------ view */

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Command bar */}
      <div
        className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5"
        style={{ borderColor: "var(--os-border)" }}
      >
        <ToolButton label="Back" onClick={back} disabled={past.length === 0}>
          <ArrowLeft size={15} />
        </ToolButton>
        <ToolButton label="Forward" onClick={forward} disabled={future.length === 0}>
          <ArrowRight size={15} />
        </ToolButton>
        <ToolButton label="Up" onClick={() => upTo && go(upTo)} disabled={!upTo}>
          <ArrowUp size={15} />
        </ToolButton>
        <ToolButton label="Refresh" onClick={() => setSelected(null)}>
          <RefreshCw size={14} />
        </ToolButton>

        {/* Address bar */}
        <div
          className="os-scroll mx-1 flex min-w-[140px] flex-1 items-center gap-1 overflow-x-auto rounded-md px-2.5 py-1.5 text-[12.5px]"
          style={{ background: "var(--os-input)", border: "1px solid var(--os-border)", color: "var(--os-fg)" }}
        >
          <Monitor size={13} className="shrink-0" style={{ color: "var(--os-muted)" }} />
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex shrink-0 items-center gap-1">
              {i > 0 && <ChevronRight size={12} style={{ color: "var(--os-muted)" }} />}
              <button
                type="button"
                className="shrink-0 rounded px-0.5 hover:underline"
                onClick={() => go(c.route)}
              >
                {c.label}
              </button>
            </span>
          ))}
        </div>

        {isListing && (
          <div
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5"
            style={{ background: "var(--os-input)", border: "1px solid var(--os-border)" }}
          >
            <Search size={13} style={{ color: "var(--os-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={`Search ${here.label}`}
              className="w-[120px] bg-transparent text-[12.5px] outline-none placeholder:opacity-60"
              style={{ color: "var(--os-fg)" }}
            />
          </div>
        )}

        <span className="mx-0.5 h-5 w-px" style={{ background: "var(--os-border)" }} />
        <ToolButton label="Large icons" onClick={() => setDensity("grid")} active={density === "grid"}>
          <LayoutGrid size={15} />
        </ToolButton>
        <ToolButton label="Details" onClick={() => setDensity("details")} active={density === "details"}>
          <ListIcon size={15} />
        </ToolButton>
        <ToolButton label="About this PC" onClick={() => go({ view: "system" })}>
          <Info size={15} />
        </ToolButton>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Navigation pane */}
        <aside
          className="os-scroll hidden w-[196px] shrink-0 overflow-y-auto border-r p-2 sm:block"
          style={{ borderColor: "var(--os-border)", background: "var(--os-card)" }}
        >
          {nav(House, "Home", { view: "home" })}
          {nav(Images, "Gallery", { view: "gallery" })}
          <div className="my-1.5 h-px" style={{ background: "var(--os-border)" }} />
          {nav(Monitor, "Desktop", { view: "fs", id: null })}
          {SHELL_ORDER.map((k) => nav(SHELL[k].icon, SHELL[k].label, { view: "shell", key: k }))}
          <div className="my-1.5 h-px" style={{ background: "var(--os-border)" }} />
          {nav(HardDrive, "This PC", { view: "pc" })}
          {nav(HardDrive, "Local Disk (C:)", { view: "drive", id: "C" }, true)}
          {nav(HardDrive, "Portfolio (P:)", { view: "drive", id: "P", cat: null }, true)}
          {nav(Network, "Network", { view: "network" })}
        </aside>

        {/* Content */}
        <main
          className="os-scroll min-h-0 flex-1 overflow-y-auto p-4"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null)
          }}
        >
          {route.view === "home" && (
            <HomeView
              stats={stats}
              drives={drives}
              go={go}
              openNode={openNode}
              uptimeMs={uptimeMs}
            />
          )}

          {route.view === "pc" && (
            <PCView drives={drives} go={go} selected={selected} onSelect={setSelected} />
          )}

          {route.view === "system" && (
            <SystemView
              installedOn={stats.installedOn}
              nodeCount={stats.alive.length}
              uptimeMs={uptimeMs}
              copied={copied}
              onCopy={copySpecs}
              onRename={() =>
                denied("Rename this PC", "Requires administrator privileges, and there is only one account.")
              }
              onMail={() => openWin("contact")}
            />
          )}

          {route.view === "network" && conn !== "connected" && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <Tile icon={WifiOff} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--os-fg)" }}>
                    Network discovery is turned off
                  </p>
                  <p className="mt-1 text-[12.5px]" style={{ color: "var(--os-muted)" }}>
                    {wifiOn
                      ? "Wi-Fi is on but this PC is not connected to a network. Connect from Quick Settings to see the other devices here."
                      : "Wi-Fi is switched off, so no network computers or devices are visible."}
                  </p>
                  <div className="mt-3">
                    <ActionButton accent onClick={() => setWifi(true)}>
                      Turn on Wi-Fi
                    </ActionButton>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {isListing && (
            <>
              {route.view === "shell" && (
                <SectionTitle hint={SHELL[route.key].blurb}>{SHELL[route.key].label}</SectionTitle>
              )}
              {route.view === "drive" && (
                <DriveHeader drive={drives.find((d) => d.id === route.id) ?? drives[0]} />
              )}
              {route.view === "programs" && (
                <SectionTitle hint="Everything installed on this machine. Double-click to launch it.">
                  Program Files
                </SectionTitle>
              )}
              {route.view === "gallery" && (
                <SectionTitle hint="Everything with a picture in it.">Gallery</SectionTitle>
              )}
              {route.view === "network" && conn === "connected" && (
                <SectionTitle hint={`Connected to ${ssid ?? "a network"}.`}>Network</SectionTitle>
              )}
              {route.view === "fs" && (
                <SectionTitle hint="The real Desktop. Anything you make out there shows up in here.">
                  {here.label}
                </SectionTitle>
              )}
              {(route.view !== "network" || conn === "connected") && (
                <Listing
                  items={filtered}
                  density={route.view === "gallery" ? "grid" : density}
                  cell={route.view === "gallery" ? 168 : 112}
                  selected={selected}
                  onSelect={setSelected}
                  empty={
                    query.trim()
                      ? `No items match “${query.trim()}”.`
                      : "This folder is empty."
                  }
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Status bar */}
      <div
        className="flex shrink-0 items-center gap-2 border-t px-3 py-1.5 text-[11.5px]"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
      >
        <span>{statusLeft}</span>
        {selectedItem && (
          <span className="truncate">
            · 1 item selected{selectedItem.size ? ` · ${selectedItem.size}` : ""} · {selectedItem.name}
          </span>
        )}
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          {conn === "connected" ? <Wifi size={12} /> : <WifiOff size={12} />}
          {conn === "connected" ? (ssid ?? "Connected") : "Offline"}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ panels */

function DriveHeader({ drive }: { drive: Drive }) {
  const pct = Math.min(100, Math.round((drive.used / drive.total) * 100))
  return (
    <Card className="mb-4 p-4">
      <div className="flex flex-wrap items-start gap-4">
        <Tile icon={HardDrive} size={52} />
        <div className="min-w-[220px] flex-1">
          <p className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
            {drive.label}
          </p>
          <div className="mt-2.5">
            <CapacityBar used={drive.used} total={drive.total} />
          </div>
          <p className="mt-2 text-[12px] tabular-nums" style={{ color: "var(--os-muted)" }}>
            {fmtGB(drive.used)} GB used · {fmtGB(drive.total - drive.used)} GB free of {drive.total} GB ({pct}%)
          </p>
        </div>
      </div>
      <p
        className="mt-3 border-t pt-3 text-[11.5px] leading-relaxed"
        style={{ borderColor: "var(--os-border)", color: "var(--os-muted)" }}
      >
        <span style={{ color: "var(--os-fg)" }}>How this number is made up: </span>
        {drive.note} Every figure above is counted live from this desktop — the megabytes are a joke, the
        arithmetic is not.
      </p>
    </Card>
  )
}

function FolderTiles({ go }: { go: (r: Route) => void }) {
  const six: { label: string; icon: LucideIcon; to: Route }[] = [
    { label: "Desktop", icon: Monitor, to: { view: "fs", id: null } },
    ...SHELL_ORDER.map((k) => ({ label: SHELL[k].label, icon: SHELL[k].icon, to: { view: "shell", key: k } as Route })),
  ]
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))" }}>
      {six.map((f) => (
        <button
          key={f.label}
          type="button"
          onClick={() => go(f.to)}
          className="flex items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-[var(--os-hover)]"
          style={{ background: "var(--os-card)", border: "1px solid var(--os-border)" }}
        >
          <Tile icon={f.icon} size={36} />
          <span className="truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
            {f.label}
          </span>
        </button>
      ))}
    </div>
  )
}

function PCView({
  drives,
  go,
  selected,
  onSelect,
}: {
  drives: Drive[]
  go: (r: Route) => void
  selected: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-6">
      <section>
        <SectionTitle hint="The six shell folders, same as the real thing.">Folders</SectionTitle>
        <FolderTiles go={go} />
      </section>
      <section>
        <SectionTitle hint="Capacity is computed from what is actually on this desktop.">
          Devices and drives
        </SectionTitle>
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
          {drives.map((d) => (
            <DriveTile
              key={d.id}
              drive={d}
              selected={selected === `drive-${d.id}`}
              onSelect={() => onSelect(`drive-${d.id}`)}
              onOpen={() => go(d.id === "C" ? { view: "drive", id: "C" } : { view: "drive", id: "P", cat: null })}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

function HomeView({
  stats,
  drives,
  go,
  openNode,
  uptimeMs,
}: {
  stats: { alive: FSNode[]; chars: number; binned: number; installedOn: number }
  drives: Drive[]
  go: (r: Route) => void
  openNode: (n: FSNode) => void
  uptimeMs: number
}) {
  const recent = useMemo(
    () => [...stats.alive].sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 6),
    [stats.alive],
  )
  const c = drives[0]

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle hint="Pinned by default.">Quick access</SectionTitle>
        <FolderTiles go={go} />
      </section>

      <section>
        <SectionTitle>System</SectionTitle>
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Tile icon={Monitor} size={44} />
            <div className="min-w-[180px] flex-1">
              <p className="text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
                {DEVICE_NAME}
              </p>
              <p className="text-[12px]" style={{ color: "var(--os-muted)" }}>
                {PROFILE.name} · {PROFILE.location}
              </p>
            </div>
            <ActionButton onClick={() => go({ view: "system" })}>View all specs</ActionButton>
          </div>
          <div
            className="mt-3.5 grid gap-3 border-t pt-3.5"
            style={{ borderColor: "var(--os-border)", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
          >
            <MiniStat icon={Cpu} label="Processor" value="AI Engineer @ 3.2GHz" />
            <MiniStat icon={MemoryStick} label="Installed RAM" value="16.0 GB (11.4 usable)" />
            <MiniStat
              icon={HardDrive}
              label="Local Disk (C:)"
              value={`${fmtGB(c.total - c.used)} GB free of ${c.total} GB`}
            />
            <MiniStat icon={Gauge} label="Up time" value={fmtUptime(uptimeMs)} />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle hint="Ordered by when you last touched them.">Recent</SectionTitle>
        <Card>
          {recent.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px]" style={{ color: "var(--os-muted)" }}>
              Nothing here yet. Make a file on the Desktop and it will show up.
            </p>
          ) : (
            recent.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNode(n)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--os-hover)] [&:not(:last-child)]:border-b"
                style={{ borderColor: "var(--os-border)" }}
              >
                <Clock3 size={14} style={{ color: "var(--os-muted)" }} />
                <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
                  {n.name}
                </span>
                <span className="shrink-0 text-[11.5px] tabular-nums" style={{ color: "var(--os-muted)" }}>
                  {fmtDate(n.modifiedAt)}
                </span>
              </button>
            ))
          )}
        </Card>
      </section>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: "var(--os-accent)" }} />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--os-muted)" }}>
          {label}
        </p>
        <p className="truncate text-[12.5px]" style={{ color: "var(--os-fg)" }}>
          {value}
        </p>
      </div>
    </div>
  )
}

function SystemView({
  installedOn,
  nodeCount,
  uptimeMs,
  copied,
  onCopy,
  onRename,
  onMail,
}: {
  installedOn: number
  nodeCount: number
  uptimeMs: number
  copied: boolean
  onCopy: () => void
  onRename: () => void
  onMail: () => void
}) {
  const build = 2_600 + nodeCount * 3 + PROJECTS.length

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tile icon={Monitor} size={48} />
          <div className="min-w-[200px] flex-1">
            <p className="text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
              {DEVICE_NAME}
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--os-muted)" }}>
              {PROFILE.name} — {PROFILE.title}
            </p>
          </div>
          <div className="flex gap-2">
            <ActionButton onClick={onRename}>Rename this PC</ActionButton>
            <ActionButton accent onClick={onCopy}>
              <span className="inline-flex items-center gap-1.5">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </span>
            </ActionButton>
          </div>
        </div>
      </Card>

      <section>
        <SectionTitle hint="Reads like Properties, behaves like a portfolio.">Device specifications</SectionTitle>
        <Card>
          <Row icon={<Monitor size={15} />} label="Device name" value={DEVICE_NAME} />
          <Row label="Full device name" value={`${DEVICE_NAME}.reju.local`} />
          <Row label="Owner" value={PROFILE.name} />
          <Row icon={<Cpu size={15} />} label="Processor" value={`AI Engineer @ 3.2GHz, ${PROJECTS.length} cores`} />
          <Row icon={<MemoryStick size={15} />} label="Installed RAM" value="16.0 GB (11.4 GB usable)" />
          <Row label="Device ID" value="JR-2024-0C7A-1B93-AI11" />
          <Row label="Product ID" value="00330-80000-00000-JPR11" />
          <Row label="System type" value="64-bit operating system, x64-based processor" />
          <Row label="Pen and touch" value="Touch support with 10 touch points" />
          <Row label="Region" value={PROFILE.location} />
          <Row
            label="Signed in as"
            value={PROFILE.email}
            action={<ActionButton onClick={onMail}>Mail</ActionButton>}
          />
        </Card>
      </section>

      <section>
        <SectionTitle hint="Same shape as the real About page, none of the same software.">
          Portfolio OS specifications
        </SectionTitle>
        <Card>
          <Row label="Edition" value="Portfolio OS 11 Pro" />
          <Row label="Version" value="24H2" />
          <Row icon={<Clock3 size={15} />} label="Installed on" value={fmtDate(installedOn)} />
          <Row label="OS build" value={`22631.${build}`} />
          <Row label="Experience" value="Portfolio Feature Experience Pack 1000.22700.1.0" />
          <Row icon={<Gauge size={15} />} label="Up time" value={fmtUptime(uptimeMs)} />
        </Card>
        <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          The build number climbs as you create files ({nodeCount} on the disk right now) and the install date is
          the oldest timestamp on this filesystem. Everything else is set dressing — there is no Windows in here,
          only React.
        </p>
      </section>

      <section>
        <SectionTitle>Related</SectionTitle>
        <Card className="p-4">
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            {PROFILE.tagline} Reach the owner at{" "}
            <span style={{ color: "var(--os-fg)" }}>{PROFILE.email}</span> or{" "}
            <span style={{ color: "var(--os-fg)" }}>{PROFILE.phone}</span>.
          </p>
        </Card>
      </section>
    </div>
  )
}

function NavItem({
  icon: Icon,
  label,
  active,
  indent,
  onGo,
}: {
  icon: LucideIcon
  label: string
  active: boolean
  indent?: boolean
  onGo: () => void
}) {
  return (
    <button
      type="button"
      onClick={onGo}
      className={`flex w-full items-center gap-2.5 rounded-md py-[7px] pr-2 text-left text-[12.5px] transition-colors ${
        active ? "bg-[var(--os-active)]" : "hover:bg-[var(--os-hover)]"
      }`}
      style={{ color: "var(--os-fg)", paddingLeft: indent ? 26 : 10 }}
    >
      <Icon size={15} className="shrink-0" style={{ color: "var(--os-accent)" }} />
      <span className="truncate">{label}</span>
    </button>
  )
}
