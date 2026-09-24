"use client"

/**
 * The allowlist.
 *
 * `actions.ts` is the full capability surface; this is the subset that untrusted
 * input - a typed sentence in Nimbus, a `ask "..."` in the shell - is allowed to
 * reach, with every argument parsed and validated at this boundary.
 *
 * Honest about what this is: in a single bundle, any module can still reach a
 * store directly. This is a discipline that keeps the assistant's reachable
 * surface small, reviewable and typed - not a sandbox.
 */

import * as A from "./actions"
import { fail, ok, type ActionResult } from "./result"
import type { AppId } from "./types"

export type CapabilityName =
  | "open-app"
  | "open-file"
  | "open-folder"
  | "search"
  | "set-theme"
  | "set-wifi"
  | "show-desktop"
  | "lock"

export type Capability = {
  name: CapabilityName
  /** Shown on the button the assistant offers; must read as a user intent. */
  title: (arg: string) => string
  /** Whether running it changes state the visitor would notice. */
  effect: "navigate" | "mutate"
  run: (arg: string) => ActionResult<unknown>
}

const CAPS: Readonly<Record<CapabilityName, Capability>> = Object.freeze({
  "open-app": {
    name: "open-app",
    effect: "navigate",
    title: (arg) => `Open ${arg}`,
    run: (arg) => A.openAppByName(arg),
  },
  "open-file": {
    name: "open-file",
    effect: "navigate",
    title: (arg) => `Open ${arg}`,
    run: (arg) => A.openNode(arg),
  },
  "open-folder": {
    name: "open-folder",
    effect: "navigate",
    title: (arg) => (arg ? `Open ${arg}` : "Open File Explorer"),
    run: (arg) => A.openFolder(arg || null),
  },
  search: {
    name: "search",
    effect: "navigate",
    title: (arg) => `Search for “${arg}”`,
    run: (arg) => A.openApp("browser", { q: arg }),
  },
  "set-theme": {
    name: "set-theme",
    effect: "mutate",
    title: (arg) => `Switch to ${arg} mode`,
    run: (arg) => {
      const v = arg.trim().toLowerCase()
      if (v !== "dark" && v !== "light") {
        return fail("bad-argument", "I can switch between dark and light mode.")
      }
      return A.setTheme(v)
    },
  },
  "set-wifi": {
    name: "set-wifi",
    effect: "mutate",
    title: (arg) => `Turn Wi-Fi ${arg === "off" ? "off" : "on"}`,
    run: (arg) => A.setWifi(arg.trim().toLowerCase() !== "off"),
  },
  "show-desktop": {
    name: "show-desktop",
    effect: "mutate",
    title: () => "Show the desktop",
    run: () => A.showDesktop(),
  },
  lock: {
    name: "lock",
    effect: "mutate",
    title: () => "Lock JP OS",
    run: () => A.lockMachine(),
  },
})

export function getCapability(name: string): Capability | null {
  return Object.prototype.hasOwnProperty.call(CAPS, name)
    ? CAPS[name as CapabilityName]
    : null
}

/**
 * The single entry point for assistant-initiated actions. Anything not in the
 * table is refused by name rather than silently ignored.
 */
export function assistantInvoke(name: string, arg = ""): ActionResult<unknown> {
  const cap = getCapability(name)
  if (!cap) return fail("denied", `"${name}" isn't something I'm allowed to do.`)
  if (typeof arg !== "string" || arg.length > 200) {
    return fail("bad-argument", "That request was malformed.")
  }
  return cap.run(arg)
}

/** Capability suggestions the assistant can surface as buttons. */
export function capabilityButton(name: CapabilityName, arg = "") {
  const cap = getCapability(name)
  return cap ? { name, arg, label: cap.title(arg), effect: cap.effect } : null
}

export function isAppTarget(v: string): v is AppId {
  return A.isAppId(v)
}

export { ok }
