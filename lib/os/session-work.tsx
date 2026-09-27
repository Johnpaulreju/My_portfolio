"use client"

import { createContext, useContext, useEffect } from "react"
import { useWM } from "./wm-store"

export const SessionWorkContext = createContext<string | null>(null)

/** Editors report their own buffer state; shell surfaces never guess by app name. */
export function useSessionWork(dirty: boolean) {
  const id = useContext(SessionWorkContext)
  const setUnsavedWork = useWM((s) => s.setUnsavedWork)
  useEffect(() => {
    if (id) setUnsavedWork(id, dirty)
  }, [id, dirty, setUnsavedWork])
}
