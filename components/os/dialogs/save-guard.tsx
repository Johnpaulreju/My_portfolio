"use client"

import { type RefObject } from "react"
import { ModalSurface } from "./modal-surface"
import { Lock } from "lucide-react"

/**
 * Shown when a visitor tries to save over one of Johnpaul's own files.
 * The tone matters: it must read as warm and a little funny, never as an error,
 * and it must never dead-end anyone - "Save a copy" is always one click away.
 */
export function SaveGuard({
  open,
  fileName,
  onSaveCopy,
  onKeepEditing,
  returnFocusRef,
}: {
  returnFocusRef?: RefObject<HTMLElement | null>
  open: boolean
  fileName: string
  onSaveCopy: () => void
  onKeepEditing: () => void
}) {
  if (!open) return null

  return (
    <ModalSurface label="This file is read-only" onDismiss={onKeepEditing} returnFocusRef={returnFocusRef}>
      <div
        className="absolute inset-0 z-[60] grid place-items-center p-6"
        style={{ background: "var(--os-scrim)" }}
      >
        <div
          className="w-full max-w-[420px] overflow-hidden rounded-xl shadow-2xl"
          style={{ background: "var(--os-menu)", border: "1px solid var(--os-border)", backdropFilter: "blur(30px)" }}
        >
          <div className="flex gap-3.5 p-5">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
              style={{ background: "var(--os-accent-soft)", color: "var(--os-accent-fg)" }}
            >
              <Lock size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="mb-1.5 text-[15px] font-semibold" style={{ color: "var(--os-fg)" }}>
                I&rsquo;m flattered, genuinely
              </h2>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
                You&rsquo;re having fun editing <span style={{ color: "var(--os-fg)" }}>{fileName}</span> — I love
                that. But this one&rsquo;s mine, and I&rsquo;d like to be the one who tells you who I am.
                <br />
                <br />
                Take a copy instead. It&rsquo;s yours, it saves properly, and you can rewrite every word of it.
              </p>
            </div>
          </div>

          <div
            className="flex justify-end gap-2 px-5 py-3.5"
            style={{ background: "var(--os-card)", borderTop: "1px solid var(--os-border)" }}
          >
            <button
              type="button"
              onClick={onKeepEditing}
              className="rounded-md px-4 py-[7px] text-[13px] transition-colors hover:bg-[var(--os-hover)]"
              style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
            >
              Keep editing
            </button>
            <button
              data-modal-primary
              type="button"
              onClick={onSaveCopy}
              className="rounded-md px-4 py-[7px] text-[13px] font-medium transition-transform active:scale-[.98]"
              style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
            >
              Save a copy
            </button>
          </div>
        </div>
      </div>
    </ModalSurface>
  )
}
