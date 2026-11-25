export const DEFAULT_WALLPAPER = "default"
export const DEFAULT_WALLPAPER_URL = "/media/wallpapers/azure-folds.webp"

type WallpaperPreset = { id: string; name: string } & (
  | { kind: "picture"; src: string; mobileSrc?: string }
  | { kind: "color"; color: string }
)

export const WALLPAPER_PRESETS: readonly WallpaperPreset[] = [
  { id: DEFAULT_WALLPAPER, name: "Azure folds", kind: "picture", src: DEFAULT_WALLPAPER_URL, mobileSrc: "/media/wallpapers/azure-folds-mobile.webp" },
  { id: "alpine-dawn", name: "Alpine dawn", kind: "picture", src: "/media/wallpapers/alpine-dawn.webp" },
  { id: "coastal-dusk", name: "Coastal dusk", kind: "picture", src: "/media/wallpapers/coastal-dusk.webp" },
  { id: "midnight", name: "Midnight", kind: "color", color: "#172641" },
  { id: "slate", name: "Slate", kind: "color", color: "#445568" },
  { id: "pine", name: "Pine", kind: "color", color: "#254a41" },
]

export const wallpaperPreset = (id: string) => WALLPAPER_PRESETS.find((preset) => preset.id === id)
