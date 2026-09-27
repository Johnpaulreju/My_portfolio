"use client"

import { useRef, useState, type ChangeEvent, type ReactNode } from "react"
import { Moon, RotateCcw, Sun, Info, Palette, ImagePlus, Image as ImageIcon, Loader2, X } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { DEFAULT_WALLPAPER, MAX_CUSTOM, useWallpaper } from "@/lib/os/wallpaper-store"
import { PROFILE } from "@/lib/os/content"
import { Button, Card, Page, PageTitle, Row } from "./kit"

/** Same gradients as the dark/light previews below, so the Default tile matches the desktop. */
const BLOOM_PREVIEW = {
  dark: "radial-gradient(90% 90% at 50% 45%, #1b3b6f, #0a1230)",
  light: "radial-gradient(90% 90% at 50% 45%, #7db4f0, #2a5fb0)",
}

export function SettingsApp() {
  const { theme, setTheme, closeAll } = useWM()
  const { reset, nodes } = useFS()

  return (
    <Page>
      <PageTitle title="Settings" sub="Personalise this desktop." />

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <Palette size={15} /> Appearance
      </h2>
      <Card className="mb-6 p-4">
        <p className="mb-3 text-[13px]" style={{ color: "var(--os-muted)" }}>
          Choose a mode
        </p>
        <div className="flex gap-3">
          {(
            [
              { id: "dark", label: "Dark", icon: <Moon size={15} /> },
              { id: "light", label: "Light", icon: <Sun size={15} /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className="flex flex-1 flex-col gap-2 rounded-lg p-3 text-left transition-all"
              style={{
                background: "var(--os-card)",
                border: `2px solid ${theme === opt.id ? "var(--os-accent)" : "var(--os-border)"}`,
              }}
            >
              {/* Miniature preview of the desktop in that mode. */}
              <span
                className="block h-16 w-full rounded"
                style={{ background: BLOOM_PREVIEW[opt.id] }}
              >
                <span className="mt-[46px] block h-2.5 w-full rounded-b bg-black/25" />
              </span>
              <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--os-fg)" }}>
                {opt.icon} {opt.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <ImageIcon size={15} /> Background
      </h2>
      <BackgroundPicker />

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <RotateCcw size={15} /> Storage
      </h2>
      <Card className="mb-6">
        <Row label="Items on this desktop" value={`${nodes.length}`} />
        <Row
          label="Reset files"
          value="Restores the starter files"
          action={
            <Button
              onClick={() => {
                if (window.confirm("Delete everything you've created and restore the starter files?")) reset()
              }}
            >
              Reset
            </Button>
          }
        />
        <Row
          label="Close all windows"
          value=""
          action={<Button onClick={closeAll}>Close all</Button>}
        />
      </Card>

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <Info size={15} /> About
      </h2>
      <Card>
        <Row label="Device name" value="PORTFOLIO-PC" />
        <Row label="Owner" value={PROFILE.name} />
        <Row label="Edition" value="Portfolio OS" />
        <Row label="Built with" value="Next.js · React · TypeScript · Tailwind" />
      </Card>
    </Page>
  )
}

function BackgroundPicker() {
  const theme = useWM((s) => s.theme)
  const { current, custom, select, add, remove } = useWallpaper()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Cleared so choosing the same file again still fires a change.
    e.target.value = ""
    if (!file) return
    setBusy(true)
    setError(null)
    const res = await add(file)
    setBusy(false)
    if (!res.ok) setError(res.message)
  }

  return (
    <Card className="mb-6 p-4">
      <p className="mb-3 text-[13px]" style={{ color: "var(--os-muted)" }}>
        Pick a background, or add your own picture.
      </p>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))" }}>
        <WallpaperTile
          label="Default"
          selected={current === DEFAULT_WALLPAPER}
          onSelect={() => select(DEFAULT_WALLPAPER)}
        >
          <span className="block h-full w-full" style={{ background: BLOOM_PREVIEW[theme] }} />
        </WallpaperTile>

        {custom.map((w) => (
          <WallpaperTile
            key={w.id}
            label={w.name}
            selected={current === w.id}
            onSelect={() => select(w.id)}
            onRemove={() => {
              setError(null)
              remove(w.id)
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from localStorage */}
            <img src={w.src} alt="" className="h-full w-full object-cover" />
          </WallpaperTile>
        ))}

        {custom.length < MAX_CUSTOM && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex min-w-0 flex-col gap-1.5 text-left disabled:opacity-60"
          >
            <span
              className="grid aspect-video w-full place-items-center rounded-md transition-colors hover:bg-[var(--os-hover)]"
              style={{ border: "2px dashed var(--os-border)", color: "var(--os-muted)" }}
            >
              {busy ? <Loader2 size={18} className="motion-safe:animate-spin" /> : <ImagePlus size={18} />}
            </span>
            <span className="block truncate text-[12px]" style={{ color: "var(--os-fg)" }}>
              {busy ? "Adding…" : "Add picture"}
            </span>
          </button>
        )}
      </div>

      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-[12px]"
        style={{ color: error ? "color-mix(in srgb, var(--os-danger) 65%, var(--os-fg))" : "var(--os-muted)" }}
      >
        {error ?? "Pictures are saved in this browser only. Nothing is uploaded."}
      </p>
    </Card>
  )
}

function WallpaperTile({
  label,
  selected,
  onSelect,
  onRemove,
  children,
}: {
  label: string
  selected: boolean
  onSelect: () => void
  onRemove?: () => void
  children: ReactNode
}) {
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex w-full flex-col gap-1.5 text-left">
        <span
          className="block aspect-video w-full overflow-hidden rounded-md"
          style={{ border: `2px solid ${selected ? "var(--os-accent)" : "var(--os-border)"}` }}
        >
          {children}
        </span>
        <span className="block truncate text-[12px]" style={{ color: "var(--os-fg)" }}>
          {label}
        </span>
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          title="Remove"
          className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}
