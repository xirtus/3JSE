import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, '.agents/skills');

// Mirror targets. The first is the harness-local Claude adapter (always present).
// The second is the repo-root .claude/skills tree — only written when the harness is
// checked out inside the 3JSE monorepo (detected by a sibling pnpm-workspace.yaml).
// That second mirror is what makes the harness skills apply to packages/* and apps/*
// work, not just edits under 3JSE_Harness_v0.1/.
const targets = [path.join(root, '.claude/skills')];
const repoRoot = path.resolve(root, '..');
if (fs.existsSync(path.join(repoRoot, 'pnpm-workspace.yaml'))) {
  targets.push(path.join(repoRoot, '.claude/skills'));
}

const names = fs.readdirSync(src).sort();
for (const dst of targets) {
  fs.mkdirSync(dst, { recursive: true });
  // Drop skills that no longer exist in canonical, so the mirror can't keep stale dirs.
  for (const existing of fs.existsSync(dst) ? fs.readdirSync(dst) : []) {
    if (!names.includes(existing)) fs.rmSync(path.join(dst, existing), { recursive: true, force: true });
  }
  for (const name of names) {
    const from = path.join(src, name);
    const to = path.join(dst, name);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
  console.log(`Synced ${names.length} skills -> ${path.relative(repoRoot, dst) || dst}`);
}
