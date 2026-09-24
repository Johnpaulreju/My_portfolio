"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"

/**
 * Contains a crash to the window it happened in.
 *
 * Without this, one failing lazy chunk takes the whole OS down - and that is not
 * a hypothetical: it fires whenever a deploy lands while someone has the tab
 * open and an app chunk URL stops resolving. A single app should be able to fail
 * the way a single app fails on a real machine.
 */
type Props = { appTitle: string; children: ReactNode }
type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep it in the console for whoever is debugging; never swallow it silently.
    console.error(`[JP OS] ${this.props.appTitle} crashed`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    // A stale-chunk failure is worth naming, because the fix is different.
    const stale =
      /Loading chunk|ChunkLoadError|dynamically imported module|Importing a module script failed/i.test(
        error.message,
      )

    return (
      <div
        className="os-scroll grid h-full place-items-center overflow-auto p-8"
        style={{ background: "var(--os-surface)" }}
        role="alert"
      >
        <div className="max-w-[420px] text-center">
          <span
            className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full"
            style={{ background: "var(--os-accent-soft)", color: "var(--os-accent-fg)" }}
          >
            <TriangleAlert size={22} />
          </span>
          <h2 className="mb-2 text-[16px] font-semibold" style={{ color: "var(--os-fg)" }}>
            {this.props.appTitle} stopped working
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed" style={{ color: "var(--os-muted)" }}>
            {stale
              ? "This app's code couldn't load - usually because the site was updated while this tab was open. Reloading the page will fix it."
              : "Something in this app threw an error. The rest of JP OS is unaffected - close this window and carry on."}
          </p>

          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex items-center gap-1.5 rounded-md px-4 py-[7px] text-[13px]"
              style={{ color: "var(--os-fg)", border: "1px solid var(--os-border)" }}
            >
              <RotateCw size={14} /> Try again
            </button>
            {stale && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md px-4 py-[7px] text-[13px] font-medium"
                style={{ background: "var(--os-accent)", color: "var(--os-on-accent)" }}
              >
                Reload JP OS
              </button>
            )}
          </div>

          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-[11.5px]" style={{ color: "var(--os-muted)" }}>
              Technical detail
            </summary>
            <pre
              className="os-scroll mt-2 max-h-[120px] overflow-auto whitespace-pre-wrap rounded p-2 text-[11px]"
              style={{ background: "var(--os-card)", color: "var(--os-muted)" }}
            >
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
