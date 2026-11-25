"use client"

import { create } from "zustand"
import type { ProfileReply } from "./ask-profile"

export type ChatMessage = ProfileReply & {
  id: string
  role: "user" | "assistant"
  status: "done" | "pending" | "stopped" | "error"
  createdAt: number
}

export type ChatSession = {
  id: string
  title: string
  draft: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

export type ChatRequest = {
  sessionId: string
  messageId: string
  token: string
  question: string
  previous: string[]
  signal: AbortSignal
}

type ChatState = {
  ready: boolean
  activeId: string | null
  sessions: ChatSession[]
  hydrate(): void
  newChat(): string
  select(id: string): void
  remove(id: string): void
  setDraft(id: string, text: string): void
  begin(id: string, question?: string): ChatRequest | null
  retry(id: string, messageId: string): ChatRequest | null
  finish(request: ChatRequest, reply: ProfileReply): void
  fail(request: ChatRequest, text?: string): void
  stop(id: string): void
}

// Store each conversation separately so saving one draft cannot replace other conversations.
const sessionPrefix = "jp-os-mygpt-v1:chat:"
const activeKey = "jp-os-mygpt-v1:active"
const interrupted = "This response was interrupted. You can retry it."

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2)
}

function emptySession(): ChatSession {
  const now = Date.now()
  return { id: newId(), title: "New chat", draft: "", messages: [], createdAt: now, updatedAt: now }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object"
}

function restoreSession(raw: string, expectedId: string): ChatSession | null {
  let saved: unknown
  try { saved = JSON.parse(raw) } catch { return null }
  if (!isRecord(saved) || saved.id !== expectedId || typeof saved.title !== "string" ||
      typeof saved.draft !== "string" || typeof saved.createdAt !== "number" ||
      typeof saved.updatedAt !== "number" || !Array.isArray(saved.messages)) return null

  const messages: ChatMessage[] = []
  const ids = new Set<string>()
  for (const item of saved.messages) {
    if (!isRecord(item) || typeof item.id !== "string" || ids.has(item.id) ||
        (item.role !== "user" && item.role !== "assistant") || typeof item.text !== "string" ||
        typeof item.createdAt !== "number") continue
    const status = item.status
    if (status !== "done" && status !== "pending" && status !== "stopped" && status !== "error") continue
    ids.add(item.id)
    const links = Array.isArray(item.links) ? item.links.filter(
      (link): link is { label: string; url: string } => isRecord(link) &&
        typeof link.label === "string" && typeof link.url === "string" && /^https:\/\//i.test(link.url),
    ) : []
    messages.push({
      id: item.id, role: item.role, createdAt: item.createdAt, links,
      text: status === "pending" && !item.text ? interrupted : item.text,
      status: status === "pending" ? "stopped" : status,
    })
  }
  return {
    id: expectedId, title: saved.title, draft: saved.draft, messages,
    createdAt: saved.createdAt, updatedAt: saved.updatedAt,
  }
}

function save(key: string, value: string) {
  try { window.localStorage.setItem(key, value) } catch { /* Keep the current tab usable when storage is unavailable. */ }
}

