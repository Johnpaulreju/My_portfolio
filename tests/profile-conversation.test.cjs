const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

function load(file) {
  const module = { exports: {} }
  const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function("module", "exports", "require", js)(module, module.exports, id => {
    const base = id.startsWith("@/") ? path.resolve(__dirname, "..", id.slice(2)) : path.resolve(path.dirname(file), id)
    return load(base + ".ts")
  })
  return module.exports
}
const { resolveProfileConversation: resolve } = load(path.resolve(__dirname, "../lib/os/profile-conversation.ts"))

test("education follow-up asks which institution and retains the requested contribution", () => {
  const education = "Where did John study?"
  const work = "What did he build there?"
  assert.deepEqual(resolve(education), { ids: ["education"] })
  assert.match(resolve(work, [education]).clarification, /Kristu Jayanti.*JECRC/)
  assert.deepEqual(resolve("Kristu Jayanti", [education, work]), { ids: ["project-smart-admission-manager", "project-icu-research"] })
  assert.deepEqual(resolve("JECRC", [education, work]), { ids: ["work-jecrc"] })
  assert.deepEqual(resolve(work, ["Where did he do his MCA?"]), { ids: ["project-smart-admission-manager", "project-icu-research"] })
  assert.deepEqual(resolve(work, ["Where did he do his BCA?"]), { ids: ["work-jecrc"] })
  assert.ok(resolve(work).clarification)
})

test("project links follow the most recent project and prefer an actual returned fact over a guessed subject", () => {
  const q = "What’s its GitHub link?"
  assert.deepEqual(resolve(q, ["Tell me about Portfolio OS"]), { ids: ["repo-portfolio-os"] })
  assert.deepEqual(resolve(q, ["Tell me about Portfolio OS", "Tell me about Plan0"]), { ids: ["repo-plan0"] })
  assert.deepEqual(resolve("What's its website?", ["Tell me about Plan0", q]), { ids: ["website-plan0"] })
  assert.deepEqual(resolve("Show me its demo", ["Tell me about Plan0", q]), { ids: ["demo-plan0"] })
  assert.deepEqual(resolve(q, ["Which game did he make?"], [["project-mafia"]]), { ids: ["repo-mafia"] })
  assert.ok(resolve(q, ["Tell me about Plan0", "What is a sundial?"]).clarification)
  assert.deepEqual(resolve("Show me his GitHub profile", ["Tell me about Plan0"]), { ids: ["github"] })
  assert.deepEqual(resolve("Which projects have public GitHub links?"), { ids: ["repositories"] })
})

test("public institutional contributions remain distinct across a change of subject", () => {
  const q = "What did he build there?"
  assert.deepEqual(resolve(q, ["What did John work on at Odyssey Therapeia?"]), { ids: ["employer-projects"] })
  assert.deepEqual(resolve(q, ["Tell me about John’s experience at SlimCortex"]), { ids: ["work-slimcortex"] })
  assert.deepEqual(resolve(q, ["Tell me about his work at the Kristu Jayanti Software Development Cell"]), { ids: ["project-smart-admission-manager"] })
})

test("generic definitions and unverified personal details are not answered by a direct keyword match", () => {
  for (const q of ["What is a university?", "What is a GitHub repository?", "What was his GPA in his MCA?", "Where did John Lennon study?"])
    assert.equal(resolve(q, ["Tell me about Plan0"]), undefined, q)
})

test("an offline reply shows the recorded walkthrough and distinguishes an unavailable check from an unlisted repository", () => {
  const { offlineProfileFacts } = load(path.resolve(__dirname, "../lib/profile-facts.ts"))
  assert.match(offlineProfileFacts(["demo-plan0"]).links[0].url, /\/watch\/plan0-demo$/)
  assert.match(offlineProfileFacts(["repo-plan0"]).text, /no verified public source-code repository/)
  const offline = offlineProfileFacts(["repo-portfolio-os"])
  assert.match(offline.text, /can’t verify/)
  assert.deepEqual(offline.links.map((link) => link.url), ["https://github.com/Johnpaulreju"])
  assert.deepEqual(offline.factIds, ["repo-portfolio-os"])
})
