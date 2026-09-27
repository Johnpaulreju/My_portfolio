"use client"

import { useRef } from "react"
import { useNativeModal } from "../phone-dialog"

/** A screen torch: a full-white top-layer dialog. Any tap, Back or Escape turns it off. */
export function Flashlight({ onOff }: { onOff: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref)
  return (
    <dialog ref={ref} aria-label="Flashlight" className="shade-torch" onCancel={(e) => { e.preventDefault(); onOff() }}>
      <button type="button" autoFocus className="shade-torch-off" onClick={onOff}>
        Flashlight on. Tap anywhere to turn it off.
      </button>
    </dialog>
  )
}
