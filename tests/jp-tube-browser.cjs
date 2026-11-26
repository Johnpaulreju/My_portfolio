// Run against a local build with PLAYWRIGHT_PATH pointing to an installed Playwright.
const assert = require("node:assert/strict")
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")
const origin = new URL(process.env.TUBE_QA_URL || "http://localhost:3000")
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))

async function check(browser, mobile) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce",
  })
  const button = (scope, name) => scope.getByRole("button", { name, exact: true })
  const player = page.getByRole("dialog", { name: /JP Tube/ })
  async function launch(name) {
    if (mobile) {
      await button(page, "All apps").click()
      const drawer = page.getByRole("dialog", { name: "All apps", exact: true })
      await drawer.getByRole("searchbox").fill(name)
      await button(drawer, name).click()
    } else {
      await button(page, "Start").click()
      await button(page.getByRole("dialog", { name: "Start menu" }), name).click()
    }
  }
  async function loaded(id) {
    await page.waitForFunction(clipId => {
      const video = document.querySelector(`video[src="/media/guides/${clipId}.mp4"]`)
      return video && video.currentTime > 0 && !video.paused && video.duration > 0 && video.textTracks[0]?.cues?.length > 0
    }, id)
    assert.equal(await player.locator("video").evaluate(v => v.textTracks[0].mode), "showing")
  }
  try {
    await page.goto(origin.href)
    const full = page.getByRole("checkbox", { name: "Open in full screen" })
    if (await full.isVisible()) await full.uncheck()
    await button(page, "Power on").click()
    if (!mobile) await button(page.getByRole("dialog", { name: "Welcome", exact: true }), "Start exploring").click()
    await launch("JP Tube")

    const published = player.getByRole("region", { name: "Published videos" })
    await published.waitFor()
    assert.equal(await published.getByRole("button").count(), 2)
    const tour = published.getByRole("button").first()
    await tour.press("Enter")
    await loaded("portfolio-tour")
    await button(player, "English captions").click()
    await page.waitForFunction(() => document.querySelector("video")?.textTracks[0]?.mode === "disabled")
    await button(player, "English captions").click()
    await button(player, "Save locally").click()
    await button(player, "Saved").click()
    assert.equal(await published.getByRole("button").count(), 1)
    await button(player, "All videos").click()
    await button(player, "Next video").click()
    await loaded("plan0-demo")

    // Retain a different clip and its local state before using the cross-app shortcut.
    await published.getByRole("button").first().click()
    await loaded("portfolio-tour")
    await player.getByRole("textbox", { name: "Search videos" }).fill("coding animation")
    const previous = await player.getAttribute("data-window-id")
    assert.ok(previous)
    if (mobile) await button(page.getByRole("navigation", { name: "Phone navigation" }), "Home").click()
    else await button(player, "Minimize").click()
    await page.waitForFunction(() => document.querySelector("video")?.paused)
    await launch("Projects")
    await button(page.getByRole("dialog", { name: "Projects", exact: true }), "Watch Plan0 demo").click()
    await loaded("plan0-demo")
    assert.equal(await player.getAttribute("data-window-id"), previous)
    assert.equal(await player.getByRole("textbox", { name: "Search videos" }).inputValue(), "")
    assert.equal(await player.count(), 1)
    assert.ok(await player.getByRole("region", { name: "Player samples" }).getByRole("button").count() > 0)
    console.log(mobile ? "Phone JP Tube deep link and captions passed" : "Desktop JP Tube deep link and captions passed")
  } finally {
    await page.close()
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: "chrome", args: ["--mute-audio"] })
  try {
    await check(browser, false)
    await check(browser, true)
  } finally {
    await browser.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
