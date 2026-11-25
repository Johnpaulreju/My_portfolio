"use client"

import { AppIcon } from "@/components/os/app-icon"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import {
  ArrowUp, ArrowUpRight, BookOpen, BriefcaseBusiness, Check, Copy, FolderOpen, Link2,
  PanelLeft, Plus, RotateCcw, Search, Square, SquarePen, Trash2,
} from "lucide-react"
import { ask, type AssistantTurn } from "@/lib/os/assistant"
import { askProfile } from "@/lib/os/ask-profile"
import { PROFILE, PROJECTS } from "@/lib/os/content"
import { useMyGPT, type ChatMessage, type ChatRequest } from "@/lib/os/mygpt-store"
import type { WindowInstance } from "@/lib/os/types"
import { useWM } from "@/lib/os/wm-store"
import styles from "./mygpt.module.css"

const starters = [
  { label: "Explore projects", question: "What has Johnpaul built?", Icon: FolderOpen },
  { label: "Work experience", question: "Where has Johnpaul worked?", Icon: BriefcaseBusiness },
  { label: "Education", question: "Where did Johnpaul study?", Icon: BookOpen },
]

async function answer(request: ChatRequest | null) {
  if (!request) return
  const store = useMyGPT.getState()
  try {
    const reply = await askProfile(request.question, request.previous, request.signal)
    if (request.signal.aborted) return
    if (reply) {
      store.finish(request, reply)
      return
    }
    // Recover the local assistant's context using only earlier turns in this chat.
    const messages = store.sessions.find((s) => s.id === request.sessionId)?.messages ?? []
    const history: AssistantTurn[] = []
    for (let i = 1; i < messages.length && messages[i].id !== request.messageId; i++) {
      const user = messages[i - 1]
      const assistant = messages[i]
      if (user.role === "user" && assistant.role === "assistant" && assistant.status === "done") {
        history.push({ q: user.text, a: { text: assistant.text, confidence: 1 } })
      }
    }
    const local = ask(request.question, history)
    const facts = local.facts?.map((fact) => `${fact.label} — ${fact.value}`) ?? []
    store.finish(request, { text: [local.text, ...facts].join("\n\n"), links: [] })
  } catch {
    if (!request.signal.aborted) store.fail(request)
  }
}

function IconButton({ label, children, onClick }: { label: string; children: ReactNode; onClick: () => void }) {
  return <button className={styles.icon} type="button" aria-label={label} title={label} onClick={onClick}>{children}</button>
}

function Reply({ message, retry }: { message: ChatMessage; retry?: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <article aria-label={message.role === "user" ? "Your message" : "MyGPT reply"} className={message.role === "user" ? styles.user : styles.reply}>
      {message.text && <p>{message.text}</p>}
      {message.status === "pending" && <span role="status" className={styles.thinking}><i aria-hidden />Thinking…</span>}
      {message.links.length > 0 && <div className={styles.sources}>{message.links.map(({ label, url }) =>
        <a key={url} href={url} target="_blank" rel="noreferrer"><Link2 size={13} />{label}<ArrowUpRight size={12} /></a>
      )}</div>}
      {message.role === "assistant" && message.status !== "pending" && (
        <div className={styles.replyActions}>
          {message.text && <IconButton label={copied ? "Copied" : "Copy reply"} onClick={() => {
            void navigator.clipboard?.writeText(message.text + message.links.map((link) => "\n" + link.url).join(""))
              .then(() => setCopied(true)).catch(() => {})
          }}>{copied ? <Check size={15} /> : <Copy size={15} />}</IconButton>}
          {retry && <IconButton label="Retry reply" onClick={retry}><RotateCcw size={15} /></IconButton>}
        </div>
      )}
    </article>
  )
}

