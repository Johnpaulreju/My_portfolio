import type { AppId } from "./types"

// Lucide 0.454.0, pinned to the release commit (never a mutable branch).
// Exact sources, bundled copies and license notices: public/brand/README.md.
const UPSTREAM = "https://raw.githubusercontent.com/lucide-icons/lucide/dcd19cedc9fe69a6c6da30c65f412e2dbea585f7/icons"

const GLYPHS: Record<AppId, string> = {
  about: "user-round",
  projects: "folder-open",
  experience: "briefcase",
  skills: "activity",
  achievements: "trophy",
  lab: "flask-conical",
  contact: "mail",
  browser: "cloud",
  notepad: "file-text",
  docs: "file-type",
  player: "clapperboard",
  explorer: "folder",
  settings: "settings",
  terminal: "square-terminal",
  resume: "file-badge",
  welcome: "party-popper",
  recyclebin: "trash-2",
  computer: "hard-drive",
  minesweeper: "bomb",
  solitaire: "spade",
  tube: "monitor-play",
  ridgeline: "bike",
  vantage: "compass",
  clock: "alarm-clock",
  camera: "camera",
}

/** Synchronous explicit mapping; never probes for unlisted or nonexistent files. */
export function brandIcon(appId: AppId): { remote: string; local: string } {
  const glyph = GLYPHS[appId]
  return { remote: `${UPSTREAM}/${glyph}.svg`, local: `/brand/lucide/${glyph}.svg` }
}
