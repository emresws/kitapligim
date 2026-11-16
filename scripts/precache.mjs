import {readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function walk(dir){const result=[];for(const e of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+e.name;if(e.isDirectory())result.push(...await walk(path));else if(e.name!=='sw.js')result.push(path);}return result;}
const files=(await walk('dist')).sort();const hash=createHash('sha256');for(const path of files)hash.update(await readFile(path));const cache='kitaplik-shell-'+hash.digest('hex').slice(0,16);
const urls=['/',...files.map(f=>'/'+f.slice(5))];
await writeFile('dist/sw.js',`const CACHE=${JSON.stringify(cache)},FILES=${JSON.stringify(urls)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('kitaplik-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;event.respondWith(caches.open(CACHE).then(async cache=>{const key=event.request.mode==='navigate'?'/':url.pathname;const cached=await cache.match(key);if(cached)return cached;return fetch(event.request);}));});
`);
