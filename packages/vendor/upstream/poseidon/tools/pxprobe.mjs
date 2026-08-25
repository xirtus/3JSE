import { launch } from 'puppeteer-core';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const [src,x,y,w,h]=process.argv.slice(2);
const b=await launch({executablePath:CHROME,headless:true,args:['--headless=new','--no-sandbox']});
const p=await b.newPage();
const b64=(await readFile(src)).toString('base64');
const out=await p.evaluate(async(u,x,y,w,h)=>{const i=new Image();i.src=u;await i.decode();
const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const g=c.getContext('2d');
g.drawImage(i,0,0);const d=g.getImageData(x,y,w,h).data;const bright=[];
for(let k=0;k<d.length;k+=4){if(d[k]>200){bright.push([d[k],d[k+1],d[k+2]]);}}
const n=bright.length;if(!n)return 'no bright pixels';
const avg=bright.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>Math.round(v/n));
const pure=bright.filter(p=>p[0]>=250&&p[1]>=250&&p[2]>=250).length;
return `bright(R>200): ${n}, avg RGB: ${avg.join(',')}, pure-white(>=250): ${pure} (${Math.round(100*pure/n)}%)`;},
`data:image/png;base64,${b64}`,+x,+y,+w,+h);
console.log(out);await b.close();
