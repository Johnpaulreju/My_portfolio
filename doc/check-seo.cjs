/* Focused source-level checks; does not replace Next build or real browser QA.
 * Uses the installed TypeScript transpiler, without a fake PortfolioShell.
 */
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")
const root = path.resolve(__dirname, "..")

function createLoader(overrides = {}) {
  const cache = new Map()
  function load(filename) {
    const file = path.resolve(root, filename)
    if (cache.has(file)) return cache.get(file).exports
    const module = { exports: {} }
    cache.set(file, module)
    const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
      fileName: file,
    }).outputText
    const localRequire = (id) => {
      if (overrides[id]) return overrides[id]
      if (id.endsWith(".css")) return new Proxy({}, { get: (_, key) => key === "__esModule" ? false : String(key) })
      if (id.startsWith("@/") || id.startsWith(".")) {
        const base = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id)
        const target = [base, `${base}.ts`, `${base}.tsx`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile())
        assert.ok(target, `Local source exists: ${id}`)
        return load(target)
      }
      return require(id)
    }
    new Function("require", "module", "exports", code)(localRequire, module, module.exports)
    return module.exports
  }
  return load
}

function findElement(tree, predicate) {
  if (!React.isValidElement(tree)) return null
  if (predicate(tree)) return tree
  for (const child of React.Children.toArray(tree.props.children)) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return null
}

