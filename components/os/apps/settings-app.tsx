"use client"

import { useRef, useState, type ChangeEvent } from "react"
import { AlignCenter, AlignLeft, AppWindow, Check, HardDrive, Image as ImageIcon, ImagePlus, Monitor, Moon, Paintbrush, PanelBottom, Sun, Trash2 } from "lucide-react"
import { ACCENTS, useAppearance } from "@/lib/os/appearance-store"
import { PROFILE } from "@/lib/os/content"
import { useFS } from "@/lib/os/fs-store"
import type { Theme, WindowInstance } from "@/lib/os/types"
import { WALLPAPER_PRESETS, wallpaperPreset } from "@/lib/os/wallpaper-presets"
import { MAX_CUSTOM, useWallpaper } from "@/lib/os/wallpaper-store"
import { useWM } from "@/lib/os/wm-store"
import { Wallpaper } from "../wallpaper"
import styles from "./settings.module.css"

const sections = [
  { id: "background", label: "Background", icon: ImageIcon },
  { id: "colors", label: "Colors", icon: Paintbrush },
  { id: "taskbar", label: "Taskbar", icon: PanelBottom },
  { id: "system", label: "System", icon: Monitor },
] as const

export function SettingsApp({ win }: { win: WindowInstance }) {
  const theme = useWM((s) => s.theme)
  const setPayload = useWM((s) => s.setPayload)
  const section = sections.find((item) => item.id === win.payload?.section) ?? sections[0]

  return (
    <main aria-label="Settings" className={styles.settings}>
      <aside className={styles.sidebar}>
        <h1 className={styles.title}>Personalization</h1>
        <DesktopPreview theme={theme} />
        <nav aria-label="Settings sections" className={styles.navigation}>
          {sections.map(({ id, label, icon: Icon }) => (
            <button type="button" key={id} aria-current={section.id === id ? "page" : undefined}
              onClick={() => setPayload(win.id, { section: id })}>
              <Icon size={17} aria-hidden />{label}
            </button>
          ))}
        </nav>
      </aside>
      <section key={section.id} className={`os-scroll ${styles.panel}`} aria-label={section.label}>
        <h2>{section.id === "taskbar" ? "Desktop taskbar" : section.label}</h2>
        {section.id === "background" && <BackgroundSettings theme={theme} />}
        {section.id === "colors" && <ColorSettings />}
        {section.id === "taskbar" && <TaskbarSettings />}
        {section.id === "system" && <SystemSettings />}
      </section>
    </main>
  )
}

function DesktopPreview({ theme }: { theme: Theme }) {
  const { current, custom } = useWallpaper()
  const alignment = useAppearance((s) => s.alignment)
  const name = wallpaperPreset(current)?.name ?? custom.find((item) => item.id === current)?.name

  return (
    <figure className={styles.preview}>
      <div className={styles.screen} aria-hidden>
        <Wallpaper theme={theme} preview />
        <span className={styles.miniWindow}><i /><i /><i /></span>
        <span className={styles.miniTaskbar} data-alignment={alignment}><i /><i /><i /></span>
      </div>
      <figcaption><span>Current background</span><strong>{name}</strong></figcaption>
    </figure>
  )
}

