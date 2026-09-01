import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root,'.agents/skills');
const dst = path.join(root,'.claude/skills');
fs.mkdirSync(dst,{recursive:true});
for (const name of fs.readdirSync(src)) {
  const from = path.join(src,name);
  const to = path.join(dst,name);
  fs.rmSync(to,{recursive:true,force:true});
  fs.cpSync(from,to,{recursive:true});
}
console.log(`Synced ${fs.readdirSync(src).length} skills to .claude/skills`);
