"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent as RClipboardEvent,
  type CSSProperties,
  type DragEvent as RDragEvent,
  type KeyboardEvent as RKeyboardEvent,
  type ReactNode,
} from "react"
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  FilePlus2,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Minus,
  PenLine,
  Quote,
  Redo2,
  Ruler,
  Save,
  Strikethrough,
  Underline,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react"
import { useFS } from "@/lib/os/fs-store"
import { useWM } from "@/lib/os/wm-store"
import { playSfx } from "@/lib/os/sfx"
import { PROFILE } from "@/lib/os/content"
import { sanitizeHtml, textToHtml } from "@/lib/os/sanitize-html"
import { Slider } from "@/components/os/ui/slider"
import type { WindowInstance } from "@/lib/os/types"

/* ------------------------------------------------------------------ *
 * The page is a sheet of paper. A sheet of paper is white in the dark,
 * too, so this one surface - and only this one - carries literal ink
 * and paper colours instead of theme tokens. Everything around it
 * (ribbon, status bar, dialogs, scrollbars) is fully themed.
 * ------------------------------------------------------------------ */
const PAPER = "#ffffff"
const INK = "#1b1b1b"
const RULE = "#d8d8d8"
const INK_SOFT = "#5a5a5a"
const LINK_INK = "#1a4fbf"

/** A4 proportions (1 : 1.414) at a comfortable on-screen width. */
const PAGE_W = 816
const PAGE_H = Math.round(PAGE_W * 1.414)

type MarginKey = "narrow" | "normal" | "wide"
const MARGINS: Record<MarginKey, { x: number; y: number; label: string }> = {
  narrow: { x: 48, y: 56, label: "Narrow" },
  normal: { x: 88, y: 96, label: "Normal" },
  wide: { x: 132, y: 120, label: "Wide" },
}

/**
 * `match` exists because the computed font-family never comes back as the label:
 * the page's default resolves through a CSS variable, and every stack falls back
 * differently. These needles are what the size/family readout matches against.
 */
const FONTS: { label: string; stack: string; match: string[] }[] = [
  { label: "Inter", stack: "var(--font-inter), system-ui, sans-serif", match: ["inter", "system-ui"] },
  { label: "Grotesk", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif', match: ["helvetica", "arial"] },
  { label: "Georgia", stack: 'Georgia, "Iowan Old Style", serif', match: ["georgia", "iowan"] },
  { label: "Palatino", stack: '"Palatino Linotype", Palatino, "Book Antiqua", serif', match: ["palatino", "book antiqua"] },
  { label: "Baskerville", stack: '"Libre Baskerville", Baskerville, Garamond, serif', match: ["baskerville", "garamond"] },
  { label: "Mono", stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", match: ["mono", "menlo", "consolas"] },
]

const SIZES = ["9", "10", "11", "12", "14", "16", "18", "24", "30", "36", "48"]

/** Document ink, not UI chrome - these have to be literal colour values. */
const INK_SWATCHES = [
  "#1b1b1b", "#4a4a4a", "#8a8a8a", "#ffffff",
  "#b02a1e", "#c2570c", "#a97400", "#1e8449",
  "#0e7490", "#1a4fbf", "#4338ca", "#8b2fb0",
]
const HILITE_SWATCHES = [
  "#fff3a3", "#d9f99d", "#a5f3fc", "#fbcfe8",
  "#ddd6fe", "#fed7aa", "#e5e7eb", "transparent",
]

type Tab = "file" | "home" | "insert" | "layout" | "view"
const TABS: { id: Tab; label: string }[] = [
  { id: "file", label: "File" },
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "layout", label: "Layout" },
  { id: "view", label: "View" },
]

type Fmt = {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  ul: boolean
  ol: boolean
  align: "left" | "center" | "right" | "justify"
  block: string
  sizePx: number
  family: string
}

const BLANK: Fmt = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
  align: "left",
  block: "p",
  sizePx: 15,
  family: "",
}

/**
 * Styling for the editable subtree. It lives in a <style> tag rather than in
 * globals.css because (a) this app owns it and (b) the global reset zeroes every
 * margin and kills list markers, so headings and bullets have to be re-taught
 * here or a document renders as one grey slab.
 */
const PAGE_CSS = `
.jpdoc-body { outline: none; }
.jpdoc-body p { margin: 0 0 var(--jpdoc-gap, 0px); min-height: 1em; }
.jpdoc-body div { margin: 0 0 var(--jpdoc-gap, 0px); }
.jpdoc-body h1 { font-size: 24pt; font-weight: 600; line-height: 1.2; margin: 16px 0 8px; }
.jpdoc-body h2 { font-size: 17pt; font-weight: 600; line-height: 1.25; margin: 14px 0 6px; }
.jpdoc-body h3 { font-size: 13.5pt; font-weight: 600; line-height: 1.3; margin: 12px 0 5px; }
.jpdoc-body ul { list-style: disc outside; padding-left: 26px; margin: 4px 0 8px; }
.jpdoc-body ol { list-style: decimal outside; padding-left: 30px; margin: 4px 0 8px; }
.jpdoc-body ul ul { list-style: circle outside; margin: 2px 0; }
.jpdoc-body ol ol { list-style: lower-alpha outside; margin: 2px 0; }
.jpdoc-body li { margin: 2px 0; }
.jpdoc-body blockquote { margin: 10px 0; padding: 2px 0 2px 14px; border-left: 3px solid ${RULE}; color: ${INK_SOFT}; font-style: italic; }
.jpdoc-body a { color: ${LINK_INK}; text-decoration: underline; }
.jpdoc-body hr { border: 0; border-top: 1px solid ${RULE}; margin: 16px 0; height: 0; }
.jpdoc-body b, .jpdoc-body strong { font-weight: 700; }
.jpdoc-body u { text-decoration: underline; }
.jpdoc-body s { text-decoration: line-through; }
.jpdoc-body > :first-child { margin-top: 0; }
.jpdoc-body ::selection { background: rgba(26, 79, 191, 0.22); }
`

