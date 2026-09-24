# Portfolio OS — how it works

A build document for **Johnpaul K Reju's** portfolio: what exists, how each piece
is put together, and the reasoning behind the decisions that aren't obvious.

**Scale:** 54 source files · ~17,300 lines · **5 runtime dependencies**
(`next`, `react`, `react-dom`, `lucide-react`, `zustand`) · 128 kB First Load JS.

No UI kit. No animation library. No editor framework. No game engine. Every window,
menu, slider, card, game board and media control here is written from scratch.

---

## 1. The concept

Most developer portfolios are a scrolling page with sections. They *claim* the
person can build software and ask you to take it on faith.

This one is the proof instead. A desktop environment is a genuinely hard UI
problem — overlapping windows, z-order, drag and resize, focus, a filesystem,
context menus, two input models — and building one that feels right *is* the
portfolio. The content lives inside it as apps, so reading about the work and
experiencing the work are the same act.

Two rules held throughout:

1. **Nothing is a picture of itself.** Windows really drag and resize. The
   filesystem really stores files and they survive a reload. The terminal really
   has a working directory. If it looks interactive, it is.
2. **Nothing is borrowed.** No Microsoft, Google or VideoLAN assets — no Windows
   flag, no Chrome dinosaur, no VLC traffic cone, no Segoe fonts, no real Windows
   sounds. Every mark here was drawn for this project. See §11.

---

## 2. Running it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # type errors and lint failures fail the build
pnpm typecheck
pnpm lint
```

Resize below **768px** to switch from the Windows shell to the Android shell.

---

## 3. The boot sequence

`page load → power screen → boot screen → desktop`

### Why there's a power button

This is the one place the product shape was dictated by browser policy, so it's
worth explaining rather than hiding.

`Element.requestFullscreen()` **requires a transient user gesture**. So does
audible playback — `audio.play()` rejects with `NotAllowedError` without one.
Page load, `DOMContentLoaded` and timers do not count. **No website can
auto-fullscreen or auto-play sound on load.** Building it optimistically fails
silently and burns hours.

Both needs collapse into a single click, so the page opens on a dark screen with
a glowing power button. One press:

1. unlocks audio (`unlockAudio()`),
2. starts the boot chime,
3. requests fullscreen — **in that order**, because `requestFullscreen` is treated
   as consuming the activation while `play()` is not,
4. moves the machine to `booting`.

Fullscreen is a **pre-checked opt-in**, never forced — a recruiter arriving from
LinkedIn expects a web page, and silently stripping browser chrome triggers
Chrome's unsuppressible "…is now full screen" toast, which reads as ad-tech.

The checkbox only appears when `document.fullscreenEnabled` is true. That's a
*capability* check, not UA sniffing — it correctly excludes iPhone (which has no
element fullscreen at all) without mis-detecting iPad, whose UA reports as macOS.

### The boot screen

Five staged messages, an orbiting five-dot spinner, and an original four-pane
mark (`PaneMark`) — not the Windows flag.

Timing is **synced to the audio**: the chime is ~4.95s, so the screen holds until
4.1s, then cross-fades over 880ms with a slight scale-up while the desktop eases
in behind it (`shell-entering`). Before this was tuned the boot finished at 2.9s
and cut the sound off mid-note.

`prefers-reduced-motion` skips the sequence entirely.

### Power states

`lib/os/power-store.ts` — a seven-state machine with an explicit transition table
that **no-ops illegal edges** rather than throwing:

```
off → booting → running → { locked | sleeping | restarting | shuttingDown }
sleeping → locked          (Windows wakes to the lock screen, never the desktop)
shuttingDown → off         (back to the power button)
```

One module-level timer handle, cleared on every transition, so double-clicking
Restart can't schedule two hand-offs.

**The desktop stays mounted underneath the overlay.** That's the whole reason
locking or sleeping never loses an open window.

Start ▸ Power offers Sleep / Shut down / Restart for real. The lock screen shows
a big clock, then reveals a sign-in card on any click — any password works, and it
says so.

---

## 4. Architecture

One route. Two shells. One set of apps.

```
app/page.tsx                    picks a shell from a media query, mounts PowerOverlay
│
├── components/os/desktop/      Windows 11 shell
│     desktop-shell             wallpaper · icons · windows · taskbar · flyouts
│     window-frame              drag · 8-way resize · snap · title bar · dialog chrome
│     taskbar · start-menu · quick-settings · notification-center
│     desktop-icons · context-menu
│
├── components/os/power/        power-overlay: power / boot / lock / sleep / shutdown
├── components/os/mobile/       phone-shell: Android status bar, grid, drawer, nav
│
├── components/os/app-host      maps an AppId to its component (code-split)
├── components/os/apps/         21 apps — shared by BOTH shells
│
└── lib/os/
      content.ts                all portfolio data — single source of truth
      types.ts                  AppId, WindowInstance, FSNode
      app-meta.ts               app registry: title, icon, size, chrome, pinned
      wm-store.ts               window manager
      fs-store.ts               virtual filesystem
      system-store.ts           network · display · audio · accessibility
      notify-store.ts           toasts + notification centre
      power-store.ts            the power state machine
      sfx.ts                    system sounds
      sanitize-html.ts          HTML allowlist for the Docs app
      use-fullscreen.ts         fullscreen capability + enter/exit
