"use client"

import dynamic from "next/dynamic"
import type { AppId, WindowInstance } from "@/lib/os/types"
import { APP_META } from "@/lib/os/app-meta"
import { AppErrorBoundary } from "./app-error-boundary"

// Small, frequently-opened apps stay in the main bundle.
import { AboutApp } from "./apps/about-app"
import { AchievementsApp } from "./apps/achievements-app"
import { ContactApp } from "./apps/contact-app"
import { ExperienceApp } from "./apps/experience-app"
import { ExplorerApp } from "./apps/explorer-app"
import { LabApp } from "./apps/lab-app"
import { NotepadApp } from "./apps/notepad-app"
import { ProjectsApp } from "./apps/projects-app"
import { SettingsApp } from "./apps/settings-app"
import { SkillsApp } from "./apps/skills-app"
import { WelcomeApp } from "./apps/welcome-app"

/**
 * The heavy apps load on first open instead of on page load. Together they are
 * most of the source in this project, and a visitor who never opens Solitaire
 * should never pay for it.
 */
const loading = () => <AppLoading />

const BrowserApp = dynamic(() => import("./apps/browser-app").then((m) => m.BrowserApp), { ssr: false, loading })
const ComputerApp = dynamic(() => import("./apps/computer-app").then((m) => m.ComputerApp), { ssr: false, loading })
const DocsApp = dynamic(() => import("./apps/docs-app").then((m) => m.DocsApp), { ssr: false, loading })
const MinesweeperApp = dynamic(() => import("./apps/minesweeper-app").then((m) => m.MinesweeperApp), { ssr: false, loading })
const PlayerApp = dynamic(() => import("./apps/player-app").then((m) => m.PlayerApp), { ssr: false, loading })
const RidgelineApp = dynamic(() => import("./apps/ridgeline-app").then((m) => m.RidgelineApp), { ssr: false, loading })
const VantageApp = dynamic(() => import("./apps/vantage-app").then((m) => m.VantageApp), { ssr: false, loading })
const RecycleBinApp = dynamic(() => import("./apps/recycle-bin-app").then((m) => m.RecycleBinApp), { ssr: false, loading })
const ResumeApp = dynamic(() => import("./apps/resume-app").then((m) => m.ResumeApp), { ssr: false, loading })
const SolitaireApp = dynamic(() => import("./apps/solitaire-app").then((m) => m.SolitaireApp), { ssr: false, loading })
const TerminalApp = dynamic(() => import("./apps/terminal-app").then((m) => m.TerminalApp), { ssr: false, loading })
const TubeApp = dynamic(() => import("./apps/tube-app").then((m) => m.TubeApp), { ssr: false, loading })

function AppLoading() {
  return (
    <div className="grid h-full place-items-center" style={{ background: "var(--os-surface)" }}>
      <span className="text-[12.5px]" style={{ color: "var(--os-muted)" }}>
        Loading…
      </span>
    </div>
  )
}

/**
 * Renders the body of an app. Windowed apps get their `win` so they can read
 * payload (which file to open) and update their own title.
 */
export function AppHost({ appId, win }: { appId: AppId; win: WindowInstance }) {
  // Keyed by window id so "Try again" genuinely remounts this app, and so one
  // window's crash never bleeds into another instance of the same app.
  return (
    <AppErrorBoundary key={win.id} appTitle={APP_META[appId]?.title ?? "This app"}>
      {renderApp(appId, win)}
    </AppErrorBoundary>
  )
}

function renderApp(appId: AppId, win: WindowInstance) {
  switch (appId) {
    case "about": return <AboutApp />
    case "projects": return <ProjectsApp />
    case "experience": return <ExperienceApp />
    case "skills": return <SkillsApp />
    case "achievements": return <AchievementsApp />
    case "lab": return <LabApp />
    case "contact": return <ContactApp />
    case "browser": return <BrowserApp />
    case "notepad": return <NotepadApp win={win} />
    case "explorer": return <ExplorerApp win={win} />
    case "settings": return <SettingsApp />
    case "terminal": return <TerminalApp />
    case "resume": return <ResumeApp />
    case "welcome": return <WelcomeApp win={win} />
    case "recyclebin": return <RecycleBinApp win={win} />
    case "computer": return <ComputerApp win={win} />
    case "minesweeper": return <MinesweeperApp />
    case "solitaire": return <SolitaireApp />
    case "tube": return <TubeApp />
    case "player": return <PlayerApp win={win} />
    case "docs": return <DocsApp win={win} />
    case "ridgeline": return <RidgelineApp win={win} />
    case "vantage": return <VantageApp win={win} />
    default: return null
  }
}