export function MyGPTApp({ win }: { win: WindowInstance }) {
  const state = useMyGPT()
  const chat = state.sessions.find((item) => item.id === state.activeId)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileDrawer, setMobileDrawer] = useState(false)
  const [search, setSearch] = useState<string | null>(null)
  const [projectMenu, setProjectMenu] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const [compact, setCompact] = useState(false)
  const drawerVisible = compact && mobileDrawer
  const input = useRef<HTMLTextAreaElement>(null)
  const transcript = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const lastChat = useRef<string | null>(null)
  const popup = useRef<HTMLDivElement>(null)
  const busy = chat?.messages.some((message) => message.status === "pending") ?? false
  const empty = !chat?.messages.length
  const draft = chat?.draft ?? ""

  useLayoutEffect(() => {
    const el = frame.current
    if (!el) return
    const sync = () => setCompact(el.clientWidth <= 690)
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => { useMyGPT.getState().hydrate() }, [])
  useEffect(() => {
    if (!state.ready || typeof win.payload?.query !== "string") return
    // Read and consume the current payload atomically across shell remounts.
    const wm = useWM.getState()
    const query = wm.windows.find((item) => item.id === win.id)?.payload?.query
    if (typeof query !== "string" || !query.trim()) return
    wm.setPayload(win.id, { query: undefined })
    const s = useMyGPT.getState()
    void answer(s.begin(s.newChat(), query.trim().slice(0, 1000)))
  }, [win.id, win.payload?.query, state.ready])

  useLayoutEffect(() => {
    if (!input.current) return
    input.current.style.height = "auto"
    input.current.style.height = Math.min(input.current.scrollHeight, 135) + "px"
  }, [draft, empty])
  useLayoutEffect(() => {
    const el = transcript.current
    if (el && (follow.current || lastChat.current !== state.activeId)) {
      el.scrollTop = el.scrollHeight
      follow.current = true
    }
    lastChat.current = state.activeId
  }, [chat?.messages, state.activeId])
  useEffect(() => {
    if (!projectMenu) return
    const dismiss = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node)) setProjectMenu(false)
    }
    document.addEventListener("pointerdown", dismiss)
    return () => document.removeEventListener("pointerdown", dismiss)
  }, [projectMenu])

  function dismissPanels() {
    setMobileDrawer(false)
    setSearch(null)
    setProjectMenu(false)
    setDeleting(null)
  }
  function newChat() {
    state.newChat()
    dismissPanels()
    if (matchMedia("(pointer: fine)").matches) requestAnimationFrame(() => input.current?.focus({ preventScroll: true }))
  }
  function send(question?: string) {
    if (!chat || busy || !(question ?? draft).trim()) return
    follow.current = true
    setProjectMenu(false)
    void answer(state.begin(chat.id, question ?? draft))
    if (question === undefined) input.current?.focus({ preventScroll: true })
  }
  const history = state.sessions.filter((item) => item.messages.length || item.draft.trim()).filter((item) =>
    !search || item.title.toLowerCase().includes(search.toLowerCase()) ||
    item.messages.some((message) => message.text.toLowerCase().includes(search.toLowerCase())),
  )

  return (
    <div ref={frame} className={styles.frame} aria-label="MyGPT" onKeyDown={(event) => {
      if (event.key === "Escape" && (drawerVisible || projectMenu || deleting || search !== null)) {
        dismissPanels()
        if (drawerVisible) opener.current?.focus()
        event.stopPropagation()
      }
    }}>
      <div className={styles.shell} data-collapsed={collapsed} data-drawer={mobileDrawer}>
        <button type="button" className={styles.scrim} tabIndex={-1} aria-label="Close chat history" onClick={() => setMobileDrawer(false)} />
        <aside className={styles.sidebar} aria-label="Chat history" inert={!!deleting}>
          <div className={styles.sidebarTop}>
            <AppIcon appId="mygpt" size={22} />
            <IconButton label="Close sidebar" onClick={() => { setCollapsed(true); setMobileDrawer(false); requestAnimationFrame(() => opener.current?.focus()) }}><PanelLeft size={19} /></IconButton>
          </div>
          <button className={styles.navAction} onClick={newChat}><SquarePen size={17} />New chat</button>
          <button className={styles.navAction} onClick={() => setSearch(search === null ? "" : null)}><Search size={17} />Search chats</button>
          {search !== null && <input className={styles.search} type="search" aria-label="Search chat history" placeholder="Search chats…" value={search} autoFocus onChange={(e) => setSearch(e.target.value)} />}
          {history.length > 0 && <h2 className={styles.historyLabel}>Your chats</h2>}
          {search && !history.length && <p className={styles.noResults}>No matching chats</p>}
          <div className={styles.historyList}>
            {history.map((item) => (
              <div key={item.id} className={styles.historyRow} data-selected={item.id === chat?.id}>
                <button className={styles.historyItem} aria-current={item.id === chat?.id ? "true" : undefined} onClick={() => {
                  state.select(item.id); dismissPanels()
                }}>{item.title}</button>
                <button className={styles.trash} aria-label={`Delete chat: ${item.title}`} onClick={() => setDeleting(item.id)}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <button className={styles.profile} onClick={() => { dismissPanels(); useWM.getState().open("about") }}>
            <span className={styles.avatar}>{PROFILE.initials}</span><span>{PROFILE.name}<small>Portfolio profile</small></span>
          </button>
        </aside>
        <main className={styles.main} data-empty={empty} inert={drawerVisible || !!deleting}>
          <header className={styles.bar}>
            <button ref={opener} className={styles.opener} type="button" aria-label="Open sidebar" title="Open sidebar" onClick={() => { setCollapsed(false); setMobileDrawer(compact); requestAnimationFrame(() => frame.current?.querySelector<HTMLButtonElement>('button[aria-label="Close sidebar"]')?.focus()) }}><PanelLeft size={19} /></button>
            <span>MyGPT</span>
            <div className={styles.newTop}><IconButton label="Start a new chat" onClick={newChat}><SquarePen size={18} /></IconButton></div>
          </header>
          {!empty && <div className={styles.transcript} ref={transcript} onScroll={(e) => {
            const el = e.currentTarget
            follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 72
          }}>
            <div className={styles.messages} role="log" aria-label="Conversation" aria-live="polite">
              {chat?.messages.map((m, i) => <Reply key={m.id} message={m} retry={m.role === "assistant" && !busy && i === chat.messages.length - 1 ? () => { void answer(state.retry(chat.id, m.id)) } : undefined} />)}
            </div>
          </div>}
          {empty && <div className={styles.empty}>
            <div className={styles.intro}>
              <h1>Hi! What would you like to know?</h1>
              <p>I’m Johnpaul’s portfolio assistant. Ask me about his projects, his work or how he got started.</p>
              <div className={styles.starters}>
                {starters.map(({ label, question, Icon }) => <button key={label} disabled={!chat} onClick={() => send(question)}><Icon size={15} />{label}</button>)}
              </div>
            </div>
          </div>}
          <div className={styles.dock}>
            <div className={styles.composerWrap}>
              <form className={styles.composer} onSubmit={(e) => { e.preventDefault(); send() }}>
                <textarea ref={input} aria-label="Message MyGPT" enterKeyHint="send" autoCapitalize="sentences" placeholder="Ask about a project, a role or a skill…" rows={1} maxLength={1000} disabled={!chat} value={draft} onChange={(e) => { if (chat) state.setDraft(chat.id, e.target.value) }} onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) { e.preventDefault(); send() }
                }} />
                <div className={styles.toolbar}>
                  <div ref={popup}>
                    <button type="button" className={styles.icon} title="Reference a project" aria-label="Reference a project" aria-expanded={projectMenu} onClick={() => setProjectMenu(!projectMenu)}><Plus size={21} /></button>
                    {projectMenu && <div className={styles.projectMenu} aria-label="Projects">
                      {PROJECTS.map((p) => <button key={p.id} type="button" onClick={() => {
                        if (chat) state.setDraft(chat.id, (draft ? draft.trimEnd() + " " + p.title : "Tell me about " + p.title).slice(0, 1000))
                        setProjectMenu(false); input.current?.focus()
                      }}>{p.title}</button>)}
                    </div>}
                  </div>
                  {busy ? <button type="button" aria-label="Stop response" title="Stop response" className={styles.send} onClick={() => { if (chat) state.stop(chat.id) }}><Square size={14} fill="currentColor" /></button> :
                    <button type="submit" aria-label="Send message" title="Send message" className={styles.send} disabled={!draft.trim() || !chat}><ArrowUp size={20} strokeWidth={2.4} /></button>}
                </div>
              </form>
            </div>
          </div>
          {empty && <div className={styles.belowComposer} aria-hidden />}
          <p className={styles.disclosure}>Chats stay in this browser. Questions may be sent to Google Gemini.</p>
        </main>
        {deleting && <div className={styles.modalShade}>
          <div className={styles.confirm} role="alertdialog" aria-label="Delete this chat?" aria-modal="true" onKeyDown={(e) => {
            if (e.key === "Tab") {
              const buttons = e.currentTarget.querySelectorAll("button")
              if (buttons.length > 0) { e.preventDefault(); buttons[document.activeElement === buttons[0] ? 1 : 0].focus() }
            }
          }}>
            <h2>Delete this chat?</h2><p>This removes the conversation from this browser.</p>
            <div><button autoFocus onClick={() => setDeleting(null)}>Cancel</button><button className={styles.deleteButton} onClick={() => { state.remove(deleting); setDeleting(null) }}>Delete chat</button></div>
          </div>
        </div>}
      </div>
    </div>
  )
}
