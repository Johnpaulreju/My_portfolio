"use client"

import { create } from "zustand"
import type { CSSProperties } from "react"
import type { Theme } from "./types"

// Each swatch doubles as the accent on light surfaces. Dark surfaces use a lighter tone.
export const ACCENTS = [
  { id: "blue", label: "Blue", swatch: "#0067c0", dark: "#4cc2ff" },
  { id: "violet", label: "Violet", swatch: "#6d3fb1", dark: "#c4a6ff" },
  { id: "teal", label: "Teal", swatch: "#006b61", dark: "#66d8c6" },
  { id: "rose", label: "Rose", swatch: "#a52d5e", dark: "#ff9cbe" },
  { id: "amber", label: "Amber", swatch: "#885005", dark: "#f4bd64" },
] as const
export type AccentId = (typeof ACCENTS)[number]["id"]
export type TaskbarAlignment = "left" | "center"

const accentKey = "jp-os-accent-v1"
const alignmentKey = "jp-os-taskbar-alignment-v1"

type Appearance = {
  accent: AccentId
  alignment: TaskbarAlignment
  setAccent: (color: AccentId) => void
  setAlignment: (alignment: TaskbarAlignment) => void
  hydrate: () => void
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Browsers with storage disabled still apply the preference for this visit.
  }
}

export const useAppearance = create<Appearance>((set) => ({
  accent: "blue",
  alignment: "center",
  setAccent: (accent) => {
    set({ accent })
    save(accentKey, accent)
  },
  setAlignment: (alignment) => {
    set({ alignment })
    save(alignmentKey, alignment)
  },
  hydrate: () => {
    try {
      const stored = localStorage.getItem(accentKey)
      set({
        accent: ACCENTS.find((color) => color.id === stored)?.id ?? "blue",
        alignment: localStorage.getItem(alignmentKey) === "left" ? "left" : "center",
      })
    } catch {
      // Reading storage can be disabled too.
    }
  },
}))

/** Surfaces outside the shell, such as the alarm dialog, share these overrides. */
export function useAccentStyle(theme: Theme): CSSProperties | undefined {
  const accent = useAppearance((s) => s.accent)
  const palette = ACCENTS.find((color) => color.id === accent)
  if (!palette || palette.id === "blue") return undefined
  const paint = theme === "dark" ? palette.dark : palette.swatch
  return {
    "--os-accent": paint,
    "--os-accent-fg": paint,
    "--os-accent-soft": "color-mix(in srgb, var(--os-accent) 20%, transparent)",
  } as CSSProperties
}
