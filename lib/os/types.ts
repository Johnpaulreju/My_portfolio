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
  | "docs"
  | "player"
  | "explorer"
  | "settings"
  | "terminal"
  | "resume"
  | "welcome"
  | "recyclebin"
  | "computer"
  | "minesweeper"
  | "solitaire"
  | "tube"
  | "ridgeline"
  | "vantage"

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

export type FSNodeKind = "folder" | "text" | "doc" | "video" | "zip" | "app-link"

export type FSNode = {
  id: string
  name: string
  kind: FSNodeKind
  /** null = lives on the Desktop root. */
  parentId: string | null
  /** Body text for `text` nodes; sanitized HTML for `doc` nodes. */
  body?: string
  /** Media source path for `video` nodes, relative to /public. */
  src?: string
  /** Which app an `app-link` node launches. */
  appId?: AppId
  /**
   * Carries Johnpaul's own words. Readable, openable and freely editable in the
   * buffer - but refuses to be written back, renamed or deleted. Enforced at the
   * save boundary only, never by disabling the editor.
   */
  locked?: boolean
  createdAt: number
  modifiedAt: number
  /** Soft delete - set when the node is in the Recycle Bin. */
  deletedAt?: number
  /** For `zip` nodes: a deep snapshot of members, so deleting the original keeps the archive intact. */
  zipOf?: FSNode[]
}

export type Theme = "dark" | "light"
