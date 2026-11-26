# Portfolio OS

A portfolio that boots. Johnpaul K Reju’s interactive desktop becomes an Android-inspired home screen on phones. Profile information is also available as ordinary, readable pages.

**Full Stack AI Engineer · Bengaluru, Karnataka, India**

I build clinical software, storefronts and tools for developers.

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
| Blog | Medium articles and public social profiles |
| MyGPT | Portfolio chat with a message composer, source links and conversations saved in this browser |
| Projects | Employer and client projects, personal work and academic research. |
| Lab | Notes on model training and graduate research. |
| Contact | Hands an email draft to the visitor’s own mail app |
| Resume | Resume viewer with browser printing; `/resume` provides a readable, printable page |
| Nimbus, Vantage | Original browser and search interfaces for exploring the portfolio |
| Notepad, Docs, Files | Local notes, documents, and virtual filesystem tools |
| Settings, Terminal, This PC, Recycle Bin | Portfolio OS controls and utilities |
| Media Player, JP Tube | JP Tube hosts the portfolio tour and Plan0 walkthrough. The Media Player and JP Tube also include generated coding samples. |
| Minesweeper, Solitaire, Ridgeline | Games within the OS |

Project descriptions identify the employer, partner, client or academic institution where relevant and describe Johnpaul’s contribution.

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

The stack is Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand, and Lucide. The existing `--os-*` tokens style both the OS and readable pages. App icons use locally bundled artwork drawn from familiar applications. A Lucide glyph provides a fallback if an image fails to load. [Asset sources and licenses](public/brand/README.md).

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

The optional `NEXT_PUBLIC_SITE_URL` controls the public canonical origin. It must be an HTTPS origin with no credentials, path, query, or fragment. Unset uses the existing Vercel origin above; invalid values fail validation. Change it only after confirming the new domain belongs to you and is routed correctly.

## Ask Johnpaul

MyGPT, Nimbus’s JP assistant and the Terminal’s `ask` command answer from Johnpaul’s public portfolio. MyGPT remembers the public records used in recent replies within the same chat. If a visitor refers to one of several colleges or projects, it asks which one they mean. Common questions use the catalogue directly. Gemini can select records for other portfolio questions. The server supplies the answer text and checks published repository links against Johnpaul’s GitHub account.

For local development, set the server-only `GEMINI_API_KEY` in the ignored `.env.local` and restart `pnpm dev`. Use a Gemini API project on Google’s Free Tier to keep usage free. The app uses `gemini-3.1-flash-lite`. Google may use unpaid requests to improve its products. Questions and up to three recent portfolio questions can be sent to Google. Keep personal or confidential details out of the conversation.

On Vercel, set the secret in the deployment environment. The free-tier integration checks the visitor country header for eligible visitors. The local assistant remains available for other visitors and when the key or provider is unavailable. [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) · [Gemini API terms](https://ai.google.dev/gemini-api/terms)

Each running server instance limits Gemini to 6 calls per minute, 30 per rolling day and 2 simultaneous calls per visitor IP. Across visitors the same instance allows 20 per minute, 200 per rolling day and 4 simultaneous calls. Failed attempts count. Public catalogue answers use no Gemini quota. Google enforces the project quota across instances. [Gemini rate limits](https://aistudio.google.com/docs/rate-limits)

## Search and launch

The search layer includes unique page metadata, self-canonicals, Person/WebSite JSON-LD, a generated PNG share card, robots, a sitemap, and a Markdown profile. The sitemap includes only `/`, `/about`, and `/resume`. `llms.txt` is a supplementary guide, not a Google requirement or a ranking promise.

Use the [launch checklist](doc/launch-checklist.md) for integration checks, production URL inspection, and the owner’s Google Search Console / Bing verification and sitemap submission steps. Those account steps are not completed by adding files to this repository.

## Screenshots

The files in `docs/` were refreshed on 27 September 2026 from this local content-fix build: desktop, Start, context menu, phone home and the explicit JP Tube demo. They predate the current project catalogue. Browser QA used Chrome with emulated phone dimensions. The lead must run final integrated checks.

JP Tube opens with a guided visit to the portfolio. The Plan0 project entry opens its walkthrough directly in the same player. Both recordings support English captions. The player samples have their own queue. Likes, saves and comments last for the current window session. The separate Media Player uses the first coding sample. Historical files under `reports/` and `research_notes/` are preserved with supersession notes.

See [how it works](doc/how-it-works.md) for the implementation notes. Microsoft, Windows, and Android names refer to interface inspiration; Nimbus and Vantage are original portfolio apps.
