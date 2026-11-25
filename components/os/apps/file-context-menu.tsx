import type { MouseEvent, ReactNode } from "react"

export function localPoint(event: MouseEvent, surface: HTMLElement | null) {
  const bounds = surface?.getBoundingClientRect()
  return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) }
}

export function FileContextMenu({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[300] flex flex-col items-start">
      {/* The spacer yields to the menu at the bottom edge of a short window. */}
      <div aria-hidden="true" style={{ flex: `0 1 ${Math.max(0, y)}px` }} />
      <div
        className="os-scroll pointer-events-auto max-h-full w-[200px] max-w-full shrink-0 overflow-y-auto rounded-lg p-1.5 text-[13px] shadow-2xl"
        style={{
          marginLeft: `clamp(0px, ${x}px, calc(100% - 200px))`,
          background: "var(--os-menu)",
          border: "1px solid var(--os-border)",
          backdropFilter: "blur(28px)",
          color: "var(--os-fg)",
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {children}
      </div>
    </div>
  )
}
