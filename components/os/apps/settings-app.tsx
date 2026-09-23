"use client"

import { Moon, RotateCcw, Sun, Info, Palette } from "lucide-react"
import { useWM } from "@/lib/os/wm-store"
import { useFS } from "@/lib/os/fs-store"
import { PROFILE } from "@/lib/os/content"
import { Button, Card, Page, PageTitle, Row } from "./kit"

export function SettingsApp() {
  const { theme, setTheme, closeAll } = useWM()
  const { reset, nodes } = useFS()

  return (
    <Page>
      <PageTitle title="Settings" sub="Personalise this desktop." />

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <Palette size={15} /> Appearance
      </h2>
      <Card className="mb-6 p-4">
        <p className="mb-3 text-[13px]" style={{ color: "var(--os-muted)" }}>
          Choose a mode
        </p>
        <div className="flex gap-3">
          {(
            [
              { id: "dark", label: "Dark", icon: <Moon size={15} /> },
              { id: "light", label: "Light", icon: <Sun size={15} /> },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className="flex flex-1 flex-col gap-2 rounded-lg p-3 text-left transition-all"
              style={{
                background: "var(--os-card)",
                border: `2px solid ${theme === opt.id ? "var(--os-accent)" : "var(--os-border)"}`,
              }}
            >
              {/* Miniature preview of the desktop in that mode. */}
              <span
                className="block h-16 w-full rounded"
                style={{
                  background:
                    opt.id === "dark"
                      ? "radial-gradient(90% 90% at 50% 45%, #1b3b6f, #0a1230)"
                      : "radial-gradient(90% 90% at 50% 45%, #7db4f0, #2a5fb0)",
                }}
              >
                <span className="mt-[46px] block h-2.5 w-full rounded-b bg-black/25" />
              </span>
              <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--os-fg)" }}>
                {opt.icon} {opt.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <RotateCcw size={15} /> Storage
      </h2>
      <Card className="mb-6">
        <Row label="Items on this desktop" value={`${nodes.length}`} />
        <Row
          label="Reset files"
          value="Restores the starter files"
          action={
            <Button
              onClick={() => {
                if (window.confirm("Delete everything you've created and restore the starter files?")) reset()
              }}
            >
              Reset
            </Button>
          }
        />
        <Row
          label="Close all windows"
          value=""
          action={<Button onClick={closeAll}>Close all</Button>}
        />
      </Card>

      <h2 className="mb-2 flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--os-fg)" }}>
        <Info size={15} /> About
      </h2>
      <Card>
        <Row label="Device name" value="PORTFOLIO-PC" />
        <Row label="Owner" value={PROFILE.name} />
        <Row label="Edition" value="Portfolio OS" />
        <Row label="Built with" value="Next.js · React · TypeScript · Tailwind" />
      </Card>
    </Page>
  )
}