export const useMyGPT = create<ChatState>((set, get) => {
  const requests = new Map<string, { request: ChatRequest; controller: AbortController }>()
  const find = (id: string) => get().sessions.find((session) => session.id === id)

  function saveSession(session: ChatSession) {
    save(sessionPrefix + session.id, JSON.stringify(session))
  }

  function replace(session: ChatSession) {
    saveSession(session)
    set((state) => ({ sessions: state.sessions.map((old) => old.id === session.id ? session : old) }))
  }

  function start(session: ChatSession, question: string, messageId: string, previous: ChatMessage[]): ChatRequest {
    const controller = new AbortController()
    const request = {
      sessionId: session.id, messageId, question, token: newId(), signal: controller.signal,
      previous: previous.filter((message) => message.role === "user").slice(-3).map((message) => message.text),
    }
    requests.set(session.id, { request, controller })
    replace(session)
    return request
  }

  function answer(request: ChatRequest, status: "done" | "error" | "stopped", reply: ProfileReply) {
    const live = requests.get(request.sessionId)
    if (!live || live.request.token !== request.token || live.request.messageId !== request.messageId) return
    const session = find(request.sessionId)
    if (!session) return
    requests.delete(session.id)
    replace({
      ...session, updatedAt: Date.now(),
      messages: session.messages.map((m) => m.id === request.messageId ? { ...m, ...reply, status } : m),
    })
  }

  return {
    ready: false, activeId: null, sessions: [],
    hydrate() {
      if (get().ready || typeof window === "undefined") return
      const sessions: ChatSession[] = []
      let activeId: string | null = null
      try {
        const storage = window.localStorage
        activeId = storage.getItem(activeKey)
        for (let i = 0; i < storage.length; i++) {
          const key = storage.key(i)
          if (!key?.startsWith(sessionPrefix)) continue
          const session = restoreSession(storage.getItem(key) ?? "", key.slice(sessionPrefix.length))
          if (session) sessions.push(session)
        }
      } catch { /* Browser storage may be disabled. */ }
      if (!sessions.length) sessions.push(emptySession())
      sessions.sort((a, b) => b.updatedAt - a.updatedAt)
      if (!sessions.some((session) => session.id === activeId)) activeId = sessions[0].id
      set({ ready: true, sessions, activeId })
    },
    newChat() {
      get().hydrate()
      const blank = get().sessions.find((session) => !session.messages.length && !session.draft)
      if (blank) {
        get().select(blank.id)
        return blank.id
      }
      const session = emptySession()
      saveSession(session)
      save(activeKey, session.id)
      set((state) => ({ activeId: session.id, sessions: [session, ...state.sessions] }))
      return session.id
    },
    select(id) {
      if (!find(id) || get().activeId === id) return
      save(activeKey, id)
      set({ activeId: id })
    },
    remove(id) {
      if (!find(id)) return
      const live = requests.get(id)
      requests.delete(id)
      live?.controller.abort()
      try { window.localStorage.removeItem(sessionPrefix + id) } catch { /* The in-memory history can still be edited. */ }
      const sessions = get().sessions.filter((session) => session.id !== id)
      if (!sessions.length) sessions.push(emptySession())
      const activeId = get().activeId === id ? sessions[0].id : get().activeId
      if (activeId) save(activeKey, activeId)
      set({ sessions, activeId })
    },
    setDraft(id, text) {
      const session = find(id)
      if (session && session.draft !== text) replace({ ...session, draft: text })
    },
    begin(id, input) {
      const session = find(id)
      if (!session || requests.has(id)) return null
      const question = (input ?? session.draft).trim()
      if (!question || question.length > 1000) return null
      const now = Date.now()
      const user: ChatMessage = { id: newId(), role: "user", text: question, links: [], status: "done", createdAt: now }
      const assistant: ChatMessage = { id: newId(), role: "assistant", text: "", links: [], status: "pending", createdAt: now }
      return start({
        ...session, title: session.messages.length ? session.title : question.replace(/\s+/g, " ").slice(0, 70),
        draft: input === undefined || session.draft.trim() === question ? "" : session.draft,
        messages: [...session.messages, user, assistant], updatedAt: now,
      }, question, assistant.id, session.messages)
    },
    retry(id, messageId) {
      const session = find(id)
      if (!session || requests.has(id)) return null
      const index = session.messages.findIndex((m) => m.id === messageId)
      const message = session.messages[index]
      const user = session.messages[index - 1]
      if (message?.role !== "assistant" || user?.role !== "user" || message.status === "pending") return null
      const messages = session.messages.map((m) => m.id === messageId ? { ...m, status: "pending" as const, text: "", links: [] } : m)
      return start({ ...session, messages, updatedAt: Date.now() }, user.text, messageId, session.messages.slice(0, index - 1))
    },
    finish: (request, reply) => answer(request, "done", reply),
    fail: (request, text = "The reply could not be completed. You can retry it.") => answer(request, "error", { text, links: [] }),
    stop(id) {
      const live = requests.get(id)
      if (!live) return
      answer(live.request, "stopped", { text: "Response stopped.", links: [] })
      live.controller.abort()
    },
  }
})
