"use client"

import { useState } from "react"
import {
  Activity, AlarmClock, Bike, Bomb, BookOpen, Briefcase, Camera, Cloud, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MessagesSquare, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound, type LucideIcon,
} from "lucide-react"
import { APP_META } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"
import { brandIcon } from "@/lib/os/brand-icons"

const ICONS: Record<string, LucideIcon> = {
  Activity, AlarmClock, Bike, Bomb, BookOpen, Briefcase, Camera, Cloud, Compass, Clapperboard, FileBadge, FileText, FileType, FlaskConical, Folder,
  FolderOpen, Globe, HardDrive, Mail, MessagesSquare, MonitorPlay, PartyPopper, Settings, Spade, SquareTerminal,
  Trash2, Trophy, UserRound,
}

function IconImage({ appId, size }: { appId: AppId; size: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const Icon = iconFor(appId)
    return <Icon size={size} strokeWidth={1.8} className="drop-shadow-sm" />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- bundled icon artwork at native aspect ratio
    <img
      src={brandIcon(appId)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className="pointer-events-none block h-full w-full object-contain"
    />
  )
}

/** Decorative launcher artwork. The parent control provides its accessible name. */
export function AppIcon({ appId, size = 40, className = "" }: { appId: AppId; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }}>
      <IconImage key={appId} appId={appId} size={size} />
    </span>
  )
}

export function iconFor(appId: AppId): LucideIcon {
  return ICONS[APP_META[appId].icon] ?? FileText
}
