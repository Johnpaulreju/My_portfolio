const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const ts = require("typescript")

// Load the pure TypeScript selector with the same source-module resolution used by the route tests.
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
const { fallbackProfileSelection: select } = load(path.resolve(__dirname, "../lib/os/portfolio-fallback.ts"))

test("catalogue fallback handles naturally worded questions about work and studies", () => {
  for (const [q, id] of [
    ["Which languages could Johnpaul use in a conversation with a client?", "languages"],
    ["Could you give me a brief overview of Johnpaul’s academic background?", "education"],
    ["Which technologies does Johnpaul work with?", "skills"],
    ["Walk me through Plan0.", "project-plan0"],
    ["What qualifications does Johnpaul hold?", "education"],
  ]) assert.deepEqual(select(q), { ids: [id] }, q)
})

test("fallback reuses the current chat's actual public subjects for GitHub and employer questions", () => {
  const q = "Where could I browse its source files?"
  assert.deepEqual(select(q, ["Tell me about Portfolio OS"], [["project-portfolio-os"]]), { ids: ["repo-portfolio-os"] })
  assert.deepEqual(select(q, ["Tell me about Plan0"], [["project-plan0"]]), { ids: ["repo-plan0"] })
  assert.deepEqual(select("What did he build during his time at that company?", ["Tell me about Odyssey Therapeia"], [["work-odyssey"]]), { ids: ["employer-projects"] })
})

test("an unavailable model never turns an unsupported or unrelated question into a factual claim", () => {
  for (const q of ["What is Johnpaul’s home address?", "Does Johnpaul speak Finnish?", "What is a GitHub repository?", "What was Johnpaul's GPA?", "Which languages could John Lennon use in a conversation with a client?"])
    assert.equal(select(q), undefined, q)
})
