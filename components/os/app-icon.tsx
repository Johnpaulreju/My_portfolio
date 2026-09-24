"use client"

import { useEffect, useState } from "react"

import {
  Activity, Bike, Bomb, Briefcase, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound, type LucideIcon,
} from "lucide-react"
import { APP_META } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"
import { brandIcon, onBrandIconsChanged } from "@/lib/os/brand-icons"

const ICONS: Record<string, LucideIcon> = {
  Activity, Bike, Bomb, Briefcase, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound,
}

/** The rounded gradient tile used on the desktop, taskbar, Start menu and phone home screen. */
export function AppIcon({
  appId,
  size = 40,
  className = "",
}: {
  appId: AppId
  size?: number
  className?: string
}) {
  const meta = APP_META[appId]
  const Icon = ICONS[meta.icon] ?? FileText
  const radius = Math.round(size * 0.235)

  // An override at public/brand/<appId>.(svg|png|webp) wins over the built-in glyph.
  const [override, setOverride] = useState<string | null>(null)
  useEffect(() => {
    const read = () => setOverride(brandIcon(appId)?.url ?? null)
    read()
    return onBrandIconsChanged(read)
  }, [appId])

  if (override) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- images.unoptimized is on; static asset
      <img
        src={override}
        alt=""
        aria-hidden
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    )
  }

  return (
    <span
      className={`relative inline-grid shrink-0 place-items-center shadow-sm ring-1 ring-white/25 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundImage: `linear-gradient(145deg, ${meta.tint[0]}, ${meta.tint[1]})`,
      }}
    >
      {/* Top-edge sheen, the way Fluent icons catch light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: radius,
          backgroundImage: "linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 55%)",
        }}
      />
      <Icon size={Math.round(size * 0.52)} strokeWidth={2} className="relative text-white drop-shadow" />
    </span>
  )
}

export function iconFor(appId: AppId): LucideIcon {
  return ICONS[APP_META[appId].icon] ?? FileText
}
