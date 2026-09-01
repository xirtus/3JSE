import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const q = process.argv[2];
if (!q) { console.error('Usage: node scripts/resolve-capability.mjs <capability>'); process.exit(2); }
const caps = JSON.parse(fs.readFileSync(path.join(root,'.agents/registry/capabilities.json'),'utf8')).capabilities;
const providers = JSON.parse(fs.readFileSync(path.join(root,'.agents/registry/providers.json'),'utf8')).providers;
const ids = caps[q] || [];
if (!ids.length) { console.log(JSON.stringify({capability:q,registered:false,providers:[]},null,2)); process.exit(0); }
console.log(JSON.stringify({capability:q,registered:true,providers:ids.map(id=>providers.find(p=>p.id===id)).filter(Boolean)},null,2));
