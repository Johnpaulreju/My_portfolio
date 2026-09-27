"use client"

import { APP_META } from "@/lib/os/app-meta"
import type { AppId } from "@/lib/os/types"
import { AppIcon } from "@/components/os/app-icon"

export type Launch = (id: AppId, from?: Element | null) => void

/** One launcher icon with its label. `light` is for text over the wallpaper. */
export function AppTile({ id, onLaunch, light = false, size = 48 }: { id: AppId; onLaunch: Launch; light?: boolean; size?: number }) {
  return (
    <button
      type="button"
      data-home-tile={light || undefined}
      onClick={(e) => onLaunch(id, e.currentTarget.querySelector("[data-tile-icon]"))}
      aria-label={APP_META[id].title}
      className="phone-app-tile flex min-h-12 min-w-12 flex-col items-center gap-1 rounded-xl py-1"
    >
      <span data-tile-icon className="inline-flex"><AppIcon appId={id} size={size} /></span>
      <span className={`phone-app-label w-full truncate px-0.5 text-center text-xs ${light ? "text-white drop-shadow" : ""}`}>{APP_META[id].short}</span>
    </button>
  )
}
