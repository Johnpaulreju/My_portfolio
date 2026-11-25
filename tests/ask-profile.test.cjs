// Exercise the actual Next.js route with isolated provider responses.
const test = require("node:test")
const assert = require("node:assert/strict")
const ts = require("typescript")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

function harness(fetch) {
  const root = path.resolve(__dirname, "..")
  const cache = new Map()
  const env = { NODE_ENV: "test", GEMINI_API_KEY: "test-only" }
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const module = { exports: {} }
    const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    function localRequire(id) {
      const base = id.startsWith("@/") ? path.join(root, id.slice(2)) : path.resolve(path.dirname(file), id)
      if (base === path.join(root, "lib/os/capabilities")) return {
        capabilityButton: (name, arg) => ({ name, arg, label: name }),
      }
      return load(base + ".ts")
    }
    vm.runInNewContext(source, {
      module, exports: module.exports, require: localRequire, process: { env }, fetch,
      Response, Request, URL, AbortSignal, TextDecoder,
    }, { filename: file })
    cache.set(file, module.exports)
    return module.exports
  }
  const route = load(path.join(root, "app/api/ask/route.ts"))
  const query = (question, previous = [], headers = {}) => route.POST(new Request("http://localhost/api/ask", {
    method: "POST", body: JSON.stringify({ question, previous }),
    headers: { "Content-Type": "application/json", ...headers },
  }))
  return {
    env, query,
    client: load(path.join(root, "lib/os/ask-profile.ts")).askProfile,
    local: (...args) => load(path.join(root, "lib/os/assistant.ts")).ask(...args),
  }
}

function provider(choice) {
  return Response.json({ candidates: [{
    finishReason: "STOP", content: { parts: [{ text: JSON.stringify(choice) }] },
  }] })
}

test("Gemini selects approved education facts; extra provider prose and URLs never reach visitors", async () => {
  const h = harness(async (url, init) => {
    assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//)
    assert.equal(init.headers["x-goog-api-key"], "test-only")
    return provider({ status: "answer", ids: ["education"], text: "Invented answer", links: ["https://example.com"] })
  })
  const answer = await (await h.query("Hello! Where did Johnpaul study?")).json()
  assert.match(answer.text, /Kristu Jayanti/)
  assert.match(answer.text, /JECRC University/)
  assert.doesNotMatch(JSON.stringify(answer), /Invented|example\.com/)
})

test("unrelated questions, unsupported biographical facts and invented fact IDs fail closed", async () => {
  for (const [status, ids, expected] of [
    ["unrelated", ["profile"], /about Johnpaul/],
    ["unknown", [], /hasn’t shared/],
    ["answer", ["made-up"], /hasn’t shared/],
  ]) {
    const h = harness(() => provider({ status, ids }))
    const answer = await (await h.query("What is the latest football score?")).json()
    assert.match(answer.text, expected)
    assert.deepEqual(answer.links, [])
  }
})

test("with no key the route distinguishes school, college, public demo and unavailable repository", async () => {
  let calls = 0
  const h = harness(() => { calls++; throw Error("unexpected network call") })
  delete h.env.GEMINI_API_KEY
  for (const [question, expected] of [
    ["Where did he do his schooling?", /hasn’t named his primary or secondary school/],
    ["Where is JECRC located?", /Jaipur/],
    ["Which college did he attend?", /Kristu Jayanti/],
    ["Give me the Plan0 website", /visit Plan0/],
    ["Is there a GitHub repo for Plan0?", /no verified public/],
  ]) {
    const result = await (await h.query(question)).json()
    assert.match(result.text, expected)
  }
  assert.equal(calls, 0)
})

test("repository links come from verified public owner records only", async () => {
  for (const published of [true, false]) {
    const slug = "Johnpaulreju/My_portfolio"
    let calls = 0
    const h = harness(async (url) => {
      calls++
      assert.equal(String(url), "https://api.github.com/repos/" + slug)
      return Response.json({ private: !published, full_name: slug, html_url: "https://github.com/" + slug })
    })
    delete h.env.GEMINI_API_KEY
    const result = await (await h.query("What is its GitHub repo?", ["Tell me about Portfolio OS"])).json()
    assert.equal(calls, 1)
    assert.deepEqual(result.links.map((link) => link.url), published ? ["https://github.com/" + slug] : [])
  }
})

test("unavailable provider falls back; cross-origin and oversized inputs never call it", async () => {
  let calls = 0
  const h = harness(async () => { calls++; return new Response(null, { status: 429 }) })
  assert.equal((await h.query("a".repeat(1001))).status, 400)
  assert.equal((await h.query("Hello", [], { origin: "https://example.org" })).status, 403)
  assert.equal(calls, 0)
  assert.match((await (await h.query("Where was his schooling?")).json()).text, /public education/)
  assert.equal(calls, 1)
})

test("the same-origin gate accepts the actual loopback browser authority", async () => {
  const h = harness(() => { throw Error("unexpected request") })
  delete h.env.GEMINI_API_KEY
  const result = await h.query("Which school?", [], {
    host: "127.0.0.1:3279", origin: "http://127.0.0.1:3279",
  })
  assert.equal(result.status, 200)
  assert.match((await result.json()).text, /primary or secondary/)
})

test("standalone greetings and thanks get the same local, browser and API reply without spending a provider call", async () => {
  let calls = 0
  const h = harness(() => { calls++; throw Error("unexpected request") })
  for (const [q, expected] of [["hey!", /good to meet you/i], ["👋🏽", /good to meet you/i], ["Hi, how are you?", /ready to help/], ["Thanks for your help!", /welcome/i]]) {
    const { text } = await (await h.query(q)).json()
    assert.match(text, expected)
    assert.equal((await h.client(q)).text, text)
    assert.equal(h.local(q).text, text)
  }
  assert.equal(calls, 0)
})

test("polite words preserve the actual question, including private and unrelated requests", async () => {
  let calls = 0
  const h = harness(() => { calls++; return provider({ status: "unrelated", ids: [] }) })
  assert.match((await (await h.query("Hey, can you write a poem?")).json()).text, /about Johnpaul/)
  assert.equal(calls, 1)
  delete h.env.GEMINI_API_KEY
  const q = "Thanks! Where did he study?"
  assert.match((await (await h.query(q)).json()).text, /Kristu Jayanti/)
  assert.match(h.local(q).text, /Kristu Jayanti/)
  assert.equal(h.local("Hi, what’s his salary?").unknown, true)
})
