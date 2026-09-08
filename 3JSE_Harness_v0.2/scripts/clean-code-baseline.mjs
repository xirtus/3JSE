// Records today's clean-code numbers so the guard reports regressions only.
//
//   node 3JSE_Harness_v0.2/scripts/clean-code-baseline.mjs [--scope <dir>]
//
// --scope restricts the measurement to one subtree (a harness folder inside a
// monorepo) and writes its keys relative to that subtree, matching what the
// guard computes when CLAUDE_PROJECT_DIR is the subtree.
//
// Run it after a real cleanup, never to make a complaint go away: every entry
// here is a file the repository has agreed to leave worse than its own limits,
// and the list is meant to shrink.
//
// Adopted from the vibe game engine web-starter-kit (MIT):
// https://github.com/vibegameengine/web-starter-kit — scripts/clean-code-baseline.mjs
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { LIMITS, baselineOf, isOverLimits, measureFile, trackedSources } from './lib/cleanCode.mjs'

const scopeArg = process.argv.indexOf('--scope')
const scope = scopeArg >= 0 ? process.argv[scopeArg + 1] : null
const scopeRoot = scope ? resolve(process.cwd(), scope) : null

/** Both prerequisites fail with a stack that says nothing about the cause. */
function required(what, load) {
  try {
    return load()
  } catch (error) {
    console.error(`clean-code baseline: ${what}\n  ${error.message.split('\n')[0]}`)
    process.exit(1)
  }
}

const ts = required(
  'needs the typescript package, which is a devDependency of this project. Run the package manager install first.',
  () => createRequire(`${process.cwd()}/package.json`)('typescript'),
)

const files = required(
  'lists its files with `git ls-files`, so it has to run inside a git repository.',
  () => trackedSources(execSync),
)

const entries = {}
let overFile = 0
let overFunction = 0
let overComment = 0

for (const file of files) {
  const key = scopeRoot ? relative(scopeRoot, resolve(process.cwd(), file)) : file
  if (scopeRoot && (key.startsWith('..') || resolve(process.cwd(), file) === scopeRoot)) continue
  const measurement = measureFile(ts, file, readFileSync(file, 'utf8'))
  if (!isOverLimits(measurement)) continue
  entries[key.replace(/\\/g, '/')] = baselineOf(measurement)
  if (measurement.fileLines > LIMITS.fileLines) overFile += 1
  if (measurement.worstFunction > LIMITS.functionLinesHard) overFunction += 1
  if (measurement.commentRun > LIMITS.commentBlock || measurement.commentShare > LIMITS.commentShare) overComment += 1
}

writeFileSync(
  '.claude/clean-code-baseline.json',
  `${JSON.stringify({ files: entries, recorded: new Date().toISOString().slice(0, 10) }, null, 2)}\n`,
)

console.log(`${files.length} files measured${scope ? `, ${Object.keys(entries).length} of scope "${scope}" recorded` : `; ${Object.keys(entries).length} recorded as over at least one limit`}`)
console.log(`  ${overFile} over ${LIMITS.fileLines} lines, ${overFunction} with a function over ${LIMITS.functionLinesHard}, ${overComment} over a comment limit`)
for (const [file, entry] of Object.entries(entries)) {
  if (entry.fileLines <= LIMITS.fileLines && entry.worstFunction <= LIMITS.functionLinesHard) continue
  console.log(`  ${String(entry.fileLines).padStart(4)} lines, worst ${String(entry.worstFunction).padStart(3)}, over-limit ${entry.functionsOverLimit}  ${file}`)
}
