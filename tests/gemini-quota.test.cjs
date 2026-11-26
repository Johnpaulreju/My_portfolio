// Uses a private Redis Unix socket when redis-server and redis-cli are installed.
// Only the REST transport is substituted. Independent Node processes execute the production adapter and its Lua script.
const assert = require("node:assert/strict")
const { execFile, spawn, spawnSync } = require("node:child_process")
const { once } = require("node:events")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { setTimeout: delay } = require("node:timers/promises")
const { promisify } = require("node:util")
const ts = require("typescript")

const run = promisify(execFile)
const source = fs.readFileSync(path.resolve(__dirname, "../lib/gemini-quota.ts"), "utf8")
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const config = { UPSTASH_REDIS_REST_URL: "https://quota.test", UPSTASH_REDIS_REST_TOKEN: "unit-test-token", VERCEL_ENV: "production", GEMINI_SITE_DAILY_LIMIT: "20" }

function load(env, fetch) {
  const module = { exports: {} }
  new Function("require", "module", "exports", "process", "fetch", code)(require, module, module.exports, { env }, fetch)
  return module.exports.reserveGeminiDailyQuota
}

async function redis(socket, ...command) {
  const { stdout } = await run("redis-cli", ["--json", "-s", socket, ...command.map(String)])
  return JSON.parse(stdout)
}

async function worker(socket, visitor, attempts, deployment) {
  const reserve = load({ ...config, VERCEL_ENV: deployment }, async (url, init) => {
    assert.equal(new URL(url).origin, config.UPSTASH_REDIS_REST_URL)
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer " + config.UPSTASH_REDIS_REST_TOKEN)
    assert.ok(!init.body.includes(visitor), "Redis should only see a pseudonymous visitor key")
    const command = JSON.parse(init.body)
    const result = await redis(socket, ...command)
    return Response.json({ result })
  })
  const attemptsMade = await Promise.all(Array.from({ length: Number(attempts) }, () => reserve(visitor)))
  return attemptsMade.filter(Boolean).length
}

async function anotherInstance(socket, visitor, count, environment = "production") {
  const { stdout } = await run(process.execPath, [__filename, "--redis-worker", socket, visitor, String(count), environment])
  return JSON.parse(stdout)
}

if (process.argv[2] === "--redis-worker") {
  worker(...process.argv.slice(3)).then(count => console.log(count)).catch(error => { console.error(error); process.exitCode = 1 })
} else {
  const test = require("node:test")

  test("quota admission requires a configured shared store and explicit success from it", async () => {
    const visitor = "192.0.2.1"
    let calls = 0
    const noStore = load({}, () => { calls++; throw Error("Unexpected request") })
    assert.equal(await noStore(visitor), false)
    assert.equal(calls, 0)
    for (const response of [() => { throw Error("offline") }, () => new Response(null, { status: 503 }),
      () => Response.json({ error: "unavailable" }), () => Response.json({ result: 0 }), () => Response.json({ result: "unknown" })]) {
      assert.equal(await load(config, response)(visitor), false)
    }
    assert.equal(await load(config, () => Response.json({ result: 1 }))(visitor), true)
  })

  test("managed Redis credentials, the default site cap and a stable visitor secret survive a token rotation", async () => {
    const reservations = []
    for (const token of ["test-token-before", "test-token-after"]) {
      const reserve = load({
        VERCEL_ENV: "production", KV_REST_API_URL: config.UPSTASH_REDIS_REST_URL, KV_REST_API_TOKEN: token,
        GEMINI_QUOTA_HMAC_SECRET: "test-visitor-secret",
      }, async (_url, init) => {
        assert.equal(new Headers(init.headers).get("authorization"), "Bearer " + token)
        reservations.push(JSON.parse(init.body))
        return Response.json({ result: 1 })
      })
      assert.ok(await reserve("192.0.2.90"))
    }
    const [before, after] = reservations
    assert.deepEqual(before.slice(5, 7), ["15", "200"])
    assert.equal(before[4], after[4], "the same visitor must retain their allowance after rotating the access token")
    assert.notEqual(before[7], after[7], "separate reservations need distinct IDs even within the same millisecond")
  })

  const hasRedis = ["redis-server", "redis-cli"].every(bin => spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0)
  test("separate app processes share atomic visitor and site reservations, including rolling expiry", {
    skip: hasRedis ? false : "Install redis-server and redis-cli to run the cross-process integration check",
    timeout: 30000,
  }, async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gquota-"))
    const socket = path.join(dir, "redis.sock")
    const server = spawn("redis-server", ["--port", "0", "--unixsocket", socket, "--unixsocketperm", "700", "--dir", dir,
      "--save", "", "--appendonly", "no"], { stdio: "ignore" })
    const stopped = once(server, "exit")
    t.after(async () => { server.kill(); await stopped; fs.rmSync(dir, { recursive: true, force: true }) })
    for (let attempt = 0; attempt < 100 && !fs.existsSync(socket); attempt++) await delay(25)
    assert.equal(await redis(socket, "PING"), "PONG")

    const visitor = "192.0.2.8"
    const sameVisitor = await Promise.all(Array.from({ length: 3 }, () => anotherInstance(socket, visitor, 8)))
    assert.equal(sameVisitor.reduce((a, b) => a + b, 0), 15)
    const [siteKey] = await redis(socket, "KEYS", "*:site")
    const [visitorKey] = await redis(socket, "KEYS", "*:visitor:*")
    assert.equal(await redis(socket, "ZCARD", siteKey), 15)
    assert.equal(await redis(socket, "ZCARD", visitorKey), 15)

    const otherVisitors = await Promise.all(["192.0.2.10", "192.0.2.11"].map(ip => anotherInstance(socket, ip, 6)))
    assert.equal(otherVisitors.reduce((a, b) => a + b, 0), 5, "the entire site has five slots left")
    assert.equal(await anotherInstance(socket, "192.0.2.12", 1), 0)
    assert.equal(await redis(socket, "ZCARD", siteKey), 20)
    assert.equal(await anotherInstance(socket, visitor, 1, "preview"), 1, "preview is isolated from production counters")

    // Move one real reservation outside the rolling window in both counters. A second remains inside it.
    const [seconds, micros] = await redis(socket, "TIME")
    const cutoff = Number(seconds) * 1000 + Math.floor(Number(micros) / 1000) - 86400000
    const [old, stillValid] = await redis(socket, "ZRANGE", visitorKey, 0, 1)
    for (const key of [siteKey, visitorKey]) await redis(socket, "ZADD", key, cutoff - 1, old, cutoff + 3600000, stillValid)
    assert.equal(await anotherInstance(socket, visitor, 2), 1)
    assert.equal(await redis(socket, "ZCARD", siteKey), 20)
    assert.equal(await redis(socket, "ZCARD", visitorKey), 15)
    for (const key of [siteKey, visitorKey]) assert.ok(await redis(socket, "PTTL", key) > 0, "unused keys must expire")
  })
}
