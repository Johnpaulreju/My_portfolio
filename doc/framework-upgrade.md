# Framework upgrade — 27 September 2026

This migration replaces unsupported Next.js 14.2.35 with **15.5.26**, the current patched Maintenance LTS release verified against npm on 27 September 2026. It is based on source commit `822bb66e8e734c839cfbde0f93327a70f4575c00`.

**Integration requirement:** this lane commits configuration and documentation only. Apply the two companion patches from the framework lane's `.cache/framework-upgrade/` before building the integrated app. The tested production build includes both patches. The configuration commit alone has React 19 type errors and the old React 18 `inert` workaround; it is not independently deployable.

## Version choice and support horizon

The live registry returned `next@latest = 16.3.6`, `next@backport = 15.5.26`, and `next@next-14 = 14.2.35`. The [Next.js support policy](https://nextjs.org/support-policy) lists 16.x as Active LTS, 15.x as Maintenance LTS, and 14.x as unsupported. Choosing 15.5.26 keeps webpack production builds, existing Next configuration, and the 14-to-15 migration boundary. No experimental runtime features were enabled.

The [22 September security update](https://nextjs.org/blog/nextjs-security-update-september-22-2026) explicitly identifies 15.5.26 as the patched Maintenance LTS release. Its `next/og` hardening is included; the critical Node ImageResponse issue described there affects 16.2.0 through versions below 16.3.6, not 15.x. The [15.5.26 release](https://github.com/vercel/next.js/releases/tag/v15.5.26) confirms the hardening.

This is a short migration bridge. The published two-year maintenance policy and 21 October 2024 initial release imply a **21 October 2026** support horizon for 15.x. Recheck vendor policy and schedule the next supported-major migration before then.

| Package/tool | Selected version | Reason |
| --- | --- | --- |
| `next`, `@next/bundle-analyzer`, `eslint-config-next` | 15.5.26 | Matching stable framework/tooling versions |
| `react`, `react-dom` | 19.1.9 | Current patch of the React 19.1 line; aligned runtime pair for App Router |
| `@types/react`, `@types/react-dom` | 19.1.17 / 19.1.11 | Match React 19.1 semantics |
| `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin` | 8.70.1 | Align with TypeScript 5.9 and ESLint 9, including nested Next config dependencies |
| `eslint` | 9.39.5 | Latest release accepted by `eslint-config-next@15.5.26`'s declared peer range |
| `@eslint/eslintrc` | 3.3.7 | Official FlatCompat bridge for the existing Core Web Vitals rules |
| Next's nested `postcss` | 8.5.28 | Scoped override of Next's 8.4.31 pin to the already used, patched PostCSS 8.x version |
| Node / pnpm used for all final checks | 22.23.2 / 11.20.0 | Existing local Node 22 LTS runtime and pinned package manager |

**Tooling limitation:** ESLint 9 reached EOL on 6 August 2026, per its [support policy](https://eslint.org/version-support/). Next 15's ESLint config declares ESLint 7/8/9 peers, not 10. This migration uses the latest peer-compatible version and reports the EOL status; it does not force ESLint 10 or suppress peer validation. Resolve this development-tool support debt with the follow-up framework/tooling migration. Both final audits report zero advisories, including development dependencies, but that does not confer ongoing vendor support.

## Compatibility and ownership

The [Next 15 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-15) requires React 19 for this App Router migration and changes default GET-handler caching. The [React 19 guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) covers its ref type changes. No synchronous request API usages, dynamic route parameters, or source Server Actions required migration here.

Companion patch `react19-compatibility.patch`:

- `components/os/apps/browser-app.tsx`: initialize `useRef<Set<string> | undefined>(undefined)` and accept `RefObject<HTMLInputElement | null>` for the omnibox. Preserve the existing lazy Set initialization and history behavior.
- `components/os/desktop/use-flyout-focus.ts`: accept `RefObject<HTMLElement | null>`, matching actual DOM-ref lifetime.
- `components/os/shell-dom.ts`: return `{ inert: true }` for inactive elements. React 19 recognizes this native boolean attribute; the React 18 empty-string workaround drops it. A production Chrome reproduction measured `aria-hidden="true"` but `inert === false` before this fix. The final browser checks verify `inert === true`, blocked background focus, and removal when the surface becomes active.

Companion patch `static-routes-compatibility.patch`:

- `app/about.md/route.ts` and `app/llms.txt/route.ts`: explicitly export `dynamic = "force-static"`. These deterministic content routes were prerendered under Next 14; this retains build-time generation under Next 15 without altering response content or custom headers.

These five source paths belong to other integration lanes, so their changes are delivered separately. Apply the patches to the final integrated versions with owner review if context conflicts. Do not overwrite newer shell/content work. The complete patch text, production evidence and report are retained in the originating worktree's ignored `.cache/framework-upgrade/` directory.

ESLint now uses `eslint.config.mjs` with the same `next/core-web-vitals` extension, following [Next's ESLint documentation](https://nextjs.org/docs/15/app/api-reference/config/eslint). `pnpm lint` invokes the ESLint CLI over the existing `app`, `components`, and `lib` source directories. No lint rule is disabled by the migration. Build lint/type checking stays enabled. `next.config.mjs`, `tsconfig.json`, image optimization policy, and application presentation/content remain unchanged by the configuration commit.

## Audit comparison and scoped PostCSS correction

| State | Production findings | Full dependency findings |
| --- | --- | --- |
| Baseline 14.2.35 lockfile | 27: 2 critical, 10 high, 13 moderate, 2 low | 28: adds one development-only high `glob` finding |
| Next 15.5.26 before scoped PostCSS override | 4: 2 high, 2 moderate | Same 4 |
| Final frozen lockfile | 0 | 0 |

The intermediate four findings all resolved through `root > next@15.5.26 > postcss@8.4.31`. Next's exact dependency pin otherwise retains the old version even with a patched direct PostCSS dependency.

| Advisory | Relevant prerequisite |
| --- | --- |
| [GHSA-qx2v-qp2m-jg93](https://github.com/postcss/postcss/security/advisories/GHSA-qx2v-qp2m-jg93) | Attacker-supplied CSS is parsed/stringified and embedded unsafely in an HTML style element |
| [GHSA-6g55-p6wh-862q](https://github.com/postcss/postcss/security/advisories/GHSA-6g55-p6wh-862q) | Attacker-controlled CSS source-map references processed with access to server/build files |
| [GHSA-r28c-9q8g-f849](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849) | Source-map auto-loading follows attacker-controlled traversal to readable map files |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) | Incomplete prior fix permits attacker-controlled map references when `from` is unset |

No server CSS-input service was identified in this static portfolio; local browser file/document editing does not imply a server PostCSS service. Nevertheless, `pnpm-workspace.yaml` now scopes the override specifically to `next@15.5.26>postcss: 8.5.28`. This same-major version is already used by the project's stylesheet toolchain. The real CSS build and inspected desktop/mobile screenshots pass. This was a reviewed targeted dependency change, not an audit force-fix. Revisit/remove the override when upstream's pinned dependency is patched. There are **no remaining production advisories in the final registry audit**, not a claim of absolute security or a penetration-test result.

## Runtime and deployment steps

1. Integrate the config commit and both source compatibility patches. Keep the existing OS design and other lanes' fixes.
2. Use Node **22.23.2** (the tested Node 22 LTS version) and **pnpm 11.20.0** in CI/build. `packageManager` pins pnpm; package engines require Node >=22.13.0 and pnpm >=11.20.0 <12. The pnpm 11 engine floor is stricter than Next 15's own Node requirement. Use a vendor-supported LTS runtime; Node 24 is LTS but was not exercised here. See [Node's release policy](https://nodejs.org/en/about/previous-releases).
3. Install with `pnpm install --frozen-lockfile`; do not regenerate the lockfile during deployment. The existing `allowBuilds.unrs-resolver` policy is retained. No broad lifecycle-script allowlist was added.
4. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, the shell/games/SEO suites below, then production smoke/browser checks against the integrated result. Invalidate old framework build caches once; rebuild rather than reusing `.next` from Next 14.
5. Preserve `NEXT_PUBLIC_SITE_URL` as the intended HTTPS canonical origin. No new secret, service, database migration or runtime environment variable is required. `pnpm start` still uses the normal Next server.
6. On the deployment provider, explicitly select the intended Node LTS version; do not rely on an open-ended engine range choosing it. Confirm the provider respects this pnpm version and workspace override. No deployment settings were changed in this lane.
7. Verify real production CDN behavior after deployment. Next 15 adds `next-router-segment-prefetch` to `Vary`; all prior RSC partitions remain (header token case is immaterial). A local header check does not prove CDN cache partitioning. Configured response semantics and `images.unoptimized: true` are retained; the optimizer route still returns 404. Its built-in 404 response no longer sends the previous font-preload Link header.

## Verification performed

With both companion patches applied, all of the following completed successfully on Node 22.23.2:

```sh
pnpm install --frozen-lockfile
pnpm peers check
pnpm typecheck
pnpm lint
pnpm build
node --test components/os/shell-regression.test.cjs
node tests/games/regression.cjs
node doc/check-seo.cjs
pnpm audit --prod --json
pnpm audit --json
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3125
node .cache/framework-upgrade/http-check.cjs
node .cache/framework-upgrade/browser-check.cjs
```

The build generates 13 static pages; the shell suite has one passing composite test and the games suite has 11 passing tests. Actual Chrome 153.0.8010.53 exercised fresh desktop/mobile boot, Start/Quick Settings focus, Nimbus, `/about` and `/resume` navigation, phone About/background inertness, drawer keyboard focus, home widths 320/390/767/768, and no-JavaScript home content. Screenshots and the generated OG PNG were visually inspected. Twelve HTTP route checks validate statuses/types, SEO metadata and profile links, sitemap, canonical text-route headers/caching, exact existing verification-file content and local llms links.

Known costs/limits: the build reports home first-load JS increasing from 152 kB to 162 kB, and shared JS from 87.6 kB to 103 kB; these are build estimates, not measured field performance. The known `/media/jp-portrait.jpg` 404 remains. Other lanes own the saved print, mobile, games and content findings. No PDF changes or printing were performed here. No physical-device, Safari/Firefox, deployed-origin, CDN, audible-media, full-gameplay or exploit verification was performed. The lead must run final whole-app checks after integration. Nothing was pushed, deployed or posted.
