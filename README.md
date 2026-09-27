# Portfolio OS

A portfolio that boots. Johnpaul K Reju’s interactive desktop becomes an Android-inspired home screen on phones. Profile information is also available as ordinary, readable pages.

**Software Engineer · Upcoming GenAI Engineer · Bangalore, India**

I build websites, React Native apps and AI tools. Next, I’m growing into a GenAI engineer by studying AI agents.

- [Portfolio OS](https://www.johnpaulreju.in)
- [About](https://www.johnpaulreju.in/about)
- [Resume](https://www.johnpaulreju.in/resume)
- [Contact Johnpaul](mailto:johnpaulreju2k@gmail.com)

These are the intended production URLs; new routes require the launch changes to be deployed.

## Explore

The desktop includes draggable windows, a taskbar, Start menu, themes, and a local virtual filesystem. On phones (below 768px, or a phone held sideways), the phone shell provides an app grid, drawer, recents, and navigation controls. Browser storage keeps files and preferences on that browser; it is not cloud storage.

| App | Content |
| --- | --- |
| About, Skills, Experience | Shared profile, tools, and attributed work and education history |
| Projects | Coming soon. A few projects are cooking in the CPU. |
| Lab | Coming soon. Small experiments are still cooking. |
| Contact | Hands an email draft to the visitor’s own mail app |
| Resume | Resume viewer with browser printing; `/resume` provides a readable, printable page |
| Nimbus, Vantage | Original browser and search interfaces for exploring the portfolio |
| Notepad, Docs, Files | Local notes, documents, and virtual filesystem tools |
| Settings, Terminal, This PC, Recycle Bin | Portfolio OS controls and utilities |
| Media Player, JP Tube | Local players with generated coding demos; JP Tube has an empty published catalogue and an explicit demo mode |
| Minesweeper, Solitaire, Ridgeline | Games within the OS |

Projects and Lab do not publish a personal project catalogue. Employer work stays attributed in the work history. A public GitHub profile link is not an ownership claim over every repository.

## Architecture

```text
app/page.tsx                    server profile fallback + PortfolioShell
components/os/portfolio-shell   client hydration, power state, desktop/phone selection
components/os/desktop/          desktop windows, taskbar, menus
components/os/mobile/           phone shell
components/os/apps/             shared interactive apps
components/site/               readable profile, links, scoped styling
app/about/ + app/resume/        server-rendered content routes
lib/os/content.ts              shared profile, skills, and timeline
lib/os/app-meta.ts              app registry
lib/site.ts                    canonical origin, page metadata, profile helpers
```

The server home passes visible profile content to `PortfolioShell`. The shell renders it during initial hydration; the standalone pages remain available without JavaScript.

The stack is Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, and Lucide. The existing `--os-*` tokens style both the OS and readable pages. App tiles use pinned upstream Lucide SVGs, bundled copies, and built-in glyph recovery. [Asset sources and licenses](public/brand/README.md).

## Run and check

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm typecheck
pnpm lint
node doc/check-seo.cjs
pnpm build
```

`doc/check-seo.cjs` checks the SEO data, rendered profile content, icon recovery transitions, and asset mappings. It does not replace an integrated build or browser QA.

Copy `.env.example` only if you need to set `NEXT_PUBLIC_SITE_URL`. It must be an HTTPS origin with no credentials, path, query, or fragment. Unset uses the existing Vercel origin above; invalid values fail validation. Change it only after confirming the new domain belongs to you and is routed correctly.

## Search and launch

The search layer includes unique page metadata, self-canonicals, Person/WebSite JSON-LD, a generated PNG share card, robots, a sitemap, and a Markdown profile. The sitemap includes only `/`, `/about`, and `/resume`. `llms.txt` is a supplementary guide, not a Google requirement or a ranking promise.

Use the [launch checklist](doc/launch-checklist.md) for integration checks, production URL inspection, and the owner’s Google Search Console / Bing verification and sitemap submission steps. Those account steps are not completed by adding files to this repository.

## Screenshots

The files in `docs/` were refreshed on 27 September 2026 from this local content-fix build: desktop, Start, context menu, phone home and the explicit JP Tube demo. They show the current empty published catalogue, not a deployed-production claim. Browser QA used Chrome with emulated phone dimensions. The lead must run final integrated checks.

JP Tube’s two silent animations are generated code art, not personal recordings or project walkthroughs. Play/pause, English captions, queue/autoplay, local likes/dislikes, saves and comments can be tried without an account. This demo state lasts only while the Tube window stays open and is cleared by closing or reloading; nothing is posted. The separate Media Player uses the same first demo asset. Historical files under `reports/` and `research_notes/` are preserved with supersession notes; old ownership assumptions and launch suggestions there are not current claims.

See [how it works](doc/how-it-works.md) for the implementation notes. Microsoft, Windows, and Android names refer to interface inspiration; Nimbus and Vantage are original portfolio apps.
