"use client"

import type { Theme } from "@/lib/os/types"
import { DEFAULT_WALLPAPER_URL, useWallpaper } from "@/lib/os/wallpaper-store"

export function Wallpaper({ theme }: { theme: Theme }) {
  const custom = useWallpaper((s) => s.custom.find((item) => item.id === s.current)?.src)
  return (
    <div aria-hidden="true" data-wallpaper={custom ? "custom" : "azure-folds"} className="pointer-events-none absolute inset-0 overflow-hidden bg-[#091735]">
      <picture>
        {!custom && <source media="(max-width: 767px)" srcSet="/media/wallpapers/azure-folds-mobile.webp" />}
        <img src={custom ?? DEFAULT_WALLPAPER_URL} alt="" draggable={false} fetchPriority="high" className="absolute inset-0 h-full w-full select-none object-cover" />
      </picture>
      <div className="absolute inset-0" style={{
        background: theme === "dark"
          ? "linear-gradient(90deg, #040d242c, transparent 44%), linear-gradient(0deg, #040d2440, transparent 34%)"
          : "linear-gradient(125deg, #e1edff15, transparent 60%)",
      }} />
    </div>
  )
}
