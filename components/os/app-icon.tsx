"use client"

import { useState } from "react"
import {
  Activity, AlarmClock, Bike, Bomb, Briefcase, Camera, Cloud, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound, type LucideIcon,
} from "lucide-react"
import { APP_META } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"
import { brandIcon } from "@/lib/os/brand-icons"

const ICONS: Record<string, LucideIcon> = {
  Activity, AlarmClock, Bike, Bomb, Briefcase, Camera, Cloud, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound,
}

function IconImage({ appId, size }: { appId: AppId; size: number }) {
  const [stage, setStage] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const asset = brandIcon(appId)
  const src = stage === 0 ? asset.remote : stage === 1 ? asset.local : null
  const Icon = iconFor(appId)

  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      {/* Keep a real glyph visible while loading, offline, or after both images fail. */}
      <Icon size={size} strokeWidth={2} className="text-white drop-shadow" style={{ visibility: loaded ? "hidden" : "visible" }} />
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- exact pinned SVG, with explicit error recovery
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden="true"
          width={size}
          height={size}
          draggable={false}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => { setLoaded(false); setStage(stage + 1) }}
          className="pointer-events-none absolute inset-0 object-contain drop-shadow"
          style={{ opacity: loaded ? 1 : 0, filter: "brightness(0) invert(1)" }}
        />
      )}
    </span>
  )
}

/** Colored OS tiles with remote → bundled → Lucide recovery. Parents provide labels. */
export function AppIcon({ appId, size = 40, className = "" }: { appId: AppId; size?: number; className?: string }) {
  const meta = APP_META[appId]
  const radius = Math.round(size * 0.235)
  return (
    <span
      aria-hidden="true"
      className={`relative inline-grid shrink-0 place-items-center shadow-sm ring-1 ring-white/25 ${className}`}
      style={{ width: size, height: size, borderRadius: radius, backgroundImage: `linear-gradient(145deg, ${meta.tint[0]}, ${meta.tint[1]})` }}
    >
      <span className="pointer-events-none absolute inset-0" style={{ borderRadius: radius, backgroundImage: "linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 55%)" }} />
      <IconImage key={appId} appId={appId} size={Math.round(size * 0.52)} />
      {appId === "browser" && size >= 32 && (
        // Nimbus is an original app: retain its coral disc and two-bar mark as a badge.
        <svg className="pointer-events-none absolute bottom-0.5 right-0.5" width={Math.round(size * 0.3)} height={Math.round(size * 0.3)} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="7.2" fill="#f87171" />
          <rect x="3" y="5" width="10" height="2" rx="1" fill="white" />
          <rect x="4.5" y="8.5" width="7" height="2" rx="1" fill="white" />
        </svg>
      )}
    </span>
  )
}

export function iconFor(appId: AppId): LucideIcon {
  return appId === "browser" ? Cloud : ICONS[APP_META[appId].icon] ?? FileText
}