function BackgroundSettings({ theme }: { theme: Theme }) {
  const { current, custom, select, add, remove } = useWallpaper()
  const input = useRef<HTMLInputElement>(null)
  const browse = useRef<HTMLButtonElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function importPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    setError("")
    setBusy(true)
    try {
      const result = await add(file)
      if (!result.ok) setError(result.message)
    } finally {
      setBusy(false)
    }
  }

  const pictures = [...WALLPAPER_PRESETS.filter((preset) => preset.kind === "picture"), ...custom]
  const hasSpace = custom.length < MAX_CUSTOM
  return (
    <>
      <h3>Pictures</h3>
      <div role="group" aria-label="Pictures" className={styles.pictures}>
        {pictures.map((picture) => (
          <div key={picture.id} className={styles.picture}>
            <button type="button" className={styles.pictureChoice} aria-pressed={current === picture.id}
              onClick={() => { setError(""); select(picture.id) }}>
              <span className={styles.thumbnail}>
                <Wallpaper theme={theme} wallpaperId={picture.id} preview />
                {current === picture.id && <span className={styles.selectedMark}><Check size={14} strokeWidth={3} aria-hidden /></span>}
              </span>
              <span className={styles.pictureName}>{picture.name}</span>
            </button>
            {"addedAt" in picture && <button type="button" className={styles.remove} aria-label={`Remove ${picture.name}`}
              onClick={() => { remove(picture.id); setError(""); browse.current?.focus() }}><Trash2 size={14} aria-hidden /></button>}
          </div>
        ))}
      </div>
      <button type="button" ref={browse} disabled={busy || !hasSpace} className={styles.browse} onClick={() => input.current?.click()}>
        <ImagePlus size={16} aria-hidden />{busy ? "Adding picture…" : "Add picture"}
      </button>
      <input type="file" aria-label="Choose a picture" accept="image/*" ref={input} hidden onChange={importPicture} />
      <p role="status" className={styles.hint} data-error={!!error || undefined}>
        {error || (hasSpace ? "Your pictures stay in this browser." : `All ${MAX_CUSTOM} picture slots are in use. Remove a picture to add another.`)}
      </p>
      <div className={styles.divider}>
        <h3>Solid colors</h3>
        <div role="group" aria-label="Solid colors" className={styles.choices}>
          {WALLPAPER_PRESETS.filter((preset) => preset.kind === "color").map((preset) => (
            <button key={preset.id} type="button" aria-pressed={current === preset.id}
              onClick={() => { setError(""); select(preset.id) }}>
              <span className={styles.swatch} style={{ backgroundColor: preset.color }} />{preset.name}
              {current === preset.id && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function ColorSettings() {
  const { accent, setAccent } = useAppearance()
  const { theme, setTheme } = useWM()
  return (
    <>
      <h3>Color mode</h3>
      <div role="group" aria-label="Color mode" className={styles.choices}>
        {([{ id: "light", Icon: Sun, name: "Light" }, { id: "dark", Icon: Moon, name: "Dark" }] as const).map(({ id, Icon, name }) => (
          <button key={id} type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}><Icon size={17} aria-hidden />{name}</button>
        ))}
      </div>
      <div className={styles.divider}>
        <h3>Accent color</h3>
        <div role="group" aria-label="Accent color" className={styles.choices}>
          {ACCENTS.map((item) => (
            <button key={item.id} type="button" aria-pressed={accent === item.id} onClick={() => setAccent(item.id)}>
              <span className={styles.swatch} style={{ backgroundColor: theme === "dark" ? item.dark : item.swatch }} />{item.label}
              {accent === item.id && <Check size={14} aria-hidden />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function TaskbarSettings() {
  const { alignment, setAlignment } = useAppearance()
  return (
    <>
      <h3>Taskbar alignment</h3>
      <p className={styles.description}>Choose where Start and your pinned apps sit on the desktop.</p>
      <div role="group" aria-label="Taskbar alignment" className={styles.choices}>
        {([{ id: "left", Icon: AlignLeft, name: "Left" }, { id: "center", Icon: AlignCenter, name: "Center" }] as const).map(({ id, Icon, name }) => (
          <button key={id} type="button" aria-pressed={alignment === id} onClick={() => setAlignment(id)}><Icon size={17} aria-hidden />{name}</button>
        ))}
      </div>
    </>
  )
}

function SystemSettings() {
  const { reset, nodes } = useFS()
  const closeAll = useWM((s) => s.closeAll)
  return (
    <>
      <h3>Storage and windows</h3>
      <div className={styles.systemRow}>
        <span><HardDrive size={17} aria-hidden />Desktop files<small>{nodes.length} items</small></span>
        <button type="button" className={styles.action} onClick={() => {
          if (window.confirm("Delete everything you've created and restore the starter files?")) reset()
        }}>Reset files</button>
      </div>
      <div className={styles.systemRow}>
        <span><AppWindow size={17} aria-hidden />Open windows</span>
        <button type="button" className={styles.action} onClick={closeAll}>Close all</button>
      </div>
      <div className={styles.divider}>
        <h3>About this device</h3>
        <dl className={styles.specs}>
          <dt>Device name</dt><dd>PORTFOLIO-PC</dd>
          <dt>Owner</dt><dd>{PROFILE.name}</dd>
          <dt>Edition</dt><dd>Portfolio OS</dd>
          <dt>Built with</dt><dd>Next.js · React · TypeScript · Tailwind</dd>
        </dl>
      </div>
    </>
  )
}
