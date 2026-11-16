// Run against a local server with alice/bob test accounts. No browser or Docker needed.
import {indexedDB} from 'fake-indexeddb';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {LibrarySync} from '../src/sync.js';
globalThis.indexedDB=indexedDB;
const base=process.env.TEST_SERVER||'http://127.0.0.1:8765';
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function make(username,device){
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Kitaplik':'1'},body:JSON.stringify({username})});
 assert.equal(login.status,200);const session=await login.json(),cookie=login.headers.get('set-cookie').split(';')[0];
 const c=new LibrarySync();c.user={...session,id:session.id+'-'+device+'-'+Date.now()};await c.openDB();c.sync=async()=>{};c.online=true;
 c.api=async(url,options={})=>{if(!c.online)throw Error('Offline');const r=await fetch(base+url,{...options,headers:{'X-Kitaplik':'1','X-CSRF':session.csrf,Cookie:cookie,...options.headers}});if(!r.ok){const e=Error('API');e.status=r.status;e.detail=await r.json();throw e;}return r;};
 return c;
}
const pc=await make('alice','pc'),phone=await make('alice','phone'),friend=await make('bob','friend');
const content=new Blob(['%PDF-1.4\nLive sync fixture '+Date.now()]);const id=createHash('sha256').update(Buffer.from(await content.arrayBuffer())).digest('hex');
const book={id,title:'Live sync test',author:'Frank Herbert',format:'PDF',status:'reading',filename:'test.pdf',position:1,notes:'',year:'',file:content};
await pc.commit('book',id,book);await pc.perform(false);assert.equal((await pc.pending()).length,0);
await phone.perform(false);let p=await request(phone.db.transaction('books').objectStore('books').get(id));assert.ok(p.hasFile);assert.equal(p.file,null);await phone.ensureFile(p);assert.equal(p.file.size,content.size);
await friend.perform(false);assert.equal(await request(friend.db.transaction('books').objectStore('books').get(id)),undefined);
phone.online=false;await phone.commit('book',id,{...p,position:80},p);await phone.perform(false);assert.equal((await phone.pending()).length,1);
// Reopen persistent account DB while offline; outbox and binary remain.
const reopened=new LibrarySync();reopened.user=phone.user;await reopened.openDB();assert.equal((await reopened.pending()).length,1);assert.equal((await request(reopened.db.transaction('books').objectStore('books').get(id))).file.size,content.size);
const old=await request(pc.db.transaction('books').objectStore('books').get(id));await pc.commit('book',id,{...old,year:'1965'},old);await pc.perform(false);
phone.online=true;await phone.perform(false);await pc.perform(false);const merged=await request(pc.db.transaction('books').objectStore('books').get(id));assert.equal(merged.position,80);assert.equal(merged.year,'1965');assert.equal((await phone.pending()).length,0);
// Same field conflict remains queued and local value is retained, server unchanged.
const phoneBase=await request(phone.db.transaction('books').objectStore('books').get(id));phone.online=false;await phone.commit('book',id,{...phoneBase,position:90},phoneBase);
await pc.commit('book',id,{...merged,position:100},merged);await pc.perform(false);phone.online=true;await phone.perform(false);assert.equal((await phone.pending()).length,1);assert.equal((await request(phone.db.transaction('books').objectStore('books').get(id))).position,90);
await pc.perform(false);assert.equal((await request(pc.db.transaction('books').objectStore('books').get(id))).position,100);
const op=(await phone.pending())[0];let tx=phone.db.transaction('outbox','readwrite');tx.objectStore('outbox').put({...op,force:true});await new Promise(r=>tx.oncomplete=r);await phone.perform(false);await pc.perform(false);assert.equal((await request(pc.db.transaction('books').objectStore('books').get(id))).position,90);
// Reading time is a separate durable stream, preserving calendar days and metadata.
phone.online=false;await phone.recordReadingTime({opId:'time-oct-'+Date.now(),bookId:id,day:'2026-10-31',milliseconds:10000});await phone.recordReadingTime({opId:'time-nov-'+Date.now(),bookId:id,day:'2026-11-01',milliseconds:20000});assert.equal((await phone.pending()).length,2);phone.online=true;await phone.perform(false);await phone.perform(false);await pc.perform(false);const times=(await request(pc.db.transaction('readingTime').objectStore('readingTime').getAll())).filter(r=>r.bookId===id);assert.deepEqual(Object.fromEntries(times.map(r=>[r.day,r.milliseconds])),{'2026-10-31':10000,'2026-11-01':20000});assert.equal((await phone.pending()).length,0);
await phone.commit('delete',id);await phone.perform(false);await pc.perform(false);assert.equal(await request(pc.db.transaction('books').objectStore('books').get(id)),undefined);
console.log('PASS live sync: binary upload/cache, account isolation, offline restart/replay, PC field merge, conflict preservation/explicit choice, calendar-day reading-time sync and deletion propagation.');