```

### Three decisions that carried the design

**Content is data, not markup.** Every project, skill and timeline entry lives in
`lib/os/content.ts`. The apps, the Terminal, the Resume, the search engine and the
chatbot all render from it — so a fact is written once and can never drift.

**Apps don't know which shell they're in.** An app is just a component. The desktop
wraps it in a `WindowFrame`; the phone wraps it in a fullscreen surface and hands it
a stub window object. One file plus one registry entry adds an app to both.

**Gestures stay local until they finish.** Dragging a window updates local component
state and only commits to the store on release. Nothing else re-renders mid-drag.

---

## 5. The window manager

`lib/os/wm-store.ts` holds `windows[]`, each with
`pos · size · restore · minimized · maximized · snapped · z`.

- **Drag** by title bar, with a 4px threshold so a click never becomes a move.
- **Resize** from all 8 edges and corners, with minimum sizes.
- **Snap**: drag to the top to maximize, to either side for a half — with a live
  translucent preview before you drop. Dragging a maximized window tears it loose
  cursor-relative.
- **Z-order** on click, per-window taskbar buttons, double-click title to maximize.
- **Dialog chrome** (`chrome: "dialog"` in the registry) suppresses resize handles,
  minimize/maximize and title double-click — used by the Welcome popup.

### Three bugs worth recording

**Windows could climb over the taskbar.** `topZ` increments unbounded on every
focus, and the window layer was `position:absolute; z-index:auto`, which creates
*no stacking context* — so window z-indexes competed globally with the taskbar
(100) and menus (200). After ~90 focus clicks, windows rendered on top of the
taskbar. Fixed with `isolation: isolate` on the window layer, which scopes them
permanently regardless of value.

**Double-click-to-maximize silently didn't work.** Two causes. `setPointerCapture`
on `pointerdown` makes Chromium swallow the follow-up `dblclick`; capture is now
taken only after the drag threshold. And the drag-shield overlay was gated on
`gesture.current`, which is set on mere pointerdown — so `focus()` re-rendered, the
shield covered the title bar, and every subsequent event landed on it. It's now
gated on an actually-active gesture.

**Maximized windows kept a stale size on browser resize.** `setBounds` only clamped
position. It now re-lays-out maximized and snapped windows, so Restore behaves.

---

## 6. The taskbar and tray

Centered, acrylic, 48px. Start button, search, pinned apps, then any running app
that isn't pinned. Running apps get an underline; the focused one gets a wider pill.

**Notification area**, left to right: hidden-icons chevron · the clustered
network/volume/battery button · clock over date · notification bell with an unread
badge.

The network glyph reflects real state — connected, disconnected, or an aeroplane
under airplane mode.

> The cluster used to toggle the colour theme, which is nothing like Windows. It's
> now the Quick Settings trigger, and the theme moved to a Quick Settings tile.

---

## 7. Quick Settings

`components/os/desktop/quick-settings.tsx` — a 360px flyout anchored above the tray.

**Nine tiles, 3×3:** Wi-Fi (split) · Bluetooth · Airplane mode / Night light ·
Do not disturb · Accessibility (split) / Mobile hotspot · Battery saver · Theme.

Split tiles are **two sibling buttons in a wrapper**, never a button inside a
button — nested buttons are invalid HTML and break keyboard and screen-reader
navigation. Every tile carries an `aria-label`, because the visible label is a
sibling span and a screen reader would otherwise announce an unlabeled switch.

**Both sliders are real drag controls** (`components/os/ui/slider.tsx`): pointer
capture, click-anywhere-to-jump, arrow keys, PageUp/Down, Home/End, correct
`role="slider"` with `aria-valuenow`.

They do real work, not decoration:

- **Brightness** drives a black overlay at `z-8999`, floored at 20 so you can't
  black out the screen irrecoverably.
- **Volume** sets actual playback volume for every system sound.
- **Night light** is a `mix-blend-mode: multiply` tint at `z-9000` with a
  Kelvin-derived colour.
- **Colour filter** is a CSS `filter` on `documentElement` **only** — a filter on
  any other ancestor becomes the containing block for `position:fixed` descendants
  and would break every context menu and flyout in the app.

**Airplane mode** follows Windows: it kills Wi-Fi *and* Bluetooth, greys Mobile
hotspot, swaps the tray glyph, remembers what was on so switching it off restores
exactly that — and you can still re-enable Wi-Fi independently while it stays on.

The Wi-Fi chevron opens a sub-page listing networks with signal bars and padlocks,
a connect flow that passes through "Checking network requirements…", and
Connected/Disconnect states.

---

## 8. Notifications

`lib/os/notify-store.ts` + `components/os/toast-host.tsx`.

Toasts appear bottom-right and auto-dismiss in **4 seconds** (your spec; Windows
defaults to 5). 4s is below the accessibility floor for auto-dismissing messages,
so it ships with three mitigations that make it safe:

- the **whole stack pauses** on hover or focus and resumes on leave,
- every toast keeps a **permanent copy in the Notification Center**,
- focus is never moved to a toast.

Dismissal runs off **one 250ms tick against an absolute `expiresAt`**, never a
per-toast `setTimeout` — which drifts, double-fires under React StrictMode in dev,
and can't be paused. A `visibilitychange` listener re-settles after a backgrounded
tab throttles timers.

Do Not Disturb suppresses the popup but never the record.

---

## 9. The desktop surface

- Icons in a column-flow grid, single-click select, double-click open.
- **F2** renames inline (with the extension left out of the initial selection, as
  Explorer does), **Delete** bins.
- **Right-click the wallpaper**: New ▸ Folder / Text Document · Refresh · theme ·
  Personalise · Display settings.
- **Right-click a file**: Open · Rename · Delete.

### Refresh

Right-click ▸ Refresh, or **F5**, repaints the icon layer: a hard cut to invisible
for 60ms, then a 90ms ease back — 150ms total. Below ~35ms nobody sees it; above
~120ms it stops reading as a repaint and starts reading as a bug.

> This used to call `window.location.reload()`. That one line would have dropped
> fullscreen, lost the unlocked audio, wiped every open window and every unsaved
> buffer, and bounced the visitor back to the power screen. It was the
> highest-cost line in the project.

Under `prefers-reduced-motion` the blank is skipped entirely — a 60ms full-screen
flash is exactly the kind that harms photosensitive users, and the blanket CSS
rule doesn't cover a JS-driven opacity change.

---

## 10. The apps

21 apps. The ten heaviest are **code-split** behind `next/dynamic` and load on
first open — that's the difference between 191 kB and 128 kB First Load.

### Content apps
| App | Notes |
|---|---|
| **About Me** | Profile, what I bring, contact rows |
| **Projects** | File-Explorer-style: category sidebar, search, grid/list, details pane |
| **Experience** | Work and education timeline |
| **Skills** | Task-Manager-style meters that animate up on open |
| **Awards**, **Lab** | Certifications · experiments in progress |
| **Contact** | Mail-client compose; sending hands off to the visitor's own mail app |
| **Resume** | A document in PDF-viewer chrome; prints to real PDF |

### System apps

**Terminal** — a real shell (`jpsh`) over the live filesystem with a true working
directory, ~60 commands. `mkdir demo && cd demo && echo hi > hello.txt && cat
hello.txt` genuinely works, and the folder appears on the desktop.

Path resolution is real: absolute, relative, `..`, `~`, nested, case-insensitive.
**Tab completion is caret-accurate** — a quote-aware tokenizer keeps source
offsets, completes command names in slot 0 and filenames elsewhere, appends `/`
for folders, auto-quotes names with spaces, and completes to the longest common
prefix. Plus `ps`/`kill` over real windows, `ping` that fails honestly when Wi-Fi
is off, `notify` raising a real toast, `neofetch`, and jokes — `sudo`, `cowsay`,
`matrix`, and `rm -rf /` gets *"I admire the commitment, but no."*

**Nimbus** (the browser) — tabs, omnibox with suggestions, and mock GitHub /
LinkedIn / portfolio pages.

- **Search**: a real results page ranked by term frequency over `content.ts` with a
  title boost, green URL lines, snippets, and a knowledge panel.
- **Ask about Johnpaul**: a rule-based chatbot with intent detection over the same
  data, rendered as a typing chat thread with follow-ups and suggestion chips. It
  **never invents a fact** — given something not in `content.ts` it says so, offers
  the closest real matches, and points at the Contact app.
- **Offline**: when Wi-Fi is off it shows a no-internet page reproducing Chromium's
  functional strings (UI text, not marks) with an **original** unplugged-connector
  glyph. Google's dinosaur is deliberately absent.

**Prism Player** — the media player. Original branding; VLC's cone is a registered
VideoLAN trademark. Menu bar, black letterboxed surface, full transport, loop,
speed, and a volume slider driving `video.volume = (v/100) ** 2` for a perceptual
curve.

Two details that decide whether it feels real:
- the playhead is driven by `requestAnimationFrame` writing **imperatively** to the
  DOM, never React state, with the two time labels re-rendering only on whole-second
  changes;
- the buffered bar picks the `TimeRanges` entry **containing** `currentTime` and
  guards `length === 0` — `buffered.end(0)` throws when empty, and after a forward
  seek there are multiple disjoint ranges, so reading the last one lies.

`F` maximizes the **window** rather than calling the Fullscreen API, which would
escape the window layer's stacking context and cover the taskbar.

**JP's Docs** — a word processor. A real `.docx` is a ZIP of OOXML and would need
a zip codec plus an XML layer for no benefit, since nothing here can consume one
and visitors can't download. So Docs stores sanitized HTML in a `doc` node.

The editor is **one uncontrolled `contentEditable`, keyed by file id, seeded exactly
once** in a `useLayoutEffect`; React never touches the subtree afterwards. Mirroring
the HTML back into React state is the caret-jumping bug and would ruin it.
Formatting goes through `document.execCommand` — deprecated, but the only API that
writes to the browser's native undo stack, and a word processor where `Ctrl+Z` does
nothing reads as fake instantly. Every toolbar control calls
`preventDefault()` on mousedown so the selection survives. Paste is intercepted and
routed through the sanitizer.

Full ribbon, A4 page on a grey backdrop, live word/character count, zoom.

**This PC** · **Recycle Bin** · **File Explorer** · **Settings** — drives with
capacity bars derived from real filesystem numbers; restore/empty over soft-deleted
nodes with original location and date-deleted columns; breadcrumb navigation.

**JP Tube** — a channel page: the intro video, project entries with generated SVG
thumbnails, subscribe toggle, comments.

**Minesweeper** — Beginner/Intermediate/Expert, LED counters, reactive face button.
**The first click is always safe**: mines are generated *after* the first reveal,
excluding that cell and its neighbours — the rule most clones get wrong. Iterative
flood fill, chording, keyboard-playable.

**Solitaire** — Klondike draw-1 with a seeded PRNG, undo stack, and correctly
enforced rules: alternating-colour descending tableau, suited ascending foundations,
Kings only into empty columns, whole-run moves.

---

## 11. Audio

`lib/os/sfx.ts`. Eight cues in `public/sfx/`:

| File | Plays when |
|---|---|
| `loadingSound.mp3` | Power on → boot *(yours)* |
| `unlock.mp3` | Signing in from the lock screen |
| `shutdown.mp3` | Start ▸ Shut down |
| `notify.mp3` | Any toast without its own cue |
| `device-connect.mp3` | Wi-Fi connects |
| `device-disconnect.mp3` | Wi-Fi off / airplane on |
| `error.mp3` | A write is refused |
| `recycle.mp3` | Emptying the Recycle Bin |

Every call is best-effort: a rejected `play()` is swallowed, never retried in a
loop, never surfaced as an error. Files that 404 or fail to decode are marked dead
and never retried, so a missing sound degrades to silence rather than spam.

Volume tracks the Quick Settings slider; muting silences everything.

**Format note.** The source files arrived as AIFF, which only Safari plays, at
3.2 MB. They were converted to mono 128 kbps MP3 — **3.2 MB → 300 KB** — and the
originals kept in `assets-src/audio/`, outside the deploy path. `recycle.mp3` was
synthesised from ffmpeg noise/tone sources, so it's original by construction.

> The real Windows chimes are both copyrighted **and** registered sound marks.
> None are used here.

---

## 12. The virtual filesystem

`lib/os/fs-store.ts`, persisted to `localStorage` under `jp-os-fs-v2`.

Nodes are `folder | text | doc | video | zip | app-link` with `createdAt`,
`modifiedAt`, and a `deletedAt` that gives the Recycle Bin soft-delete for free.

**Hydration reconciles rather than trusting storage.** Visitor-created nodes are
kept as-is, but every seeded node is forced back to its current definition — a
stale copy would leave an unlocked `Readme.txt` and the write guard would silently
stop working.

### The read-only guard

Nodes carrying Johnpaul's own words are `locked`. Locked means: **cannot be written,
renamed, deleted or moved.** It does *not* mean read-only in the editor — you can
open them, type into them freely, and copy them. The refusal happens only at the
save boundary, and it always offers a way forward.

Every write returns a `WriteResult` (`{ ok: true } | { ok: false, reason }`) rather
than failing silently, and every call site handles it:

- **Notepad / Docs** show the save dialog: *"I'm flattered, genuinely. You're having
  fun editing Readme.txt — I love that. But this one's mine, and I'd like to be the
  one who tells you who I am."* with **Save a copy** and **Keep editing**.
  "Save a copy" forks to an unlocked node in one click — nobody is ever dead-ended.
- **Desktop and Explorer** rename/delete raise a toast with `error.mp3`.
- **Terminal** prints a shell-shaped refusal and suggests `cp Readme.txt mycopy.txt`.

---

## 13. Theming

One `data-theme` attribute on the OS root swaps a set of CSS custom properties:
`--os-window --os-chrome --os-surface --os-card --os-menu --os-input --os-taskbar
--os-fg --os-muted --os-border --os-hover --os-active --os-accent --os-on-accent
--os-accent-soft --os-danger --os-scrim`.

Components reference the variables, never the colours, so light mode was mostly
free and every app follows automatically.

`--os-on-accent` exists because white text on the dark accent `#4cc2ff` was about
**2:1 contrast** — unreadable, and a real accessibility bug caught during review.

