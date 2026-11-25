"use client"

import type { Theme } from "@/lib/os/types"
import { DEFAULT_WALLPAPER, WALLPAPER_PRESETS, wallpaperPreset } from "@/lib/os/wallpaper-presets"
import { useWallpaper } from "@/lib/os/wallpaper-store"

export function Wallpaper({ theme, wallpaperId, preview = false }: { theme: Theme; wallpaperId?: string; preview?: boolean }) {
  const id = useWallpaper((s) => wallpaperId ?? s.current)
  const custom = useWallpaper((s) => s.custom.find((item) => item.id === id))
  const preset = wallpaperPreset(id) ?? WALLPAPER_PRESETS[0]
  const solid = !custom && preset.kind === "color" ? preset.color : undefined
  const picture = preset.kind === "picture" ? preset : undefined
  const name = custom ? "custom" : preset.id === DEFAULT_WALLPAPER ? "azure-folds" : preset.id
  return (
    <span aria-hidden="true" data-wallpaper={preview ? undefined : name} className="pointer-events-none absolute inset-0 overflow-hidden" style={{ backgroundColor: solid ?? "#091735" }}>
      {!solid && <picture>
        {!custom && picture?.mobileSrc && <source media="(max-width: 767px)" srcSet={picture.mobileSrc} />}
        <img src={custom?.src ?? picture?.src} alt="" draggable={false} fetchPriority={preview ? "auto" : "high"} className="absolute inset-0 h-full w-full select-none object-cover" />
      </picture>}
      {!solid && <span className="absolute inset-0" style={{
        background: theme === "dark"
          ? "linear-gradient(90deg, #040d242c, transparent 44%), linear-gradient(0deg, #040d2440, transparent 34%)"
          : "linear-gradient(125deg, #e1edff15, transparent 60%)",
      }} />}
    </span>
  )
}
