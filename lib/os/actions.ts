"use client"

/**
 * The shared OS action layer.
 *
 * Before this existed, nine components each called `useWM.getState().open(...)`
 * with their own hand-written payloads, and the Terminal, Nimbus and the desktop
 * all had their own idea of what "open this thing" meant. This module is the one
 * place that knows.
 *
 * Import direction is strictly one-way: actions -> stores / app-meta / content.
 * Nothing under components/ is imported here, so app-host's code-splitting is
 * untouched. Stores must never import this file back.
 */

import { APP_META, ALL_APPS } from "./app-meta"
import { useFS } from "./fs-store"
import { useNotify } from "./notify-store"
import { usePower } from "./power-store"
import { useSystem } from "./system-store"
import { useWM } from "./wm-store"
import { fail, fromWrite, ok, type ActionResult } from "./result"
import type { AppId, FSNode, FSNodeKind, Theme } from "./types"

const wm = () => useWM.getState()
const fs = () => useFS.getState()
const sys = () => useSystem.getState()
const notify = () => useNotify.getState()
const power = () => usePower.getState()

/* ------------------------------------------------------------------ apps -- */

export function isAppId(v: string): v is AppId {
  return Object.prototype.hasOwnProperty.call(APP_META, v)
}

/** Resolve a loose human string ("terminal", "JP Tube", "files") to an app id. */
export function resolveApp(name: string): AppId | null {
  const q = name.trim().toLowerCase()
  if (!q) return null
  if (isAppId(q)) return q
  const exact = ALL_APPS.find(
    (a) => a.title.toLowerCase() === q || a.short.toLowerCase() === q,
  )
  if (exact) return exact.id
  const partial = ALL_APPS.filter(
    (a) => a.title.toLowerCase().includes(q) || a.short.toLowerCase().includes(q),
  )
  return partial.length === 1 ? partial[0].id : null
}

export function openApp(
  appId: AppId,
  payload?: Record<string, unknown>,
  title?: string,
): ActionResult<string> {
  if (!isAppId(appId)) return fail("bad-argument", `There is no app called "${appId}".`)
  return ok(wm().open(appId, payload, title))
}

/** Same as openApp but takes a human string; used by the shell and the assistant. */
export function openAppByName(name: string): ActionResult<string> {
  const id = resolveApp(name)
  if (!id) return fail("missing", `I couldn't find an app called "${name}".`)
  return openApp(id)
}

export function closeWindow(id: string): ActionResult {
  if (!wm().windows.some((w) => w.id === id)) return fail("missing", "That window isn't open.")
  wm().close(id)
  return ok(undefined)
}

export function focusWindow(id: string): ActionResult {
  if (!wm().windows.some((w) => w.id === id)) return fail("missing", "That window isn't open.")
  wm().focus(id)
  return ok(undefined)
}

export function minimizeWindow(id: string): ActionResult {
  if (!wm().windows.some((w) => w.id === id)) return fail("missing", "That window isn't open.")
  wm().minimize(id)
  return ok(undefined)
}

export function maximizeWindow(id: string): ActionResult {
  if (!wm().windows.some((w) => w.id === id)) return fail("missing", "That window isn't open.")
  wm().toggleMaximize(id)
  return ok(undefined)
}

export function listWindows() {
  const { windows, focusedId } = wm()
  return windows.map((w, i) => ({
    pid: 1001 + i,
    id: w.id,
    appId: w.appId,
    title: w.title,
    state: w.minimized ? "minimized" : w.id === focusedId ? "focused" : "running",
  }))
}

/* ------------------------------------------------------------ filesystem -- */

type OpenTarget =
  | { kind: "folder"; node: FSNode }
  | { kind: "app"; appId: AppId }
  | { kind: "editor"; node: FSNode; appId: AppId }
  | { kind: "media"; node: FSNode }

/** Pure: what SHOULD open for this node. Separated so callers can preview it. */
export function resolveNodeTarget(node: FSNode): OpenTarget {
  if (node.kind === "folder" || node.kind === "zip") return { kind: "folder", node }
  if (node.kind === "app-link" && node.appId) return { kind: "app", appId: node.appId }
  if (node.kind === "video") return { kind: "media", node }
  if (node.kind === "doc") return { kind: "editor", node, appId: "docs" }
  return { kind: "editor", node, appId: "notepad" }
}

/** Open a filesystem node in whatever app is right for it. */
export function openNode(nodeId: string): ActionResult<string> {
  const node = fs().get(nodeId)
  if (!node) return fail("missing", "That file no longer exists.")
  if (node.deletedAt) return fail("missing", `${node.name} is in the Recycle Bin.`)

  const target = resolveNodeTarget(node)
  switch (target.kind) {
    case "folder":
      return openApp("explorer", { folderId: node.id }, `${node.name} — File Explorer`)
    case "app":
      return openApp(target.appId)
    case "media":
      return openApp("player", { fileId: node.id }, node.name)
    case "editor":
      return openApp(target.appId, { fileId: node.id }, `${node.name} — ${APP_META[target.appId].short}`)
  }
}

/** Open File Explorer at a folder (null = Desktop). */
export function openFolder(folderId: string | null): ActionResult<string> {
  if (folderId) {
    const node = fs().get(folderId)
    if (!node) return fail("missing", "That folder no longer exists.")
    return openApp("explorer", { folderId }, `${node.name} — File Explorer`)
  }
  return openApp("explorer", { folderId: null }, "Desktop — File Explorer")
}

export function createNode(
  kind: FSNodeKind,
  parentId: string | null,
  name?: string,
): ActionResult<string> {
  return ok(fs().create(kind, parentId, name))
}

export function renameNode(id: string, name: string): ActionResult<string | undefined> {
  const node = fs().get(id)
  return fromWrite(fs().rename(id, name), node?.name ?? "That file")
}