export function DocsApp({ win }: { win: WindowInstance }) {
  const fileId = win.payload?.fileId as string | undefined
  const file = useFS((s) => (fileId ? s.nodes.find((n) => n.id === fileId) : undefined))
  const setTitle = useWM((s) => s.setTitle)
  const setPayload = useWM((s) => s.setPayload)

  const editorRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const ribbonRef = useRef<HTMLDivElement>(null)
  /** Which file this window's editor has already been seeded with. */
  const seededRef = useRef<string | null>(null)
  /** The caret, parked while a ribbon field (the link box) steals focus. */
  const parkedRange = useRef<Range | null>(null)

  const [tab, setTab] = useState<Tab>("home")
  const [menu, setMenu] = useState<string | null>(null)
  const [fmt, setFmt] = useState<Fmt>(BLANK)
  const [counts, setCounts] = useState({ words: 0, chars: 0 })
  const [dirty, setDirty] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [guard, setGuard] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")

  const [zoom, setZoom] = useState(100)
  const [margin, setMargin] = useState<MarginKey>("normal")
  const [spacing, setSpacing] = useState(1.5)
  const [paraGap, setParaGap] = useState(true)
  const [showRuler, setShowRuler] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [pageH, setPageH] = useState(PAGE_H)

  const z = zoom / 100

  /* ---------------------------------------------------------------- *
   * Counting and format state. Neither ever writes to the subtree.
   * ---------------------------------------------------------------- */

  const recount = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const text = (el.innerText || "").replace(/\u00a0/g, " ")
    const trimmed = text.trim()
    const words = trimmed ? trimmed.split(/\s+/).length : 0
    const chars = text.replace(/\n/g, "").length
    // Same numbers, same object - React then skips the render entirely.
    setCounts((c) => (c.words === words && c.chars === chars ? c : { words, chars }))
  }, [])

  const readFormat = useCallback(() => {
    const el = editorRef.current
    if (!el) return
    const state = (c: string) => {
      try {
        return document.queryCommandState(c)
      } catch {
        return false
      }
    }
    const value = (c: string) => {
      try {
        return document.queryCommandValue(c)
      } catch {
        return ""
      }
    }

    const sel = document.getSelection()
    const anchor = sel?.anchorNode ?? null
    const anchorEl =
      anchor && anchor.nodeType === 3 ? anchor.parentElement : (anchor as Element | null)
    let sizePx = BLANK.sizePx
    let family = ""
    if (anchorEl && el.contains(anchorEl)) {
      const cs = getComputedStyle(anchorEl)
      sizePx = Math.round(parseFloat(cs.fontSize) || BLANK.sizePx)
      family = cs.fontFamily
    }

    setFmt({
      bold: state("bold"),
      italic: state("italic"),
      underline: state("underline"),
      strike: state("strikeThrough"),
      ul: state("insertUnorderedList"),
      ol: state("insertOrderedList"),
      align: state("justifyCenter")
        ? "center"
        : state("justifyRight")
          ? "right"
          : state("justifyFull")
            ? "justify"
            : "left",
      block: (value("formatBlock") || "p").toLowerCase(),
      sizePx,
      family,
    })
  }, [])

  const markDirty = useCallback(() => {
    setDirty(true)
    setFlash(null)
    recount()
  }, [recount])

  /* ---------------------------------------------------------------- *
   * Seeding. Exactly once per file, straight into the DOM, never again.
   * ---------------------------------------------------------------- */
  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    const key = fileId ?? "__untitled__"
    if (seededRef.current === key) return
    seededRef.current = key

    // Read imperatively: subscribing to the body would re-run this on every
    // save and yank the caret back to the top of the page.
    const node = fileId ? useFS.getState().get(fileId) : undefined
    const stored = node?.body ?? ""
    const html = node?.kind === "text" ? textToHtml(stored) : sanitizeHtml(stored)
    el.innerHTML = html || "<p><br></p>"

    try {
      // Enter should make a paragraph, and b/i/u should stay semantic.
      document.execCommand("defaultParagraphSeparator", false, "p")
      document.execCommand("styleWithCSS", false, "false")
    } catch {
      /* Older engines simply keep their defaults. */
    }

    setDirty(false)
    setFlash(null)
    recount()
  }, [fileId, recount])

  /** Window title follows the file. */
  useEffect(() => {
    setTitle(win.id, `${file?.name ?? "Untitled Document"} — JP's Docs`)
  }, [file?.name, win.id, setTitle])

  /** Toolbar lights follow the caret. */
  useEffect(() => {
    const onSelect = () => {
      const el = editorRef.current
      const sel = document.getSelection()
      if (!el || !sel || sel.rangeCount === 0) return
      if (!el.contains(sel.anchorNode)) return
      readFormat()
    }
    document.addEventListener("selectionchange", onSelect)
    return () => document.removeEventListener("selectionchange", onSelect)
  }, [readFormat])

  /** The scaled page still has to reserve real scroll space. */
  useEffect(() => {
    const el = pageRef.current
    if (!el) return
    const measure = () => setPageH(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  /** Open at a zoom that fits, so a half-width window is not a keyhole. */
  useEffect(() => {
    const c = scrollRef.current
    if (!c) return
    const usable = c.clientWidth - 56
    if (usable > 0 && usable < PAGE_W) {
      setZoom(Math.max(50, Math.floor((usable / PAGE_W) * 100)))
    }
  }, [])

  /** Any click outside the ribbon closes an open ribbon dropdown. */
  useEffect(() => {
    if (!menu) return
    const onDown = (e: PointerEvent) => {
      if (!ribbonRef.current?.contains(e.target as Node)) setMenu(null)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [menu])

  useEffect(() => {
    if (!flash) return
    const t = window.setTimeout(() => setFlash(null), 2200)
    return () => window.clearTimeout(t)
  }, [flash])

  /* ---------------------------------------------------------------- *
   * Commands
   * ---------------------------------------------------------------- */

  const exec = useCallback(
    (cmd: string, value?: string, withCss = false) => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      try {
        document.execCommand("styleWithCSS", false, withCss ? "true" : "false")
        document.execCommand(cmd, false, value)
      } catch {
        /* A refused command is a no-op, not a crash. */
      }
      if (withCss) {
        try {
          document.execCommand("styleWithCSS", false, "false")
        } catch {
          /* ignore */
        }
      }
      markDirty()
      readFormat()
    },
    [markDirty, readFormat],
  )

  /**
   * execCommand still emits <font>, which the sanitizer would throw away on the
   * next save. Fold it into a <span style> immediately, then put the selection
   * back across what we just changed.
   */
  const foldFontTags = useCallback((sizeCss?: string) => {
    const el = editorRef.current
    if (!el) return
    const spans: HTMLElement[] = []
    el.querySelectorAll("font").forEach((f) => {
      const span = document.createElement("span")
      const face = f.getAttribute("face")
      const color = f.getAttribute("color")
      if (face) span.style.fontFamily = face
      if (color) span.style.color = color
      if (f.getAttribute("size") && sizeCss) span.style.fontSize = sizeCss
      while (f.firstChild) span.appendChild(f.firstChild)
      f.replaceWith(span)
      spans.push(span)
    })
    if (!spans.length) return
    const sel = document.getSelection()
    if (!sel) return
    try {
      const range = document.createRange()
      range.setStartBefore(spans[0])
      range.setEndAfter(spans[spans.length - 1])
      sel.removeAllRanges()
      sel.addRange(range)
    } catch {
      /* A collapsed caret in an odd place - leave the selection alone. */
    }
  }, [])

  const applySize = useCallback(
    (css: string) => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      try {
        document.execCommand("styleWithCSS", false, "false")
        // 7 is only a marker; the real size lands as an inline style below.
        document.execCommand("fontSize", false, "7")
      } catch {
        /* ignore */
      }
      foldFontTags(css)
      markDirty()
      readFormat()
    },
    [foldFontTags, markDirty, readFormat],
  )

  const applyFamily = useCallback(
    (stack: string) => {
      const el = editorRef.current
      if (!el) return
      el.focus()
      try {
        document.execCommand("styleWithCSS", false, "false")
        document.execCommand("fontName", false, stack)
      } catch {
        /* ignore */
      }
      foldFontTags()
      markDirty()
      readFormat()
    },
    [foldFontTags, markDirty, readFormat],
  )

  const stepSize = (delta: number) => {
    const next = Math.min(96, Math.max(8, Math.round((fmt.sizePx || 15) + delta)))
    applySize(`${next}px`)
  }

  /** The block element the caret sits in, so Styles can tune it directly. */
  const currentBlock = (): HTMLElement | null => {
    const root = editorRef.current
    const sel = document.getSelection()
    let n: Node | null = sel?.anchorNode ?? null
    while (n && root && n !== root) {
      if (n.nodeType === 1 && /^(P|H1|H2|H3|BLOCKQUOTE|DIV|LI)$/.test((n as Element).tagName)) {
        return n as HTMLElement
      }
      n = n.parentNode
    }
    return null
  }

  const applyStyle = (kind: "normal" | "h1" | "h2" | "title") => {
    exec("formatBlock", kind === "normal" ? "<p>" : kind === "h2" ? "<h2>" : "<h1>")
    const block = currentBlock()
    if (!block) return
    if (kind === "title") block.style.fontSize = "30pt"
    else block.style.removeProperty("font-size")
    markDirty()
  }

  const insertHtml = (html: string) => exec("insertHTML", sanitizeHtml(html))

  const insertSignature = () =>
    insertHtml(
      `<p><br></p><p><b>${PROFILE.name}</b></p>` +
        `<p><span style="color: ${INK_SOFT}">${PROFILE.title}</span></p>` +
        `<p><span style="color: ${INK_SOFT}">${PROFILE.email} · ${PROFILE.phone}</span></p>`,
    )

  const insertDate = () =>
    exec(
      "insertText",
      new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
    )

  const parkCaret = () => {
    const sel = document.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      parkedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    setLinkOpen(false)
    setLinkUrl("")
    if (!url) return
    const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url}`
    const el = editorRef.current
    const sel = document.getSelection()
    if (!el || !sel) return
    el.focus()
    if (parkedRange.current) {
      sel.removeAllRanges()
      sel.addRange(parkedRange.current)
    }
    if (sel.isCollapsed) {
      insertHtml(`<a href="${href.replace(/"/g, "%22")}">${href.replace(/</g, "&lt;")}</a>`)
      return
    }
    exec("createLink", href)
    // Keep a live link from navigating the whole desktop away.
    el.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank")
      a.setAttribute("rel", "noopener noreferrer")
    })
  }

  /* ---------------------------------------------------------------- *
   * Paste, drop, keys
   * ---------------------------------------------------------------- */

  const onPaste = (e: RClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const html = e.clipboardData.getData("text/html")
    const text = e.clipboardData.getData("text/plain")
    const clean = html ? sanitizeHtml(html) : ""
    try {
      if (clean) document.execCommand("insertHTML", false, clean)
      else if (text) document.execCommand("insertText", false, text)
    } catch {
      /* ignore */
    }
    markDirty()
    readFormat()
  }

  const onDrop = (e: RDragEvent<HTMLDivElement>) => {
    // Dropped markup never gets a free pass into the document.
    e.preventDefault()
    const text = e.dataTransfer.getData("text/plain")
    if (!text) return
    try {
      document.execCommand("insertText", false, text)
    } catch {
      /* ignore */
    }
    markDirty()
  }

  /* ---------------------------------------------------------------- *
   * Saving
   * ---------------------------------------------------------------- */

  const currentHtml = () => sanitizeHtml(editorRef.current?.innerHTML ?? "")

  /**
   * A .txt opened in Docs goes back to disk as text, not as markup - otherwise
   * the copy you make of Readme.txt would open in Notepad full of raw tags.
   * Documents (.jpdoc) round-trip as sanitized HTML.
   */
  const isPlain = file?.kind === "text"
  const serialize = () => (isPlain ? (editorRef.current?.innerText ?? "") : currentHtml())

  const adopt = (id: string, note: string) => {
    const name = useFS.getState().get(id)?.name ?? "Untitled Document"
    setPayload(win.id, { fileId: id })
    setTitle(win.id, `${name} — JP's Docs`)
    setDirty(false)
    setFlash(note)
  }

  const save = () => {
    const html = serialize()
    const fs = useFS.getState()

    if (!fileId) {
      const id = fs.create("doc", null, "Untitled Document.jpdoc", { body: html })
      adopt(id, "Saved to Desktop")
      return
    }

    const res = fs.setBody(fileId, html)
    if (res.ok) {
      setDirty(false)
      setFlash("Saved")
      return
    }
    if (res.reason === "locked") {
      playSfx("error")
      setGuard(true)
      return
    }
    // The file went to the bin while this window had it open - keep the work.
    const id = fs.create("doc", null, "Recovered Document.jpdoc", { body: html })
    adopt(id, "Recovered to Desktop")
  }

  const saveCopy = () => {
    if (!fileId) {
      save()
      setGuard(false)
      return
    }
    const res = useFS.getState().saveCopy(fileId, serialize())
    setGuard(false)
    if (res.ok && res.id) adopt(res.id, "Copy saved")
  }

  const newDocument = () => {
    const id = useFS.getState().create("doc", null, "Untitled Document.jpdoc", {
      body: "<p><br></p>",
    })
    adopt(id, "New document")
  }

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab" && editorRef.current?.contains(e.target as Node)) {
      e.preventDefault()
      exec(e.shiftKey ? "outdent" : "indent")
      return
    }
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === "s") {
      e.preventDefault()
      save()
    } else if (k === "b" || k === "i" || k === "u" || k === "z" || k === "y") {
      // The browser handles these natively (and Ctrl+Z needs it to) - just
      // re-read the state once the command has landed.
      markDirty()
      window.setTimeout(readFormat, 0)
    }
  }

  const fitWidth = () => {
    const c = scrollRef.current
    if (!c) return
    setZoom(Math.max(50, Math.min(200, Math.floor(((c.clientWidth - 56) / PAGE_W) * 100))))
  }

  /* ---------------------------------------------------------------- *
   * Render
   * ---------------------------------------------------------------- */

  const m = MARGINS[margin]
  const famLower = fmt.family.toLowerCase()
  const familyLabel =
    FONTS.find((f) => famLower && f.match.some((needle) => famLower.includes(needle)))?.label ??
    FONTS[0].label
  const sizeLabel = String(Math.round(fmt.sizePx * 0.75)) // px → pt, for display

  const pageStyle: CSSProperties = {
    width: PAGE_W,
    minHeight: PAGE_H,
    padding: `${m.y}px ${m.x}px`,
    background: PAPER,
    color: INK,
    fontFamily: FONTS[0].stack,
    fontSize: "11.5pt",
    lineHeight: spacing,
    transform: `scale(${z})`,
    transformOrigin: "top left",
    boxShadow: "0 12px 40px rgba(0,0,0,.30), 0 2px 8px rgba(0,0,0,.18)",
    borderRadius: 2,
    ["--jpdoc-gap" as string]: paraGap ? "10px" : "0px",
  } as CSSProperties

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      style={{ background: "var(--os-window)" }}
      onKeyDown={onKeyDown}
    >
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* ---------- Tab strip + quick access ---------- */}
      <div
        className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
        style={{ borderColor: "var(--os-border)", background: "var(--os-chrome)" }}
      >
        <Tool icon={<Save size={15} />} label="Save (Ctrl+S)" onPress={save} />
        <Tool icon={<Undo2 size={15} />} label="Undo" onPress={() => exec("undo")} />
        <Tool icon={<Redo2 size={15} />} label="Redo" onPress={() => exec("redo")} />
        <span className="mx-1 h-5 w-px" style={{ background: "var(--os-border)" }} />

        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setTab(t.id)
              setMenu(null)
              setFocusMode(false)
            }}
            className={`rounded-md px-3 py-[5px] text-[12.5px] transition-colors ${
              tab === t.id ? "" : "hover:bg-[var(--os-hover)]"
            }`}
            style={
              tab === t.id
                ? { background: "var(--os-active)", color: "var(--os-fg)", fontWeight: 600 }
                : { color: "var(--os-muted)" }
            }
          >
            {t.label}
          </button>
        ))}

        <span className="ml-auto flex items-center gap-2 pr-1 text-[11px]">
          {file?.locked && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
              style={{ background: "var(--os-hover)", color: "var(--os-muted)" }}
            >
              <Lock size={10} /> Original
            </span>
          )}
          <span style={{ color: flash ? "var(--os-accent-fg)" : "var(--os-muted)" }}>
            {flash ?? (dirty ? "Unsaved changes" : "All changes saved")}
          </span>
        </span>
      </div>

      {/* ---------- Ribbon ---------- */}
      {!focusMode && (
        <div
          ref={ribbonRef}
          className="os-scroll flex shrink-0 items-stretch overflow-x-auto border-b py-1.5"
          style={{
            borderColor: "var(--os-border)",
            background: "var(--os-chrome)",
            minHeight: 78,
          }}
        >
          {tab === "home" && (
            <>
              <Group label="Font">
                <Dropdown
                  id="family"
                  open={menu === "family"}
                  onToggle={() => setMenu(menu === "family" ? null : "family")}
                  width={168}
                  trigger={<span className="w-[92px] truncate text-left">{familyLabel}</span>}
                >
                  {FONTS.map((f) => (
                    <MenuItem
                      key={f.label}
                      selected={familyLabel === f.label}
                      onSelect={() => {
                        setMenu(null)
                        applyFamily(f.stack)
                      }}
                    >
                      <span style={{ fontFamily: f.stack }}>{f.label}</span>
                    </MenuItem>
                  ))}
                </Dropdown>

                <Dropdown
                  id="size"
                  open={menu === "size"}
                  onToggle={() => setMenu(menu === "size" ? null : "size")}
                  width={86}
                  trigger={<span className="w-[26px] text-left tabular-nums">{sizeLabel}</span>}
                >
                  {SIZES.map((s) => (
                    <MenuItem
                      key={s}
                      selected={sizeLabel === s}
                      onSelect={() => {
                        setMenu(null)
                        applySize(`${s}pt`)
                      }}
                    >
                      <span className="tabular-nums">{s}</span>
                    </MenuItem>
                  ))}
                </Dropdown>

                <Tool icon={<Glyph big />} label="Grow text" onPress={() => stepSize(2)} />
                <Tool icon={<Glyph />} label="Shrink text" onPress={() => stepSize(-2)} />

                <Sep />

                <Tool icon={<Bold size={15} />} label="Bold (Ctrl+B)" active={fmt.bold} onPress={() => exec("bold")} />
                <Tool icon={<Italic size={15} />} label="Italic (Ctrl+I)" active={fmt.italic} onPress={() => exec("italic")} />
                <Tool icon={<Underline size={15} />} label="Underline (Ctrl+U)" active={fmt.underline} onPress={() => exec("underline")} />
                <Tool icon={<Strikethrough size={15} />} label="Strikethrough" active={fmt.strike} onPress={() => exec("strikeThrough")} />

                <Swatches
                  id="ink"
                  open={menu === "ink"}
                  onToggle={() => setMenu(menu === "ink" ? null : "ink")}
                  icon={<Baseline size={15} />}
                  label="Text colour"
                  colors={INK_SWATCHES}
                  onPick={(c) => {
                    setMenu(null)
                    exec("foreColor", c, true)
                  }}
                />
                <Swatches
                  id="hilite"
                  open={menu === "hilite"}
                  onToggle={() => setMenu(menu === "hilite" ? null : "hilite")}
                  icon={<Highlighter size={15} />}
                  label="Highlight"
                  colors={HILITE_SWATCHES}
                  onPick={(c) => {
                    setMenu(null)
                    exec("hiliteColor", c, true)
                  }}
                />
              </Group>

              <Sep tall />

              <Group label="Paragraph">
                <Tool icon={<List size={15} />} label="Bullets" active={fmt.ul} onPress={() => exec("insertUnorderedList")} />
                <Tool icon={<ListOrdered size={15} />} label="Numbering" active={fmt.ol} onPress={() => exec("insertOrderedList")} />
                <Tool icon={<IndentDecrease size={15} />} label="Decrease indent" onPress={() => exec("outdent")} />
                <Tool icon={<IndentIncrease size={15} />} label="Increase indent" onPress={() => exec("indent")} />
                <Sep />
                <Tool icon={<AlignLeft size={15} />} label="Align left" active={fmt.align === "left"} onPress={() => exec("justifyLeft")} />
                <Tool icon={<AlignCenter size={15} />} label="Align centre" active={fmt.align === "center"} onPress={() => exec("justifyCenter")} />
                <Tool icon={<AlignRight size={15} />} label="Align right" active={fmt.align === "right"} onPress={() => exec("justifyRight")} />
                <Tool icon={<AlignJustify size={15} />} label="Justify" active={fmt.align === "justify"} onPress={() => exec("justifyFull")} />
              </Group>

              <Sep tall />

              <Group label="Styles">
                <StyleChip label="Normal" size={12} active={fmt.block === "p" || fmt.block === "div"} onPress={() => applyStyle("normal")} />
                <StyleChip label="Heading 1" size={14} weight={600} active={fmt.block === "h1"} onPress={() => applyStyle("h1")} />
                <StyleChip label="Heading 2" size={13} weight={600} active={fmt.block === "h2"} onPress={() => applyStyle("h2")} />
                <StyleChip label="Title" size={16} weight={700} onPress={() => applyStyle("title")} />
              </Group>
            </>
          )}

          {tab === "file" && (
            <>
              <Group label="Document">
                <WideTool icon={<Save size={16} />} label="Save" hint="Ctrl+S" onPress={save} />
                <WideTool icon={<Copy size={16} />} label="Save a copy" onPress={saveCopy} />
                <WideTool icon={<FilePlus2 size={16} />} label="New" onPress={newDocument} />
              </Group>
              <Sep tall />
              <Group label="About this file">
                <div className="px-1 text-[11.5px] leading-[1.6]" style={{ color: "var(--os-muted)" }}>
                  <div style={{ color: "var(--os-fg)" }}>{file?.name ?? "Untitled Document"}</div>
                  <div>
                    {counts.words} words · {counts.chars} characters
                  </div>
                  <div>
                    {file?.locked
                      ? "One of Johnpaul's originals — editable, copyable, not overwritable."
                      : dirty
                        ? "Edited since the last save."
                        : "Saved in this browser."}
                  </div>
                </div>
              </Group>
            </>
          )}

          {tab === "insert" && (
            <>
              <Group label="Blocks">
                <WideTool icon={<Minus size={16} />} label="Divider" onPress={() => exec("insertHorizontalRule")} />
                <WideTool icon={<Quote size={16} />} label="Quote" onPress={() => exec("formatBlock", "<blockquote>")} />
              </Group>
              <Sep tall />
              <Group label="Text">
                <WideTool icon={<CalendarDays size={16} />} label="Today's date" onPress={insertDate} />
                <WideTool icon={<PenLine size={16} />} label="Signature" onPress={insertSignature} />
              </Group>
              <Sep tall />
              <Group label="Link">
                {linkOpen ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyLink()
                        if (e.key === "Escape") setLinkOpen(false)
                      }}
                      placeholder="https://…"
                      className="h-8 w-[180px] rounded-md px-2 text-[12px] outline-none"
                      style={{
                        background: "var(--os-input)",
                        border: "1px solid var(--os-border)",
                        color: "var(--os-fg)",
                      }}
                    />
                    <Tool icon={<Check size={15} />} label="Apply link" onPress={applyLink} />
                  </div>
                ) : (
                  <WideTool
                    icon={<Link2 size={16} />}
                    label="Insert link"
                    onPress={() => {
                      parkCaret()
                      setLinkOpen(true)
                    }}
                  />
                )}
              </Group>
            </>
          )}

          {tab === "layout" && (
            <>
              <Group label="Margins">
                {(Object.keys(MARGINS) as MarginKey[]).map((k) => (
                  <StyleChip
                    key={k}
                    label={MARGINS[k].label}
                    size={12}
                    active={margin === k}
                    onPress={() => setMargin(k)}
                  />
                ))}
              </Group>
              <Sep tall />
              <Group label="Line spacing">
                {[1, 1.15, 1.5, 2].map((v) => (
                  <StyleChip
                    key={v}
                    label={v.toFixed(2).replace(/0$/, "").replace(/\.$/, "")}
                    size={12}
                    active={spacing === v}
                    onPress={() => setSpacing(v)}
                  />
                ))}
              </Group>
              <Sep tall />
              <Group label="Paragraphs">
                <StyleChip
                  label={paraGap ? "Space after: on" : "Space after: off"}
                  size={12}
                  active={paraGap}
                  onPress={() => setParaGap(!paraGap)}
                />
              </Group>
            </>
          )}

          {tab === "view" && (
            <>
              <Group label="Zoom">
                {[75, 100, 125, 150].map((v) => (
                  <StyleChip key={v} label={`${v}%`} size={12} active={zoom === v} onPress={() => setZoom(v)} />
                ))}
                <StyleChip label="Fit width" size={12} onPress={fitWidth} />
              </Group>
              <Sep tall />
              <Group label="Show">
                <StyleChip label="Ruler" size={12} active={showRuler} onPress={() => setShowRuler(!showRuler)} />
                <StyleChip label="Focus mode" size={12} onPress={() => setFocusMode(true)} />
              </Group>
            </>
          )}
        </div>
      )}

      {focusMode && (
        <button
          type="button"
          onClick={() => setFocusMode(false)}
          className="shrink-0 border-b py-1 text-[11px] transition-colors hover:bg-[var(--os-hover)]"
          style={{ borderColor: "var(--os-border)", color: "var(--os-muted)", background: "var(--os-chrome)" }}
        >
          Focus mode — click to bring the ribbon back
        </button>
      )}

      {/* ---------- The page ---------- */}
      <div
        ref={scrollRef}
        className="os-scroll min-h-0 flex-1 overflow-auto"
        style={{ background: "var(--os-surface)" }}
      >
        <div className="flex min-w-max flex-col items-center px-7 py-7">
          {showRuler && (
            <div
              className="mb-3 h-[18px] shrink-0 rounded-[3px]"
              style={{
                width: PAGE_W * z,
                backgroundColor: "var(--os-card)",
                border: "1px solid var(--os-border)",
                backgroundImage: `repeating-linear-gradient(90deg, var(--os-border) 0 1px, transparent 1px ${
                  (96 * z) / 8
                }px)`,
              }}
            />
          )}

          {/* Spacer reserves the *scaled* footprint so scrolling stays honest. */}
          <div style={{ width: PAGE_W * z, height: pageH * z }}>
            <div ref={pageRef} style={pageStyle}>
              <div
                key={fileId ?? "untitled"}
                ref={editorRef}
                className="jpdoc-body"
                contentEditable
                spellCheck
                role="textbox"
                aria-multiline="true"
                aria-label="Document body"
                onInput={markDirty}
                onPaste={onPaste}
                onDrop={onDrop}
                onKeyUp={readFormat}
                onMouseUp={readFormat}
                style={{ minHeight: PAGE_H - m.y * 2 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Status bar ---------- */}
      <div
        className="flex shrink-0 items-center gap-4 border-t px-3 py-1 text-[11px]"
        style={{
          borderColor: "var(--os-border)",
          background: "var(--os-chrome)",
          color: "var(--os-muted)",
        }}
      >
        <span className="truncate">{file?.name ?? "Untitled Document"}</span>
        <span className="tabular-nums">{counts.words} words</span>
        <span className="tabular-nums">{counts.chars} characters</span>
        {isPlain && <span>Plain text file — formatting is not saved</span>}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            aria-label="Zoom out"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setZoom(Math.max(50, zoom - 10))}
            className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <ZoomOut size={13} />
          </button>
          <div className="w-[120px]">
            <Slider value={zoom} min={50} max={200} step={5} onChange={setZoom} label="Zoom" />
          </div>
          <button
            type="button"
            aria-label="Zoom in"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setZoom(Math.min(200, zoom + 10))}
            className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: "var(--os-fg)" }}
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setZoom(100)}
            title="Reset zoom"
            className="w-[42px] rounded px-1 text-right tabular-nums transition-colors hover:bg-[var(--os-hover)]"
          >
            {zoom}%
          </button>
          <button
            type="button"
            aria-label="Toggle ruler"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowRuler(!showRuler)}
            className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-[var(--os-hover)]"
            style={{ color: showRuler ? "var(--os-accent-fg)" : "var(--os-muted)" }}
          >
            <Ruler size={13} />
          </button>
        </div>
      </div>

      {/* ---------- The "these are my words" dialog ---------- */}
      {guard && <SaveGuard onCopy={saveCopy} onDismiss={() => setGuard(false)} />}
    </div>
  )
}

