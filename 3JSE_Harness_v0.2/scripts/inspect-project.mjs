import fs from 'node:fs';
import path from 'node:path';
const target = path.resolve(process.argv[2] || '.');
const exists = p => fs.existsSync(path.join(target,p));
const result = {
  target,
  packageJson: exists('package.json'),
  vite: exists('vite.config.ts') || exists('vite.config.js'),
  src: exists('src'),
  assets: ['assets','public/assets','src/assets'].filter(exists),
  docs: ['docs','design','plans'].filter(exists),
  agentFiles: ['AGENTS.md','CLAUDE.md','.agents','.claude'].filter(exists)
};
if (result.packageJson) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8'));
    result.scripts = pkg.scripts || {};
    result.dependencies = Object.keys({...pkg.dependencies,...pkg.devDependencies});
  } catch {}
}
console.log(JSON.stringify(result,null,2));
