"use client"

import { useMemo, useState, type RefObject } from "react"
import { MessageCircleQuestion, Search, Sparkles } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { ASK_CHIPS, SEARCH_PLACEHOLDER, filterApps, looksLikeQuestion } from "@/lib/os/phone-home"
import { AppTile, type Launch } from "../home/app-tile"

/** All apps A-Z, a search that also takes questions, and a few "Ask JP" starters. */
export function AppDrawer({ onLaunch, inputRef }: { onLaunch: Launch; inputRef: RefObject<HTMLInputElement | null> }) {
  const [query, setQuery] = useState("")
  const apps = useMemo(() => filterApps(query), [query])
  const q = query.trim()
  const question = looksLikeQuestion(q)
  const ask = (text: string) => useWM.getState().open("browser", { q: text })
  return <>
    <div className="shrink-0 px-4 pb-2">
      <label className="phone-drawer-search flex items-center gap-3 rounded-full px-4">
        <Search size={18} aria-hidden className="shrink-0 opacity-75" />
        <span className="sr-only">Search apps or ask a question</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || !q) return
            if (apps.length && !question) onLaunch(apps[0].id)
            else ask(q)
          }}
          placeholder={SEARCH_PLACEHOLDER}
          enterKeyHint="go"
          autoComplete="off"
          className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none"
        />
      </label>
    </div>
    <div className="os-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4">
      {!q && <div className="mb-4 flex flex-wrap gap-2 px-1" role="group" aria-label="Ask JP">
        {ASK_CHIPS.map((chip) => <button key={chip} type="button" onClick={() => ask(chip)} className="phone-ask-chip inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm">
          <Sparkles size={15} aria-hidden />{chip}
        </button>)}
      </div>}
      {question && <button type="button" onClick={() => ask(q)} aria-label={`Ask JP: ${q}`} className="phone-ask-row mb-4 flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 text-left">
        <MessageCircleQuestion size={20} aria-hidden className="shrink-0" />
        <span className="min-w-0"><span className="block text-sm font-medium">Ask JP: {q}</span><span className="block text-xs opacity-75">Nimbus answers from my portfolio</span></span>
      </button>}
      {apps.length
        ? <>
          {!q && <h3 className="px-1 pb-2 text-xs font-medium uppercase tracking-wider opacity-70">All apps</h3>}
          <div className="phone-drawer-grid grid content-start gap-x-1 gap-y-3">{apps.map((app) => <AppTile key={app.id} id={app.id} onLaunch={onLaunch} />)}</div>
        </>
        : !question && <p className="py-8 text-center text-sm opacity-80">No apps found. Try another name.</p>}
    </div>
  </>
}
