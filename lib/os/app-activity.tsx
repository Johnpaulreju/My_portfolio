"use client"

import { createContext, useContext } from "react"

/** The shell owns visibility/focus; mounted apps retain their progress. */
export const AppActivityContext = createContext<boolean>(true)

export function useAppActive() {
  return useContext(AppActivityContext)
}