export function trashNode(id: string): ActionResult<string | undefined> {
  const node = fs().get(id)
  return fromWrite(fs().remove(id), node?.name ?? "That file")
}

export function writeNode(id: string, body: string): ActionResult<string | undefined> {
  const node = fs().get(id)
  return fromWrite(fs().setBody(id, body), node?.name ?? "That file")
}

export function saveNodeCopy(id: string, body?: string): ActionResult<string | undefined> {
  const node = fs().get(id)
  return fromWrite(fs().saveCopy(id, body), node?.name ?? "That file")
}

/** Absolute path of a node, Desktop-rooted, for display. */
export function pathOf(id: string | null): string {
  if (!id) return "Desktop"
  const parts: string[] = []
  let cur = fs().get(id)
  let hops = 0
  while (cur && hops++ < 64) {
    parts.unshift(cur.name)
    cur = cur.parentId ? fs().get(cur.parentId) : undefined
  }
  return ["Desktop", ...parts].join("\\")
}

/* ----------------------------------------------------------------- shell -- */

export function setTheme(theme: Theme): ActionResult<Theme> {
  if (theme !== "dark" && theme !== "light") {
    return fail("bad-argument", `"${theme}" isn't a theme. Try dark or light.`)
  }
  wm().setTheme(theme)
  return ok(theme)
}

export function toggleTheme(): ActionResult<Theme> {
  wm().toggleTheme()
  return ok(wm().theme)
}

export const showDesktop = (): ActionResult => (wm().minimizeAll(), ok(undefined))
export const closeAllWindows = (): ActionResult => (wm().closeAll(), ok(undefined))
export const openStart = (): ActionResult => (wm().setStartOpen(true), ok(undefined))
export const openQuickSettings = (): ActionResult => (wm().setQsOpen(true), ok(undefined))
export const openNotifications = (): ActionResult => (wm().setNotifOpen(true), ok(undefined))
export const closeFlyouts = (): ActionResult => (wm().closeFlyouts(), ok(undefined))

/* ---------------------------------------------------------------- system -- */

export function setWifi(on: boolean): ActionResult<boolean> {
  if (sys().airplane && on) {
    return fail("denied", "Airplane mode is on. Turn it off first, or enable Wi-Fi from Quick Settings.")
  }
  sys().setWifi(on)
  return ok(on)
}

export function connectToNetwork(ssid: string): ActionResult<string> {
  const known = sys().networks.find((n) => n.ssid.toLowerCase() === ssid.trim().toLowerCase())
  if (!known) return fail("missing", `No network called "${ssid}" is in range.`)
  sys().connectTo(known.ssid)
  return ok(known.ssid)
}

export const disconnectNetwork = (): ActionResult => (sys().disconnect(), ok(undefined))
export const toggleAirplane = (): ActionResult<boolean> => (sys().toggleAirplane(), ok(sys().airplane))
export const toggleBluetooth = (): ActionResult<boolean> => (sys().toggleBt(), ok(sys().btOn))
export const toggleHotspot = (): ActionResult<boolean> => (sys().toggleHotspot(), ok(sys().hotspotOn))
export const toggleBatterySaver = (): ActionResult<boolean> =>
  (sys().toggleBatterySaver(), ok(sys().batterySaver))

export function setVolume(v: number): ActionResult<number> {
  if (!Number.isFinite(v)) return fail("bad-argument", "Volume must be a number from 0 to 100.")
  sys().setVolume(v)
  return ok(sys().volume)
}

export function setBrightness(v: number): ActionResult<number> {
  if (!Number.isFinite(v)) return fail("bad-argument", "Brightness must be a number from 20 to 100.")
  sys().setBrightness(v)
  return ok(sys().brightness)
}

export const toggleMute = (): ActionResult<boolean> => (sys().toggleMute(), ok(sys().muted))
export const setNightLight = (on: boolean): ActionResult<boolean> =>
  (sys().setNightLight(on), ok(on))
export const toggleGrayscale = (): ActionResult<boolean> =>
  (sys().toggleGrayscale(), ok(sys().grayscale))

/* ---------------------------------------------------------- notifications -- */

export function pushNotification(args: {
  appId: AppId
  source: string
  title: string
  body?: string
}): ActionResult {
  notify().push(args)
  return ok(undefined)
}

export const setDnd = (v: boolean): ActionResult<boolean> => (notify().setDnd(v), ok(v))
export const clearNotifications = (): ActionResult => (notify().clearCenter(), ok(undefined))

/* ----------------------------------------------------------------- power -- */

export const lockMachine = (): ActionResult => (power().lock(), ok(undefined))
export const sleepMachine = (): ActionResult => (power().sleep(), ok(undefined))
export const restartMachine = (): ActionResult => (power().restart(), ok(undefined))
export const shutDownMachine = (): ActionResult => (power().shutDown(), ok(undefined))

/* ------------------------------------------------------------- snapshot -- */

/** Everything an introspection surface (Terminal `system`, jpfetch) needs. */
export function systemSnapshot() {
  const s = sys()
  const w = wm()
  const f = fs()
  return {
    theme: w.theme,
    windows: w.windows.length,
    focused: w.windows.find((x) => x.id === w.focusedId)?.title ?? null,
    nodes: f.nodes.filter((n) => !n.deletedAt).length,
    trashed: f.nodes.filter((n) => n.deletedAt).length,
    wifiEnabled: s.wifiOn,
    airplane: s.airplane,
    conn: s.conn,
    ssid: s.ssid,
    volume: s.muted ? 0 : s.volume,
    brightness: s.brightness,
    notifications: useNotify.getState().center.length,
    apps: ALL_APPS.length,
  }
}
