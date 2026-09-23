export type AppId =
  | "about"
  | "projects"
  | "experience"
  | "skills"
  | "achievements"
  | "lab"
  | "contact"
  | "browser"
  | "notepad"
  | "explorer"
  | "settings"
  | "terminal"
  | "resume"

export type Size = { w: number; h: number }
export type Point = { x: number; y: number }

/** A window is "snapped" when dragged to a screen edge, Windows-style. */
export type SnapSide = "left" | "right" | null

export type WindowInstance = {
  /** Unique per open window - an app can be open more than once (e.g. two Notepads). */
  id: string
  appId: AppId
  title: string
  /** Free-form payload, e.g. which file a Notepad window has open. */
  payload?: Record<string, unknown>
  pos: Point
  size: Size
  /** Restored geometry, remembered while maximized or snapped. */
  restore: { pos: Point; size: Size } | null
  minimized: boolean
  maximized: boolean
  snapped: SnapSide
  z: number
}

export type FSNodeKind = "folder" | "text" | "app-link"

export type FSNode = {
  id: string
  name: string
  kind: FSNodeKind
  /** null = lives on the Desktop root. */
  parentId: string | null
  /** Body text for `text` nodes. */
  body?: string
  /** Which app a `app-link` node launches. */
  appId?: AppId
  /** Built-in nodes cannot be deleted or renamed. */
  locked?: boolean
  createdAt: number
}

export type Theme = "dark" | "light"
