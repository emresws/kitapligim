import {test} from 'node:test';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {LibrarySync,diff,overlayState} from '../src/sync.js';
globalThis.indexedDB=indexedDB;
const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function client(id){const c=new LibrarySync();c.user={id,csrf:'x'};c.sync=async()=>{};await c.openDB();return c;}
test('Offline queue and data commit together, survive reload, isolate accounts',async()=>{
 const a=await client('alice-test'),b=await client('bob-test');const book={id:'a'.repeat(64),title:'Dune',format:'PDF',status:'reading',position:1,file:new Blob(['pdf'])};
 await a.commit('book',book.id,book);assert.equal((await a.pending()).length,1);
 const fresh=await client('alice-test');assert.equal((await fresh.pending())[0].patch.title,'Dune');
 assert.equal((await req(fresh.db.transaction('books').objectStore('books').get(book.id))).file.size,3);
 assert.equal((await b.pending()).length,0);assert.equal(await req(b.db.transaction('books').objectStore('books').get(book.id)),undefined);
 await fresh.commit('book',book.id,{...book,position:10});const pending=await fresh.pending();assert.equal(pending.length,2);assert.deepEqual(pending[1].patch,{position:10});assert.deepEqual(pending[1].base,{position:1});assert.ok(pending[0].sequence<pending[1].sequence);
});
test('Downloaded file is local cache and does not create an upload operation',async()=>{
 const c=await client('cache-test');const id='b'.repeat(64);let tx=c.db.transaction('books','readwrite');tx.objectStore('books').put({id,title:'Remote',format:'PDF',hasFile:true});await new Promise(r=>tx.oncomplete=r);
 c.api=async()=>new Response(new Blob(['remote pdf']));const b=await req(c.db.transaction('books').objectStore('books').get(id));await c.ensureFile(b);assert.equal(b.file.size,10);assert.equal((await c.pending()).length,0);
});
test('Remote notes and new PC book merge with queued phone reading progress',()=>{
 const id='a'.repeat(64);const file=new Blob(['cached']);const state=overlayState({books:[{id,title:'Dune',position:1,notes:'PC note'},{id:'b'.repeat(64),title:'PC addition'}],preferences:{quote:'PC quote'}},[{kind:'book',id,patch:{position:99}},{kind:'preferences',patch:{themeId:'custom'}}],[{id,file}]);
 assert.equal(state.books[0].position,99);assert.equal(state.books[0].notes,'PC note');assert.equal(state.books[0].file,file);assert.equal(state.books.length,2);assert.equal(state.preferences.quote,'PC quote');assert.equal(state.preferences.themeId,'custom');
});
test('Pending local deletion wins in view; remote deletion clears downloaded file',()=>{
 const id='a'.repeat(64);assert.equal(overlayState({books:[{id}],preferences:{}},[{kind:'delete',id}],[{id,file:new Blob(['x'])}]).books.length,0);
 assert.equal(overlayState({books:[],preferences:{},deleted:[id]},[],[{id,file:new Blob(['x'])}]).books.length,0);
});
test('Stale edit form sends only fields user changed',()=>{
 const original={title:'Dune',notes:'old',position:1};assert.deepEqual(diff({...original,notes:'new'},original),{patch:{notes:'new'},base:{notes:'old'}});
});
