"use client"

import { useRef, useState } from "react"
import { X } from "lucide-react"
import { AppIcon } from "@/components/os/app-icon"
import { GAMES } from "@/lib/os/phone-home"
import type { AppId } from "@/lib/os/types"
import { useNativeModal } from "../drawer/phone-sheet"
import { AppTile, type Launch } from "./app-tile"

/** A launcher folder: a tile with tiny icons that opens a small popup. */
export function GamesFolder({ onLaunch, size = 48 }: { onLaunch: Launch; size?: number }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return <>
    <button ref={button} type="button" data-home-tile aria-haspopup="dialog" aria-label={`Games folder, ${GAMES.length} apps`} onClick={() => setOpen(true)} className="phone-app-tile flex min-h-12 min-w-12 flex-col items-center gap-1 rounded-xl py-1">
      <span className="phone-folder-icon grid grid-cols-2 place-items-center gap-0.5 rounded-[14px] p-1.5" style={{ width: size, height: size }} aria-hidden>
        {GAMES.map((id) => <AppIcon key={id} appId={id} size={Math.round(size / 2.9)} />)}
      </span>
      <span className="phone-app-label w-full truncate text-center text-xs text-white drop-shadow">Games</span>
    </button>
    {open && <FolderPopup apps={GAMES} restoreTo={button.current} onClose={() => setOpen(false)} onLaunch={(id, from) => { setOpen(false); onLaunch(id, from) }} />}
  </>
}

function FolderPopup({ apps, restoreTo, onClose, onLaunch }: { apps: AppId[]; restoreTo: HTMLElement | null; onClose: () => void; onLaunch: Launch }) {
  const ref = useRef<HTMLDialogElement>(null)
  useNativeModal(ref, restoreTo)
  return (
    <dialog ref={ref} aria-labelledby="phone-folder-title" className="phone-folder" onCancel={(e) => { e.preventDefault(); onClose() }} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex items-center pb-2">
        <span className="w-12" />
        <h2 id="phone-folder-title" className="flex-1 text-center text-lg font-medium">Games</h2>
        <button type="button" className="phone-touch rounded-full" aria-label="Close Games folder" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="grid grid-cols-3 gap-x-2 gap-y-3">
        {apps.map((id) => <AppTile key={id} id={id} onLaunch={onLaunch} size={52} />)}
      </div>
      <p className="mt-3 text-center text-xs opacity-75">Breaks are part of debugging.</p>
    </dialog>
  )
}
