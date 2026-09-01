import fs from 'node:fs';
import path from 'node:path';
import { listHarnessFiles } from './build-file-index.mjs';

const root = path.resolve(import.meta.dirname, '..');
let ok = true;
const fail = (...m) => { console.error(...m); ok = false; };

// 1. Required files present.
const must = [
  'AGENTS.md', 'CLAUDE.md', '3JSE_HARNESS_SPEC.md',
  '.agents/registry/providers.json', '.agents/registry/capabilities.json',
  '.agents/skills/3jse-director/SKILL.md',
];
for (const rel of must) {
  if (!fs.existsSync(path.join(root, rel))) fail('MISSING', rel);
}

// 2. Registry JSON parses.
const registry = {};
for (const rel of ['providers.json', 'capabilities.json', 'mechanics.json', 'blocked-sources.json']) {
  try {
    registry[rel] = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry', rel), 'utf8'));
  } catch (e) {
    fail('INVALID JSON', rel, e.message);
  }
}

// 3. Cross-registry integrity: every provider id referenced by capabilities.json must exist
//    in providers.json. A typo here silently breaks capability routing.
if (registry['providers.json'] && registry['capabilities.json']) {
  const known = new Set((registry['providers.json'].providers ?? []).map((p) => p.id));
  for (const [cap, ids] of Object.entries(registry['capabilities.json'].capabilities ?? {})) {
    for (const id of ids) {
      if (!known.has(id)) fail(`UNKNOWN PROVIDER "${id}" referenced by capability "${cap}"`);
    }
  }
}

// 4. Canonical skills <-> Claude mirror agree (content-identical, no missing dirs either way).
const canonical = path.join(root, '.agents/skills');
const mirror = path.join(root, '.claude/skills');
if (fs.existsSync(canonical) && fs.existsSync(mirror)) {
  const cNames = fs.readdirSync(canonical).sort();
  const mNames = fs.readdirSync(mirror).sort();
  for (const name of cNames) {
    const a = path.join(canonical, name, 'SKILL.md');
    const b = path.join(mirror, name, 'SKILL.md');
    if (!fs.existsSync(b)) { fail('MISSING CLAUDE MIRROR', name); continue; }
    if (fs.readFileSync(a, 'utf8') !== fs.readFileSync(b, 'utf8')) fail('MIRROR DRIFT', name);
  }
  for (const name of mNames) {
    if (!fs.existsSync(path.join(canonical, name, 'SKILL.md'))) {
      fail('CLAUDE MIRROR HAS EXTRA SKILL (not in canonical)', name);
    }
  }
}

// 5. docs/FILE_INDEX.txt is in sync with the actual tree (run scripts/build-file-index.mjs
//    to regenerate). Catches "forgot to update the index" drift the BUILD_PROMPT forbids.
const indexPath = path.join(root, 'docs/FILE_INDEX.txt');
if (!fs.existsSync(indexPath)) {
  fail('MISSING docs/FILE_INDEX.txt');
} else {
  const listed = fs.readFileSync(indexPath, 'utf8').split('\n').filter(Boolean).sort();
  const actual = listHarnessFiles();
  const missing = actual.filter((f) => !listed.includes(f));
  const extra = listed.filter((f) => !actual.includes(f));
  for (const f of missing) fail('FILE_INDEX MISSING', f);
  for (const f of extra) fail('FILE_INDEX STALE ENTRY (no such file)', f);
}

if (!ok) process.exit(1);
console.log('3JSE harness verification PASS');
