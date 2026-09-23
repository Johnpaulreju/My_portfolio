"use client"

import {
  Activity, Briefcase, Chrome, FileBadge, FileText, FlaskConical, Folder, FolderOpen,
  Mail, Settings, SquareTerminal, Trophy, UserRound, type LucideIcon,
} from "lucide-react"
import { APP_META } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"

const ICONS: Record<string, LucideIcon> = {
  Activity, Briefcase, Chrome, FileBadge, FileText, FlaskConical, Folder, FolderOpen,
  Mail, Settings, SquareTerminal, Trophy, UserRound,
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
