// Run against a local build: PLAYWRIGHT_PATH=/path/to/playwright node tests/mygpt-composer-browser.cjs
const assert = require("node:assert/strict")
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")
const origin = new URL(process.env.MYGPT_QA_URL || "http://localhost:3000")
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))

async function check(browser, mobile) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1200, height: 760 }, isMobile: mobile, hasTouch: mobile })
  let requests = 0
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== origin.origin) return route.abort()
    if (url.pathname !== "/api/ask") return route.continue()
    requests++
    return route.fulfill({ status: 503, body: "" })
  })
  try {
    await page.goto(origin.href)
    const full = page.getByRole("checkbox", { name: "Open in full screen" })
    if (await full.isVisible()) await full.uncheck()
    await page.getByRole("button", { name: "Power on", exact: true }).click()
    if (mobile) {
      await page.getByRole("button", { name: "All apps", exact: true }).click()
      const drawer = page.getByRole("dialog", { name: "All apps" })
      await drawer.getByRole("searchbox").fill("MyGPT")
      await drawer.getByRole("button", { name: "MyGPT", exact: true }).tap()
    } else {
      await page.getByRole("dialog", { name: "Welcome" }).getByRole("button", { name: /MyGPT/ }).click()
    }
    const input = page.getByRole("textbox", { name: "Message MyGPT" })
    await input.fill("hey")
    await input.press("Shift+Enter")
    assert.equal(await input.inputValue(), "hey\n")
    await input.press("Shift+ArrowLeft")
    assert.equal(await input.evaluate(e => e.selectionEnd - e.selectionStart), 1)
    await input.press("Backspace")
    await input.dispatchEvent("keydown", { key: "Enter", isComposing: true })
    assert.equal(await input.inputValue(), "hey")
    const style = await input.evaluate(e => [getComputedStyle(e).outlineStyle, getComputedStyle(e).caretColor, getComputedStyle(e).color, parseFloat(getComputedStyle(e).fontSize)])
    assert.equal(style[0], "none")
    assert.equal(style[1], style[2])
    if (!mobile) {
      await input.press("Tab")
      const projectButton = page.getByRole("button", { name: "Reference a project" })
      assert.ok(await projectButton.evaluate(e => e === document.activeElement && getComputedStyle(e).outlineStyle !== "none"))
      await projectButton.press("Shift+Tab")
    }
    if (mobile) assert.ok(style[3] >= 16)
    if (mobile) await page.getByRole("button", { name: "Send message", exact: true }).tap()
    else await input.press("Enter")
    const reply = page.getByRole("article", { name: "MyGPT reply" }).first().locator("p")
    await reply.waitFor()
    assert.match(await reply.innerText(), /good to meet you/i)
    assert.equal(requests, 0)
    assert.ok(await input.evaluate(e => e === document.activeElement))

    if (!mobile) {
      // Physically drag across the user and assistant paragraphs, as when copying a conversation.
      const pos = (el, end) => {
        const range = document.createRange()
        const text = el.firstChild
        const offset = end ? Math.min(44, text.length) : 0
        range.setStart(text, offset)
        range.collapse(true)
        const r = range.getBoundingClientRect()
        return { x: r.x, y: r.y + r.height / 2 }
      }
      const start = await page.getByRole("article", { name: "Your message" }).locator("p").evaluate(pos, false)
      const end = await reply.evaluate(pos, true)
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(end.x, end.y, { steps: 12 })
      await page.mouse.up()
      assert.match(await page.evaluate(() => getSelection().toString()), /hey[\s\S]*good to meet you/i)
    }

    await input.fill("Thanks! Where did he study?")
    await input.press("Enter")
    await page.getByText(/Kristu Jayanti/).first().waitFor()
    assert.equal(requests, 1)
    if (mobile) {
      await page.getByRole("navigation", { name: "Phone navigation" }).getByRole("button", { name: "Home", exact: true }).tap()
      await page.getByRole("button", { name: "All apps", exact: true }).tap()
      const search = page.getByRole("dialog", { name: "All apps" }).getByRole("searchbox")
      const question = "Which projects has Johnpaul built?"
      await search.fill(question)
      await search.press("Enter")
      await page.getByRole("dialog", { name: "MyGPT", exact: true }).getByText(question, { exact: true }).last().waitFor()
    }
    console.log(mobile ? "Phone composer passed" : "Desktop composer and transcript selection passed")
  } finally { await page.close() }
}

;(async () => {
  const browser = await chromium.launch({ channel: "chrome" })
  try { await check(browser, false); await check(browser, true) }
  finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