---

## 14. Original artwork

Everything visual was drawn for this project:

- the **wallpaper** — layered translucent SVG ribbons around a blurred core (three
  passes: first read as a daisy, then as a starburst, before it settled),
- the **four-pane mark** on the boot and power screens,
- the app icons — rounded gradient tiles over Lucide glyphs,
- the folder, text-file and project glyphs,
- the offline page's unplugged-connector mark,
- Minesweeper's mines and flags, Solitaire's cards and backs,
- the Prism Player identity.

Deliberately **absent**: the Windows flag, Segoe UI and Segoe Fluent Icons, the
Chrome wordmark and dinosaur, the VLC cone, the YouTube play button, Microsoft's
accent `#0078D4`, and every Windows sound.

"JP's Windows" uses a Microsoft trademark as a joke on a personal site, which reads
as parody — a meaningfully safer posture than presenting the UI as Microsoft's. It's
a deliberate, informed choice.

---

## 15. Mobile

Below 768px the whole shell is **replaced**, not squeezed — a desktop metaphor is
miserable on a phone. Android status bar, clock widget, app grid, dock, swipe-up
app drawer with search, recents, and a back/home/recents nav bar. Apps open
fullscreen and reflow; the Projects explorer drops its sidebar for filter chips.

---

## 16. Not built yet

- Free icon drag-and-arrange and marquee selection (Refresh exists).
- **Open with**, **Properties**, **Compress to ZIP** in the file context menu.
- Snap Layouts flyout, Task View (Win+Tab), Alt+Tab switcher.
- The global keyboard-shortcut registry (F2, F5, Delete, Ctrl+S work today).
- Control Panel; Task Manager.
- The SEO layer: server-rendered content routes, metadata, sitemap, robots,
  llms.txt, JSON-LD. **This matters** — the OS is one client-rendered route, so
  search engines currently see an empty desktop, and most AI crawlers don't run
  JavaScript at all.

## 17. Assets to drop in

| Path | What | Status |
|---|---|---|
| `public/media/jp-portrait.jpg` | Welcome popup photo | designed placeholder in place |
| `public/media/intro.mp4` | Video introduction | 20s placeholder, verified playing |
| `public/sfx/*.mp3` | System sounds | all 8 present |

Swapping any of them is a pure file replacement — no code change.
