"use client"

import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react"
import { ChevronUp, Search } from "lucide-react"
import { APP_META } from "@/lib/os/app-meta"
import { DOCK, HOME_APPS, SEARCH_PLACEHOLDER, haptic } from "@/lib/os/phone-home"
import { AppIcon } from "@/components/os/app-icon"
import { PullHandle } from "../pull-handle"
import { AppTile, type Launch } from "./app-tile"
import { GamesFolder } from "./games-folder"
import { AtAGlance, ProfileWidget } from "./widgets"

/** "one": everything fits on one page. "paged": widgets, then apps, with dots. "wide": side by side (landscape). */
type Layout = "one" | "paged" | "wide"

const SWIPE = 56

export function HomeScreen({ now, onLaunch, onOpenDrawer, onSearch, onOpenShade }: {
  now: Date | null
  onLaunch: Launch
  onOpenDrawer: () => void
  onSearch: () => void
  onOpenShade: () => void
}) {
  const pager = useRef<HTMLDivElement>(null)
  const widgets = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout>("one")
  const [overflow, setOverflow] = useState(false)
  const [page, setPage] = useState(0)
  /** Short screens get the smaller clock and a tighter profile card. Depends on height only, so it can't loop. */
  const [short, setShort] = useState(false)

  // Pick the layout from real sizes, so nothing is ever clipped. Block heights only depend on the
  // pager's width, which "one" and "paged" share, so the choice cannot flip-flop.
  useLayoutEffect(() => {
    const box = pager.current
    if (!box) return
    const measure = () => {
      const w = box.clientWidth, h = box.clientHeight
      const wh = widgets.current?.offsetHeight ?? 0, gh = grid.current?.offsetHeight ?? 0
      if (!w || !h) return
      setShort(h < 480)
      const next: Layout = w >= 560 && w > h * 1.3 ? "wide" : wh + gh + 20 <= h ? "one" : "paged"
      setLayout(next)
      if (next === layout) setOverflow([...box.querySelectorAll<HTMLElement>("[data-home-scroll]")].some((el) => el.scrollHeight > el.clientHeight + 1))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    if (widgets.current) observer.observe(widgets.current)
    if (grid.current) observer.observe(grid.current)
    return () => observer.disconnect()
  }, [layout])

  // Swipe up for the drawer, down for the shade, only when nothing under the finger is scrolling.
  const swipe = useRef<{ id: number; x: number; y: number; scroll: HTMLElement | null } | null>(null)
  const swiped = useRef(false)
  const onPointerDown = (e: RPointerEvent) => {
    swiped.current = false
    if (!e.isPrimary || e.button !== 0) { swipe.current = null; return }
    const scroll = (e.target as HTMLElement).closest<HTMLElement>("[data-home-scroll]")
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, scroll }
  }
  const onPointerUp = (e: RPointerEvent) => {
    const from = swipe.current
    swipe.current = null
    if (!from || from.id !== e.pointerId) return
    const dx = e.clientX - from.x, dy = e.clientY - from.y
    if (Math.abs(dy) < SWIPE || Math.abs(dy) < Math.abs(dx) * 1.5) return
    const s = from.scroll
    const canScroll = s && s.scrollHeight > s.clientHeight + 1
    if (dy < 0 && canScroll && s.scrollTop + s.clientHeight < s.scrollHeight - 1) return
    if (dy > 0 && canScroll && s.scrollTop > 0) return
    swiped.current = true
    haptic()
    if (dy < 0) onOpenDrawer()
    else onOpenShade()
  }

  const goTo = useCallback((index: number) => {
    const s = scroller.current
    s?.scrollTo({ left: index * s.clientWidth, behavior: "smooth" })
  }, [])

  const wide = layout === "wide"
  const widgetBlock = <div ref={widgets} className={`flex flex-col ${short ? "gap-2" : "gap-3"}`}>
    <AtAGlance now={now} onLaunch={onLaunch} compact={wide || short} />
    <ProfileWidget onLaunch={onLaunch} compact={wide || short} />
  </div>
  const gridBlock = <div ref={grid} className={`phone-home-grid grid content-start gap-x-1 gap-y-2 ${wide ? "grid-cols-5" : "grid-cols-4"}`}>
    {HOME_APPS.map((id) => <AppTile key={id} id={id} onLaunch={onLaunch} light size={wide ? 44 : 48} />)}
    <GamesFolder onLaunch={onLaunch} size={wide ? 44 : 48} />
  </div>
  const bottom = <div className="flex shrink-0 flex-col gap-2">
    <div className="flex items-center gap-1">
      <button type="button" onClick={onSearch} aria-label={SEARCH_PLACEHOLDER} className="phone-search-pill flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full px-4 text-left text-sm">
        <Search size={18} aria-hidden className="shrink-0" /><span className="truncate">{SEARCH_PLACEHOLDER}</span>
      </button>
      <PullHandle label="All apps" onTap={onOpenDrawer} onPullUp={onOpenDrawer} className="rounded-full text-white"><ChevronUp size={22} /></PullHandle>
    </div>
    <nav aria-label="Favorites" className="phone-dock flex items-center justify-around rounded-[28px] px-2 py-1">
      {DOCK.map((id) => <button key={id} type="button" data-home-tile className="phone-touch rounded-2xl p-1" onClick={(e) => onLaunch(id, e.currentTarget)} aria-label={APP_META[id].title}><AppIcon appId={id} size={wide ? 40 : 48} /></button>)}
    </nav>
  </div>
  const scrollable = overflow ? "overflow-y-auto phone-home-scroll" : "overflow-hidden"

  return (
    <div
      className={`phone-home flex h-full flex-col px-3 pb-2 ${wide ? "phone-home-wide" : ""}`}
      data-layout={layout}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { swipe.current = null }}
      onClickCapture={(e) => { if (swiped.current) { swiped.current = false; e.preventDefault(); e.stopPropagation() } }}
    >
      <div ref={pager} className="relative min-h-0 flex-1">
        {layout === "one" && <div data-home-scroll className={`os-scroll flex h-full flex-col justify-between gap-5 pt-3 ${scrollable}`}>{widgetBlock}{gridBlock}</div>}
        {layout === "wide" && <div className="grid h-full grid-cols-2 gap-4">
          <div data-home-scroll className={`os-scroll ${scrollable}`}>{widgetBlock}</div>
          <div className="flex min-h-0 flex-col gap-2">
            <div data-home-scroll className={`os-scroll flex min-h-0 flex-1 flex-col justify-center ${scrollable}`}>{gridBlock}</div>
            {bottom}
          </div>
        </div>}
        {layout === "paged" && <div
          ref={scroller}
          className="phone-home-pager flex h-full snap-x snap-mandatory overflow-x-auto"
          onScroll={(e) => { const s = e.currentTarget; setPage(Math.round(s.scrollLeft / Math.max(1, s.clientWidth))) }}
        >
          <section aria-label="Home page 1 of 2" data-home-scroll className={`os-scroll h-full w-full shrink-0 snap-start ${short ? "pt-1" : "pt-3"} ${scrollable}`}>{widgetBlock}</section>
          <section aria-label="Home page 2 of 2" data-home-scroll className={`os-scroll flex h-full w-full shrink-0 snap-start flex-col justify-center ${scrollable}`}>{gridBlock}</section>
        </div>}
      </div>

      {layout === "paged" && <div className="-my-1.5 flex shrink-0 justify-center" role="group" aria-label="Home pages">
        {[0, 1].map((i) => <button key={i} type="button" onClick={() => goTo(i)} aria-label={i === 0 ? "Home page 1, about me" : "Home page 2, apps"} aria-current={page === i || undefined} className="inline-flex h-11 w-11 items-center justify-center">
          <span className={`h-2 rounded-full bg-white transition-all ${page === i ? "w-4 opacity-100" : "w-2 opacity-50"}`} />
        </button>)}
      </div>}

      {!wide && bottom}
    </div>
  )
}
