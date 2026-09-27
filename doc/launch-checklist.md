# Portfolio launch checklist

This is a deployment and owner-account checklist, not a claim that launch, verification, submission, indexing, or ranking has happened.

## Before integration is approved

- [ ] Merge the Shell change that exports the named `PortfolioShell` from `components/os/portfolio-shell.tsx`, accepts `children?: ReactNode`, and renders those children visibly during initial hydration. The SEO branch intentionally cannot typecheck that absent import on its own.
- [ ] In the Content lane, replace the existing `components/os/apps/vantage-app.tsx:50` `johnpaul.dev` display host with the shared `SITE_URL` origin. That app is outside SEO file ownership.
- [ ] Merge the shared content changes. Check `PROFILE` availability/learning, React Native skills, and removal of unsupported metrics/project ownership claims across the OS. The readable pages use optional-safe text readers and do not render numeric skill levels or timeline metrics.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `node doc/check-seo.cjs`, and `pnpm build` on the integrated branch. Do not count the expected missing-shell error as a passing full typecheck.
- [ ] Test home, `/about`, and `/resume` with JavaScript disabled and enabled. The initial home must include visible profile text and links; hydration must preserve the interactive OS. Confirm readable routes remain reachable after hydration.
- [ ] Check 320px phones, landscape, 767/768px transitions, desktop, keyboard focus, zoom, safe areas, reduced motion, and browser Back. Verify no horizontal clipping or obstructed links.
- [ ] Print `/resume` to PDF and inspect every page. The button opens browser printing; there is no prebuilt resume PDF download.
- [ ] Inspect all app tiles with successful images, blocked `raw.githubusercontent.com`, and blocked remote plus bundled images. Check stable dimensions, glyph recovery, no broken-image symbol, no missing `/brand/` requests, and no repeated extension probes.
- [ ] Refresh legacy `docs/*.jpg` screenshots in the Review lane. README embeds were removed because some captures contain the old employer-project catalogue. Do not reinsert them until the content is current.
- [ ] Verify placeholder media and unavailable portrait handling in the integrated content apps; the SEO changes do not replace those assets.

## Production configuration and responses

- [ ] Choose the canonical origin. Unset `NEXT_PUBLIC_SITE_URL` defaults to `https://www.johnpaulreju.in` (`johnpaulreju.in` redirects there with a 308). A configured value must be an HTTPS origin with no credentials, path, query, or fragment. Rebuild after changing it. Do not use `johnpaul.dev` without confirmed ownership and routing.
- [ ] Confirm any preview protection or production `X-Robots-Tag` headers are intentional. The checked-in robots route allows crawling; that alone does not override hosting controls.
- [ ] After an authorized deployment, fetch `/`, `/about`, and `/resume`: expect HTTP 200, real profile HTML, distinct titles/descriptions, exactly one self-canonical, and the configured origin in Open Graph metadata.
- [ ] Fetch `/opengraph-image`: expect a 1200×630 PNG and confirm the name/title are readable. Test the deployed social preview; local rendering does not prove a crawler can fetch it.
- [ ] Fetch `/robots.txt` and `/sitemap.xml`: the sitemap must list only the three substantive canonical HTML URLs. Do not add coming-soon Projects/Lab routes, share images, or Markdown duplicates.
- [ ] Fetch `/llms.txt` and `/about.md`: expect readable text/Markdown. The Markdown response points to `/about` with a canonical Link header and has `X-Robots-Tag: noindex`; it remains fetchable as a companion document.
- [ ] Fetch `/manifest.webmanifest` and `/favicon.ico` (16, 32 and 48 px). The manifest uses browser display mode; it does not promise offline support or installation requirements.
- [ ] Request a nonexistent path: verify HTTP 404, friendly recovery links, and noindex behavior. Check this in production because framework streaming can affect status behavior.
- [ ] Confirm `public/googlea26c8f8bf5bdc755.html` is byte-for-byte unchanged and serves the existing verification token. Its presence does not establish account ownership or verification status.

## Google Search Console — owner account required

1. Open [Search Console](https://search.google.com/search-console) in the authorized owner’s account. Add the actual canonical URL-prefix property, or a domain property only if DNS control is available.
2. Follow [Google’s ownership verification instructions](https://support.google.com/webmasters/answer/9008080). Reuse the existing HTML file only if the account/property expects that exact token. A domain property uses DNS verification.
3. Submit the deployed canonical `/sitemap.xml`. Record the submitted URL and processing status; do not infer success from an HTTP 200 alone.
4. Use URL Inspection for home, About, and Resume. Inspect fetched/rendered HTML, canonical selection, indexing eligibility, and any blocking headers. Request indexing where appropriate, then monitor the account’s reported status.

## Bing Webmaster Tools — owner account required

1. Add the canonical site in [Bing Webmaster Tools](https://www.bing.com/webmasters/) or use the supported Search Console import flow with an authorized account.
2. Complete the account-provided ownership method. Do not add an invented verification token to this repository. See [Bing’s site verification help](https://www.bing.com/webmasters/help/add-and-verify-site-12184f8b).
3. Submit `/sitemap.xml` and inspect the substantive pages using the account tools. Check crawl/index reports after processing. Submission does not guarantee inclusion.

## Why these changes

Server-rendered profile content and ordinary links make useful information available before client execution. Google recommends server rendering or pre-rendering for users and crawlers, meaningful metadata, and crawlable links: [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

`llms.txt` follows the [primary proposal](https://llmstxt.org/) as a small guide to useful profile material. It is supplementary. [Google’s AI-feature guidance](https://developers.google.com/search/docs/appearance/ai-features) says no special AI text file or schema is required; neither indexing nor serving is guaranteed.

Review the [Bing Webmaster Guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a) during account setup. The current guideline URL timed out in this implementation environment, and the alternate help URL returned only a JavaScript app shell, so its full current text was not independently verified here.