async function main() {
  const load = createLoader()
  const site = load("lib/site.ts")
  const { PROFILE, SKILL_GROUPS, TIMELINE } = load("lib/os/content.ts")
  assert.equal(site.resolveSiteUrl(undefined), "https://www.johnpaulreju.in")
  assert.equal(site.resolveSiteUrl("https://example.com/"), "https://example.com")
  for (const invalid of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?q=x", "https://example.com/#x", "not-a-url"]) {
    assert.throws(() => site.resolveSiteUrl(invalid), `Reject invalid origin: ${invalid}`)
  }
  const paths = ["/", "/about", "/resume"]
  const metadata = paths.map((p) => site.pageMetadata(p))
  assert.equal(new Set(metadata.map((m) => m.title.absolute)).size, 3)
  assert.equal(new Set(metadata.map((m) => m.description)).size, 3)
  metadata.forEach((m, i) => {
    const canonical = `${site.SITE_URL}${paths[i] === "/" ? "" : paths[i]}`
    assert.equal(m.alternates.canonical, canonical)
    assert.equal(m.openGraph.url, canonical)
    assert.equal(m.openGraph.images[0].url, `${site.SITE_URL}/opengraph-image`)
    assert.equal(m.twitter.card, "summary_large_image")
  })
  assert.deepEqual(load("app/sitemap.ts").default().map((v) => v.url), metadata.map((m) => m.alternates.canonical))
  assert.equal(load("app/robots.ts").default().sitemap, `${site.SITE_URL}/sitemap.xml`)
  const data = site.siteStructuredData()
  assert.deepEqual(data["@graph"].map((v) => v["@type"]), ["Person", "WebSite"])
  assert.equal(data["@graph"][0].name, PROFILE.name)
  assert.equal(data["@graph"][0].jobTitle, "Software Engineer")
  assert.match(data["@graph"][0].description, /GenAI Engineer/)
  for (const m of metadata) assert.match(`${m.title.absolute} ${m.description}`, /Software Engineer/i)
  assert.match(metadata[0].title.absolute, /Software Engineer · Upcoming GenAI Engineer/)
  assert.match(metadata[0].openGraph.images[0].alt, /Upcoming GenAI Engineer/)
  assert.doesNotMatch(JSON.stringify(data), /85%|70%|ICU Predictor|johnpaul\.dev/)
  assert.doesNotMatch(fs.readFileSync(path.join(root, "lib/os/system-store.ts"), "utf8"), /odyssey/i, "No employer name in Wi-Fi names")
  console.log("PASS origin validation, unique metadata, identity titles, canonicals, sitemap, robots and JSON-LD")

  const { ProfileFallback } = load("components/site/profile.tsx")
  const fallback = renderToStaticMarkup(React.createElement(ProfileFallback))
  for (const url of ["/about", "/resume", `mailto:${PROFILE.email}`]) assert.ok(fallback.includes(`href="${url}"`))
  assert.ok(fallback.includes(PROFILE.name))
  assert.ok(fallback.includes(PROFILE.headline))
  for (const name of ["about", "resume"]) {
    const Page = load(`app/${name}/page.tsx`).default
    const html = renderToStaticMarkup(React.createElement(Page))
    assert.ok(html.includes(PROFILE.name))
    assert.ok(html.includes(PROFILE.headline))
    assert.equal((html.match(/<h1\b/g) || []).length, 1)
    assert.equal((html.match(/<main\b/g) || []).length, 1)
    assert.doesNotMatch(html, /85%|70%|ICU Predictor|johnpaul\.dev/)
    for (const group of SKILL_GROUPS) for (const item of group.items) assert.ok(html.includes(item.name), item.name)
    if (name === "resume") for (const event of TIMELINE) assert.ok(html.includes(event.org), event.org)
  }
  const md = load("app/about.md/route.ts").GET()
  assert.equal(md.headers.get("content-type"), "text/markdown; charset=utf-8")
  assert.equal(md.headers.get("x-robots-tag"), "noindex")
  assert.ok(md.headers.get("link").includes(`${site.SITE_URL}/about`))
  const mdText = await md.text()
  assert.ok(mdText.includes("\n\n## Skills\n\n"))
  assert.ok(mdText.includes(`${PROFILE.headline} · ${PROFILE.location}`))
  const llms = await load("app/llms.txt/route.ts").GET().text()
  assert.ok(llms.startsWith(`# ${PROFILE.name}`))
  assert.ok(llms.includes(`> ${PROFILE.headline}.`))
  assert.ok(llms.includes(`${site.SITE_URL}/about.md`))
  assert.ok(renderToStaticMarkup(React.createElement(load("app/not-found.tsx").default)).includes("wrong turn"))
  assert.doesNotMatch(fs.readFileSync(path.join(root, "app/layout.tsx"), "utf8"), /maximumScale/)
  console.log("PASS server profile markup with headline, crawlable links, resume attribution, text routes, 404 copy and zoom setting")

  const { APP_META } = load("lib/os/app-meta.ts")
  const { brandIcon } = load("lib/os/brand-icons.ts")
  for (const id of Object.keys(APP_META)) {
    const { remote, local } = brandIcon(id)
    assert.match(remote, /^https:\/\/raw\.githubusercontent\.com\/lucide-icons\/lucide\/[a-f0-9]{40}\/icons\/[a-z0-9-]+\.svg$/)
    assert.ok(fs.existsSync(path.join(root, "public", local)), `Bundled image exists for ${id}`)
  }
  let state = [], cursor = 0
  const icons = createLoader({ react: { ...React, useState(initial) {
    const index = cursor++
    if (!(index in state)) state[index] = initial
    return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next }]
  } } })("components/os/app-icon.tsx")
  for (const appId of ["browser", "vantage"]) {
    state = []; cursor = 0
    const tile = icons.AppIcon({ appId, size: 40 })
    assert.equal(tile.props["aria-hidden"], "true")
    const component = findElement(tile, (e) => e.type.name === "IconImage")
    const render = () => { cursor = 0; return component.type(component.props) }
    let tree = render()
    let img = findElement(tree, (e) => e.type === "img")
    assert.equal(img.props.src, brandIcon(appId).remote)
    assert.equal(img.props.width, img.props.height)
    img.props.onLoad()
    assert.equal(findElement(render(), (e) => e.type === "img").props.style.opacity, 1)
    img.props.onError()
    tree = render()
    img = findElement(tree, (e) => e.type === "img")
    assert.equal(img.props.src, brandIcon(appId).local)
    assert.equal(img.props.style.opacity, 0)
    img.props.onLoad()
    assert.equal(findElement(render(), (e) => e.type === "img").props.style.opacity, 1)
    img.props.onError()
    tree = render()
    assert.equal(findElement(tree, (e) => e.type === "img"), null)
    assert.equal(React.Children.toArray(tree.props.children)[0].props.style.visibility, "visible")
  }
  console.log(`PASS all ${Object.keys(APP_META).length} icon paths and remote → local → glyph error-handler transitions (source harness, not browser)`)

  if (process.argv.includes("--render-share-image")) {
    const response = load("app/opengraph-image.tsx").default()
    const png = Buffer.from(await response.arrayBuffer())
    assert.equal(png.subarray(1, 4).toString(), "PNG")
    assert.equal(png.readUInt32BE(16), 1200)
    assert.equal(png.readUInt32BE(20), 630)
    const output = path.join(root, ".cache/seo-share.png")
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, png)
    console.log("PASS share card rendered as 1200×630 PNG: .cache/seo-share.png")
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
