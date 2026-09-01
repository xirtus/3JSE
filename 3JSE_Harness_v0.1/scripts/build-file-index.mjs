// Regenerates docs/FILE_INDEX.txt deterministically: every file under the harness root,
// relative POSIX path, sorted, one per line. Run this instead of hand-editing the index;
// verify-harness.mjs fails if the committed index is out of sync with the tree.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const IGNORE = new Set(['node_modules', '.git']);

/** @returns {string[]} POSIX-relative paths */
export function listHarnessFiles(base = root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(base, full).split(path.sep).join('/'));
    }
  };
  walk(base);
  return out.sort();
}

const INDEX_REL = 'docs/FILE_INDEX.txt';

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = listHarnessFiles();
  fs.writeFileSync(path.join(root, INDEX_REL), files.join('\n') + '\n');
  console.log(`Wrote ${INDEX_REL} — ${files.length} files`);
}
