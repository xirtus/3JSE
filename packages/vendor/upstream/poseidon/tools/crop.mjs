import { launch } from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const CHROME=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(p=>existsSync(p));
const [src,out,x,y,w,h,scale]=process.argv.slice(2);
const b=await launch({executablePath:CHROME,headless:true,args:['--headless=new','--no-sandbox']});
const p=await b.newPage();
const b64=(await readFile(src)).toString('base64');
const png=await p.evaluate(async(u,x,y,w,h,s)=>{const i=new Image();i.src=u;await i.decode();
const c=document.createElement('canvas');c.width=w*s;c.height=h*s;const g=c.getContext('2d');
g.imageSmoothingEnabled=false;g.drawImage(i,x,y,w,h,0,0,w*s,h*s);return c.toDataURL('image/png');},
`data:image/png;base64,${b64}`,+x,+y,+w,+h,+scale);
await writeFile(out,Buffer.from(png.split(',')[1],'base64'));
await b.close();console.log(out);
