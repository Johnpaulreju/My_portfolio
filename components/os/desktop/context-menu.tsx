"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { ChevronRight } from "lucide-react"

export type MenuItem =
  | { kind: "sep" }
  | {
      kind?: "item"
      label: string
      icon?: ReactNode
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      onSelect?: () => void
      submenu?: MenuItem[]
    }

export type MenuState = { x: number; y: number; items: MenuItem[] } | null

export function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [openSub, setOpenSub] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (!state || !ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    // Flip the menu back on-screen when opened near an edge.
    setPos({
      x: Math.min(state.x, window.innerWidth - width - 8),
      y: Math.min(state.y, window.innerHeight - height - 8),
    })
    setOpenSub(null)
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("pointerdown", onDown, true)
    window.addEventListener("resize", onClose)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("pointerdown", onDown, true)
      window.removeEventListener("resize", onClose)
    }
  }, [state, onClose])

  if (!state) return null

  return (
    <div
      ref={ref}
      className="fixed z-[200] min-w-[232px] rounded-lg p-1.5 text-[13px] shadow-2xl"
      style={{
        left: pos.x,
        top: pos.y,
        background: "var(--os-menu)",
        border: "1px solid var(--os-border)",
        backdropFilter: "blur(28px)",
        color: "var(--os-fg)",
      }}
      onContextMenu={(e) => e.preventDefault()}
      role="menu"
    >
      {state.items.map((item, i) =>
        item.kind === "sep" ? (
          <div key={i} className="my-1 h-px" style={{ background: "var(--os-border)" }} />
        ) : (
          <div key={i} className="relative" onMouseEnter={() => setOpenSub(item.submenu ? i : null)}>
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                if (item.submenu || item.disabled) return
                item.onSelect?.()
                onClose()
              }}
              className={`flex w-full items-center gap-3 rounded-md px-2.5 py-[7px] text-left transition-colors disabled:opacity-40 ${
                item.danger ? "hover:bg-[#c42b1c] hover:text-white" : "hover:bg-[var(--os-hover)]"
              }`}
            >
              <span className="grid w-4 place-items-center opacity-80">{item.icon}</span>
              <span className="flex-1 truncate">{item.label}</span>
              {item.shortcut && (
                <span className="text-[11px]" style={{ color: "var(--os-muted)" }}>
                  {item.shortcut}
                </span>
              )}
              {item.submenu && <ChevronRight size={13} className="opacity-70" />}
            </button>

            {item.submenu && openSub === i && (
              <div
                className="absolute left-full top-0 ml-1 min-w-[190px] rounded-lg p-1.5 shadow-2xl"
                style={{
                  background: "var(--os-menu)",
                  border: "1px solid var(--os-border)",
                  backdropFilter: "blur(28px)",
                }}
              >
                {item.submenu.map((sub, j) =>
                  sub.kind === "sep" ? (
                    <div key={j} className="my-1 h-px" style={{ background: "var(--os-border)" }} />
                  ) : (
                    <button
                      key={j}
                      type="button"
                      onClick={() => {
                        sub.onSelect?.()
                        onClose()
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-[7px] text-left transition-colors hover:bg-[var(--os-hover)]"
                    >
                      <span className="grid w-4 place-items-center opacity-80">{sub.icon}</span>
                      <span className="flex-1 truncate">{sub.label}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  )
}
