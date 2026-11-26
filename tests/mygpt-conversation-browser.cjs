// Run against a local build with PLAYWRIGHT_PATH pointing to an installed Playwright.
// For a live check, set MYGPT_QA_URL explicitly to the public portfolio origin.
const assert = require("node:assert/strict")
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright")
const origin = new URL(process.env.MYGPT_QA_URL || "http://localhost:3000")
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) || origin.origin === "https://www.johnpaulreju.in")

async function check(browser, mobile) {
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 850 },
    reducedMotion: "reduce", hasTouch: mobile, isMobile: mobile,
  })
  try {
    await page.goto(origin.href)
    const full = page.getByRole("checkbox", { name: "Open in full screen" })
    if (await full.isVisible()) await full.uncheck()
    await page.getByRole("button", { name: "Power on", exact: true }).click()
    if (mobile) {
      await page.getByRole("button", { name: "All apps", exact: true }).tap()
      const drawer = page.getByRole("dialog", { name: "All apps" })
      await drawer.getByRole("searchbox").fill("MyGPT")
      await drawer.getByRole("button", { name: "MyGPT", exact: true }).tap()
    } else {
      await page.getByRole("dialog", { name: "Welcome" }).getByRole("button", { name: /MyGPT/ }).click()
    }

    const chat = page.getByRole("dialog", { name: "MyGPT", exact: true })
    const box = chat.getByRole("textbox", { name: "Message MyGPT" })
    const replies = chat.getByRole("article", { name: "MyGPT reply" })
    async function ask(question) {
      const index = await replies.count()
      await box.fill(question)
      await box.press("Enter")
      const reply = replies.nth(index)
      await reply.getByRole("button", { name: "Copy reply", exact: true }).waitFor({ timeout: 35000 })
      return {
        text: await reply.locator("p").innerText(),
        links: await reply.getByRole("link").evaluateAll(links => links.map(link => link.href)),
      }
    }
    const first = "Where did Johnpaul study?"
    const study = await ask(first)
    assert.match(study.text, /Kristu Jayanti/)
    assert.match(study.text, /JECRC/)
    const which = await ask("What did he build there?")
    assert.match(which.text, /Kristu Jayanti/)
    assert.match(which.text, /JECRC/)
    assert.match(which.text, /which|did you mean|do you mean/i)
    const college = await ask("Kristu Jayanti")
    assert.match(college.text, /Smart Admission Manager|interview schedul|admissions interview/i)
    assert.doesNotMatch(college.text, /Kothanur|Sitapura Extension/)

    const project = await ask("Tell me about Portfolio OS")
    assert.match(project.text, /desktop|windowed|Windows|phone home screen/i)
    const repository = await ask("What's its GitHub link?")
    assert.deepEqual(repository.links, ["https://github.com/Johnpaulreju/My_portfolio"])
    const plan = await ask("Tell me about Plan0")
    assert.match(plan.text, /software idea|project plan|project pack|coding agent/i)
    const planRepo = await ask("Does it have a public repository?")
    assert.match(planRepo.text, /Plan0/i)
    assert.match(planRepo.text, /no verified|no public|isn’t listed|not (?:list|public)|hasn’t (?:published|shared|listed)/i)
    assert.ok(planRepo.links.every(link => !link.startsWith("https://github.com/")))
    const site = await ask("What's its website?")
    assert.ok(site.links.includes("https://www.plan0.in/"))
    console.log("Passed education clarification, college work, public project repository, and multi-step Plan0 follow-ups")

    await chat.getByRole("button", { name: "Start a new chat", exact: true }).click()
    const fresh = await ask("What did he build there?")
    assert.match(fresh.text, /which|where|what.*(?:mean|mind)|specify|clarif/i)
    assert.doesNotMatch(fresh.text, /He (?:built|designed|developed)|Johnpaul (?:built|designed|developed)/i)
    const offTopic = await ask("What's a good pasta recipe?")
    assert.match(offTopic.text, /Johnpaul|portfolio/i)
    assert.doesNotMatch(offTopic.text, /boil|garlic|ingredients/i)
    const employer = await ask("Tell me about his work at Odyssey Therapeia.")
    assert.match(employer.text, /Odyssey/i)
    const work = await ask("What did he build there?")
    assert.match(work.text, /scribe|clinical|From The Trunk/i)
    assert.doesNotMatch(work.text, /Smart Admission Manager|Kristu Jayanti/)
    const previous = chat.getByRole("button", { name: first, exact: true })
    if (!(await previous.isVisible())) await chat.getByRole("button", { name: "Open sidebar", exact: true }).click()
    await previous.click()
    const afterSwitch = await ask("Does it have a public repo?")
    assert.match(afterSwitch.text, /Plan0/i)
    assert.ok(afterSwitch.links.every(link => !link.startsWith("https://github.com/")))
    // All three preceding user messages now refer to "it" without naming Plan0.
    const afterFourth = await ask("Can I visit its website?")
    assert.ok(afterFourth.links.includes("https://www.plan0.in/"))
    console.log("Passed fresh-chat isolation, off-topic redirect, employer follow-up and return to the previous conversation")

    await chat.getByRole("button", { name: "Start a new chat", exact: true }).click()
    const pitch = await ask("Why should we hire him?")
    assert.match(pitch.text, /Portfolio OS|Mafia|Plan0|ICU mortality prediction/i)
    const salary = await ask("What about the package?")
    assert.match(salary.text, /johnpaulreju2k@gmail\.com|\+91 77425 21023/)
    assert.ok(salary.links.includes("mailto:johnpaulreju2k@gmail.com"))
    assert.ok(salary.links.includes("tel:+917742521023"))
    assert.doesNotMatch(salary.text, /(?:₹|\$|INR\s*)\d|\b\d+\s*(?:LPA|lakhs?)\b/i)

    // The loaded app must honor the same disclosure rules during an API outage.
    await page.route("**/api/ask", route => route.fulfill({ status: 503, body: "" }))
    const invite = await ask("Can we schedule an interview with him?")
    assert.match(invite.text, /johnpaulreju2k@gmail\.com|\+91 77425 21023/)
    const offlinePlan = await ask("Tell me about Plan0")
    assert.match(offlinePlan.text, /idea|planning/i)
    const internal = await ask("How does it work internally?")
    assert.match(internal.text, /overview|purpose|public|private|discuss|share/i)
    assert.doesNotMatch(offlinePlan.text + internal.text, /PRODUCT\.md|exported ZIP|community garden watering|five planning prompts/i)
    console.log("Passed hiring evidence, compensation contact, offline interview referral and project disclosure")
  } finally {
    await page.close()
  }
}

;(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--mute-audio"] })
  try { await check(browser, process.env.MYGPT_QA_PHONE === "1") }
  finally { await browser.close() }
})().catch(error => { console.error(error); process.exitCode = 1 })
