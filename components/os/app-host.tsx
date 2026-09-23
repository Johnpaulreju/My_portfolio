"use client"

import type { AppId, WindowInstance } from "@/lib/os/types"
import { AboutApp } from "./apps/about-app"
import { AchievementsApp } from "./apps/achievements-app"
import { BrowserApp } from "./apps/browser-app"
import { ContactApp } from "./apps/contact-app"
import { ExperienceApp } from "./apps/experience-app"
import { ExplorerApp } from "./apps/explorer-app"
import { LabApp } from "./apps/lab-app"
import { NotepadApp } from "./apps/notepad-app"
import { ProjectsApp } from "./apps/projects-app"
import { ResumeApp } from "./apps/resume-app"
import { SettingsApp } from "./apps/settings-app"
import { SkillsApp } from "./apps/skills-app"
import { TerminalApp } from "./apps/terminal-app"

/**
 * Renders the body of an app. Windowed apps get their `win` so they can read
 * payload (which file to open) and update their own title.
 */
export function AppHost({ appId, win }: { appId: AppId; win: WindowInstance }) {
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
    default: return null
  }
}
