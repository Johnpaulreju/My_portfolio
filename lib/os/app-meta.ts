import type { AppId, Size } from "./types"

export type AppMeta = {
  id: AppId
  title: string
  /** Short label used on the desktop grid and phone home screen. */
  short: string
  /** lucide-react icon name, resolved in components/os/app-icon.tsx */
  icon: string
  /** Tailwind gradient pair driving the icon tile. */
  tint: [string, string]
  defaultSize: Size
  /**
   * "dialog" suppresses resize handles, the minimize/maximize buttons, title-bar
   * double-click and edge snapping - a fixed-size content dialog, not a window.
   */
  chrome?: "window" | "dialog"
  /** Only one window of this app may exist at a time. */
  singleton: boolean
  /** Shown as an icon on the Windows desktop. */
  onDesktop: boolean
  /** Pinned to the taskbar / phone dock. */
  pinned: boolean
}

export const APP_META: Record<AppId, AppMeta> = {
  about: {
    id: "about", title: "About Me", short: "About Me", icon: "UserRound",
    tint: ["#38bdf8", "#0369a1"], defaultSize: { w: 880, h: 580 },
    singleton: true, onDesktop: true, pinned: true,
  },
  projects: {
    id: "projects", title: "Projects", short: "Projects", icon: "FolderOpen",
    tint: ["#fbbf24", "#d97706"], defaultSize: { w: 980, h: 620 },
    singleton: true, onDesktop: true, pinned: true,
  },
  experience: {
    id: "experience", title: "Experience", short: "Experience", icon: "Briefcase",
    tint: ["#a78bfa", "#6d28d9"], defaultSize: { w: 860, h: 600 },
    singleton: true, onDesktop: true, pinned: true,
  },
  skills: {
    id: "skills", title: "Skills", short: "Skills", icon: "Activity",
    tint: ["#34d399", "#047857"], defaultSize: { w: 820, h: 600 },
    singleton: true, onDesktop: true, pinned: true,
  },
  achievements: {
    id: "achievements", title: "Achievements", short: "Awards", icon: "Trophy",
    tint: ["#f472b6", "#be185d"], defaultSize: { w: 780, h: 540 },
    singleton: true, onDesktop: true, pinned: false,
  },
  lab: {
    id: "lab", title: "Lab", short: "Lab", icon: "FlaskConical",
    tint: ["#2dd4bf", "#0f766e"], defaultSize: { w: 720, h: 500 },
    singleton: true, onDesktop: true, pinned: false,
  },
  contact: {
    id: "contact", title: "Mail — Contact", short: "Contact", icon: "Mail",
    tint: ["#60a5fa", "#1d4ed8"], defaultSize: { w: 860, h: 600 },
    singleton: true, onDesktop: true, pinned: true,
  },
  browser: {
    id: "browser", title: "Nimbus", short: "Nimbus", icon: "Globe",
    tint: ["#f87171", "#dc2626"], defaultSize: { w: 1040, h: 680 },
    singleton: false, onDesktop: true, pinned: true,
  },
  notepad: {
    id: "notepad", title: "Notepad", short: "Notepad", icon: "FileText",
    tint: ["#93c5fd", "#2563eb"], defaultSize: { w: 720, h: 520 },
    singleton: false, onDesktop: false, pinned: false,
  },
  explorer: {
    id: "explorer", title: "File Explorer", short: "Files", icon: "Folder",
    tint: ["#fcd34d", "#ca8a04"], defaultSize: { w: 960, h: 600 },
    singleton: false, onDesktop: false, pinned: true,
  },
  settings: {
    id: "settings", title: "Settings", short: "Settings", icon: "Settings",
    tint: ["#94a3b8", "#475569"], defaultSize: { w: 820, h: 580 },
    singleton: true, onDesktop: false, pinned: true,
  },
  terminal: {
    id: "terminal", title: "Terminal", short: "Terminal", icon: "SquareTerminal",
    tint: ["#4ade80", "#15803d"], defaultSize: { w: 760, h: 480 },
    singleton: false, onDesktop: false, pinned: true,
  },
  docs: {
    id: "docs", title: "JP's Docs", short: "Docs", icon: "FileType",
    tint: ["#5b8def", "#1e3a8a"], defaultSize: { w: 980, h: 700 },
    singleton: false, onDesktop: true, pinned: true,
  },
  player: {
    id: "player", title: "Media Player", short: "Player", icon: "Clapperboard",
    tint: ["#f59e0b", "#b45309"], defaultSize: { w: 960, h: 660 },
    singleton: false, onDesktop: false, pinned: false,
  },
  welcome: {
    id: "welcome", title: "Welcome", short: "Welcome", icon: "PartyPopper",
    tint: ["#e879f9", "#a21caf"], defaultSize: { w: 760, h: 430 },
    chrome: "dialog",
    singleton: true, onDesktop: false, pinned: false,
  },
  recyclebin: {
    id: "recyclebin", title: "Recycle Bin", short: "Recycle Bin", icon: "Trash2",
    tint: ["#9ca3af", "#4b5563"], defaultSize: { w: 900, h: 560 },
    singleton: true, onDesktop: true, pinned: false,
  },
  computer: {
    id: "computer", title: "This PC", short: "This PC", icon: "HardDrive",
    tint: ["#7dd3fc", "#0284c7"], defaultSize: { w: 940, h: 600 },
    singleton: true, onDesktop: true, pinned: false,
  },
  minesweeper: {
    id: "minesweeper", title: "Minesweeper", short: "Minesweeper", icon: "Bomb",
    tint: ["#fca5a5", "#b91c1c"], defaultSize: { w: 520, h: 600 },
    singleton: true, onDesktop: true, pinned: false,
  },
  solitaire: {
    id: "solitaire", title: "Solitaire", short: "Solitaire", icon: "Spade",
    tint: ["#86efac", "#15803d"], defaultSize: { w: 900, h: 640 },
    singleton: true, onDesktop: true, pinned: false,
  },
  tube: {
    id: "tube", title: "JP Tube", short: "JP Tube", icon: "MonitorPlay",
    tint: ["#fb7185", "#9f1239"], defaultSize: { w: 1040, h: 700 },
    singleton: true, onDesktop: true, pinned: true,
  },
  ridgeline: {
    id: "ridgeline", title: "Ridgeline", short: "Ridgeline", icon: "Bike",
    tint: ["#fb923c", "#9a3412"], defaultSize: { w: 900, h: 640 },
    singleton: true, onDesktop: true, pinned: false,
  },
  vantage: {
    id: "vantage", title: "Vantage", short: "Vantage", icon: "Compass",
    // Deeper and bluer than Lab's #2dd4bf so the two teals don't collide.
    tint: ["#00a2a8", "#006d78"], defaultSize: { w: 1060, h: 700 },
    singleton: false, onDesktop: true, pinned: false,
  },
  resume: {
    id: "resume", title: "Resume.pdf", short: "Resume", icon: "FileBadge",
    tint: ["#fb923c", "#c2410c"], defaultSize: { w: 780, h: 700 },
    singleton: true, onDesktop: true, pinned: false,
  },
}

export const ALL_APPS = Object.values(APP_META)
export const DESKTOP_APPS = ALL_APPS.filter((a) => a.onDesktop)
export const PINNED_APPS = ALL_APPS.filter((a) => a.pinned)
