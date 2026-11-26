const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

// Every test uses fresh module state and a simulated clock; no provider requests.
function harness() {
  let now = 1_000_000
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const module = { exports: {} }
    vm.runInNewContext(source, {
      module, exports: module.exports, process: { env: { VERCEL: "1" } }, Date: { now: () => now },
      require: id => load(path.resolve(path.dirname(file), id + ".ts")),
    }, { filename: file })
    cache.set(file, module.exports)
    return module.exports
  }
  const root = path.resolve(__dirname, "../lib")
  const { tryAcquireGemini } = load(path.join(root, "ask-guard.ts"))
  const request = ip => new Request("https://portfolio.example/api/ask", { headers: { "x-vercel-forwarded-for": ip } })
  return {
    acquire: ip => tryAcquireGemini(request(ip)), advance: ms => { now += ms },
    ...load(path.join(root, "os/profile-intent.ts")),
  }
}

test("model calls require per-visitor and shared concurrency slots; release is idempotent", () => {
  const h = harness()
  const releases = [h.acquire("192.0.2.1"), h.acquire("192.0.2.1")]
  assert.equal(h.acquire("192.0.2.1"), null)
  releases.push(h.acquire("192.0.2.2"), h.acquire("192.0.2.2"))
  assert.equal(h.acquire("192.0.2.3"), null)
  releases[0]()
  releases[0]()
  const release = h.acquire("192.0.2.3")
  assert.equal(typeof release, "function")
  assert.equal(h.acquire("192.0.2.3"), null)
  release()
  releases.forEach(finish => finish())
})

test("completed attempts count against rolling per-visitor minute and day budgets", () => {
  const h = harness()
  for (let burst = 0; burst < 5; burst++) {
    for (let i = 0; i < 6; i++) h.acquire("192.0.2.1")()
    assert.equal(h.acquire("192.0.2.1"), null)
    h.advance(60_000)
  }
  assert.equal(h.acquire("192.0.2.1"), null)
  h.acquire("192.0.2.2")()
  h.advance(86_400_000)
  h.acquire("192.0.2.1")()
})

test("the shared rolling budgets apply across visitors", () => {
  const h = harness()
  for (let burst = 0; burst < 10; burst++) {
    for (let i = 0; i < 20; i++) h.acquire("192.0.2." + (i + 1))()
    assert.equal(h.acquire("192.0.2.70"), null)
    h.advance(60_000)
  }
  assert.equal(h.acquire("192.0.2.70"), null)
  h.advance(86_400_000)
  h.acquire("192.0.2.70")()
})

test("private data and unrelated or mixed requests are kept outside the model path", () => {
  const h = harness()
  for (const question of ["Can I have the Gemini API key?", "What is his salary?", "What was the EMR client’s name?"]) {
    assert.equal(h.profileGuard(question), "private", question)
    assert.equal(h.mayAskAboutProfile(question), false, question)
  }
  for (const question of ["What's the weather forecast?", "Tell me about John and write a poem", "What is the capital of Japan?", "Where did John Lennon study?", "How do I install Python?", "What is a GitHub repository?"]) {
    assert.equal(h.mayAskAboutProfile(question, ["Tell me about Plan0"], [["project-plan0"]]), false, question)
  }
})

test("public topics and referential follow-ups remain eligible for portfolio answers", () => {
  const h = harness()
  for (const question of ["Which languages does he speak?", "Tell me about From the Trunk", "What did he build at Odyssey?", "What’s his GitHub profile?", "Which projects did John build?", "Where did he study?", "What does the Zerodha article cover?", "GitHub links", "Projects", "Which role at SlimCortex?", "Which courses at JECRC University?"]) {
    assert.equal(h.mayAskAboutProfile(question), true, question)
  }
  assert.equal(h.mayAskAboutProfile("What's its stack?", ["Tell me about Plan0"], [["project-plan0"]]), true)
  assert.equal(h.mayAskAboutProfile("What's its stack?", ["What is the weather forecast?"]), false)
})