/* ==================================================================== *
 * Ribbon pieces
 * ==================================================================== */

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col justify-between px-3">
      <div className="flex flex-1 items-center gap-0.5">{children}</div>
      <span className="pt-1 text-center text-[10px] leading-none" style={{ color: "var(--os-muted)" }}>
        {label}
      </span>
    </div>
  )
}

function Sep({ tall }: { tall?: boolean }) {
  return (
    <span
      className={`mx-1 w-px shrink-0 ${tall ? "my-1 self-stretch" : "h-5"}`}
      style={{ background: "var(--os-border)" }}
    />
  )
}

function Tool({
  icon,
  label,
  active,
  onPress,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      // Without this the selection is gone before the command runs.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-md transition-colors ${
        active ? "" : "hover:bg-[var(--os-hover)]"
      }`}
      style={{
        color: active ? "var(--os-accent-fg)" : "var(--os-fg)",
        background: active ? "var(--os-accent-soft)" : "transparent",
      }}
    >
      {icon}
    </button>
  )
}

function WideTool({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: ReactNode
  label: string
  hint?: string
  onPress: () => void
}) {
  return (
    <button
      type="button"
      title={hint ? `${label} (${hint})` : label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className="flex h-12 w-[74px] shrink-0 flex-col items-center justify-center gap-1 rounded-md px-1 transition-colors hover:bg-[var(--os-hover)]"
      style={{ color: "var(--os-fg)" }}
    >
      {icon}
      <span className="w-full truncate text-center text-[10.5px] leading-none">{label}</span>
    </button>
  )
}

function StyleChip({
  label,
  size,
  weight,
  active,
  onPress,
}: {
  label: string
  size: number
  weight?: number
  active?: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      className={`flex h-11 shrink-0 items-center rounded-md px-3 transition-colors ${
        active ? "" : "hover:bg-[var(--os-hover)]"
      }`}
      style={{
        border: `1px solid ${active ? "var(--os-accent)" : "var(--os-border)"}`,
        background: active ? "var(--os-accent-soft)" : "var(--os-card)",
        color: "var(--os-fg)",
        fontSize: size,
        fontWeight: weight ?? 400,
      }}
    >
      {label}
    </button>
  )
}

/** The A-with-arrows pair for grow/shrink, drawn rather than imported. */
function Glyph({ big }: { big?: boolean }) {
  return (
    <span className="flex items-baseline gap-[1px]" style={{ lineHeight: 1 }}>
      <span style={{ fontSize: big ? 15 : 13, fontWeight: 600 }}>A</span>
      <span style={{ fontSize: 9, opacity: 0.7 }}>{big ? "▲" : "▼"}</span>
    </span>
  )
}

function Dropdown({
  id,
  open,
  onToggle,
  trigger,
  width,
  children,
}: {
  id: string
  open: boolean
  onToggle: () => void
  trigger: ReactNode
  width: number
  children: ReactNode
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={id}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className="flex h-8 items-center gap-1 rounded-md px-2 text-[12px] transition-colors hover:bg-[var(--os-hover)]"
        style={{
          border: "1px solid var(--os-border)",
          background: "var(--os-input)",
          color: "var(--os-fg)",
        }}
      >
        {trigger}
        <ChevronDown size={12} style={{ color: "var(--os-muted)" }} />
      </button>
      {open && (
        <div
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
          className="os-scroll absolute left-0 top-full z-50 mt-1 max-h-[260px] overflow-y-auto rounded-lg p-1 shadow-2xl"
          style={{
            width,
            background: "var(--os-menu)",
            border: "1px solid var(--os-border)",
            backdropFilter: "blur(28px)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  selected,
  onSelect,
  children,
}: {
  selected?: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left text-[12.5px] transition-colors hover:bg-[var(--os-hover)]"
      style={{ color: "var(--os-fg)", background: selected ? "var(--os-active)" : "transparent" }}
    >
      <span className="w-3 shrink-0" style={{ color: "var(--os-accent-fg)" }}>
        {selected && <Check size={12} />}
      </span>
      {children}
    </button>
  )
}

function Swatches({
  id,
  open,
  onToggle,
  icon,
  label,
  colors,
  onPick,
}: {
  id: string
  open: boolean
  onToggle: () => void
  icon: ReactNode
  label: string
  colors: string[]
  onPick: (color: string) => void
}) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onToggle}
        className="flex h-8 items-center gap-0.5 rounded-md px-1.5 transition-colors hover:bg-[var(--os-hover)]"
        style={{ color: "var(--os-fg)" }}
      >
        {icon}
        <ChevronDown size={11} style={{ color: "var(--os-muted)" }} />
      </button>
      {open && (
        <div
          onMouseDown={(e) => e.preventDefault()}
          className="absolute left-0 top-full z-50 mt-1 grid grid-cols-4 gap-1.5 rounded-lg p-2 shadow-2xl"
          style={{
            background: "var(--os-menu)",
            border: "1px solid var(--os-border)",
            backdropFilter: "blur(28px)",
          }}
        >
          {colors.map((c) => (
            <button
              key={`${id}-${c}`}
              type="button"
              title={c === "transparent" ? "No colour" : c}
              aria-label={c === "transparent" ? "No colour" : c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              className="h-5 w-5 rounded transition-transform hover:scale-110"
              style={{
                background:
                  c === "transparent"
                    ? "repeating-conic-gradient(var(--os-hover) 0% 25%, transparent 0% 50%) 50% / 8px 8px"
                    : c,
                border: "1px solid var(--os-border)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ==================================================================== *
 * The refusal, made friendly
 * ==================================================================== */

function SaveGuard({ onCopy, onDismiss }: { onCopy: () => void; onDismiss: () => void }) {
  return (
    <div
      className="absolute inset-0 z-[60] grid place-items-center p-6"
      style={{ background: "var(--os-scrim)", backdropFilter: "blur(2px)" }}
      onPointerDown={onDismiss}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="This one stays in my words"
        onPointerDown={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-xl p-5 shadow-2xl"
        style={{
          background: "var(--os-menu)",
          border: "1px solid var(--os-border)",
          backdropFilter: "blur(30px)",
        }}
      >
        <div className="mb-3 flex items-center gap-2.5">
          <span
            className="grid h-9 w-9 place-items-center rounded-lg"
            style={{ background: "var(--os-accent-soft)", color: "var(--os-accent-fg)" }}
          >
            <Lock size={17} />
          </span>
          <h2 className="text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
            Let me be the one to say it
          </h2>
        </div>

        <p className="text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          Genuinely glad you are enjoying editing my words — that is the whole point of a desktop you
          can actually use. This page is my introduction though, so I would like to be the one who
          tells them who I am.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
          Take a copy and it is yours: rewrite it, improve it, give me a much better job title. Your
          version saves normally and stays on the Desktop.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md px-4 py-[7px] text-[13px] font-medium transition-colors hover:bg-[var(--os-hover)]"
            style={{
              background: "var(--os-card)",
              border: "1px solid var(--os-border)",
              color: "var(--os-fg)",
            }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-md px-4 py-[7px] text-[13px] font-medium transition-transform active:scale-[.98]"
            style={{
              background: "var(--os-accent)",
              color: "var(--os-on-accent)",
              border: "1px solid transparent",
            }}
          >
            Save a copy
          </button>
        </div>
      </div>
    </div>
  )
}
