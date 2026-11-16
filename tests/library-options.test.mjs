import {test} from 'node:test';
import assert from 'node:assert/strict';
import {finishedInMonth,readingStats,pageCount,originalPageCount} from '../src/analytics.js';
import {availableGenres,genreId,effectiveGenre} from '../src/genre-catalog.js';
import {cleanPreferences} from '../src/personalization.js';
import {diff,LibrarySync} from '../src/sync.js';
import {LocalStorageAdapter} from '../src/local-storage.js';
import {indexedDB} from 'fake-indexeddb';
globalThis.indexedDB=indexedDB;
const completed=(options={})=>({id:'a'.repeat(64),title:'Bir kitap',status:'read',ended:'2026-02-02',pages:90,format:'PDF',...options});
const now=new Date(2026,2,1);
test('manual overrides drive page statistics without changing the original PDF or EPUB count',()=>{
 const pdf=completed({pagesOverride:180}),epub=completed({format:'EPUB',pagesSource:'estimated',pages:110,pagesOverride:210});
 assert.equal(readingStats([pdf,epub],2026,now).months[1].pages,390);
 assert.equal(readingStats([pdf,epub],2026,now).year.estimated,0);
 assert.equal(originalPageCount(pdf),90);
 assert.equal(pageCount({...epub,pagesOverride:null}),110);
 assert.deepEqual(diff({...pdf,pagesOverride:null},pdf).patch,{pagesOverride:null});
});
test('month list uses finish date, skips unfinished, undated and future books, and sorts newest first',()=>{
 const titles=finishedInMonth([completed({title:'Eski'}),completed({title:'Yeni',started:'2026-01-01',ended:'2026-02-20'}),completed({title:'Başka ay',ended:'2026-01-20'}),completed({status:'reading'}),completed({ended:''}),completed({ended:'2026-02-30'})],2026,2,new Date(2026,1,25)).map(b=>b.title);
 assert.deepEqual(titles,['Yeni','Eski']);
});
test('genre catalog preserves old custom labels and keeps removed defaults out of menus',()=>{
 const catalog=cleanPreferences({genreCatalog:{added:[' Deneme ','DENEME'],removed:['Roman','Eski']}}).genreCatalog;
 const options=availableGenres([{genre:'Eski'},{genre:'Roman'},{genre:'Aktarılan'}],catalog);
 assert.equal(options.filter(g=>genreId(g)==='deneme').length,1);
 assert.ok(options.includes('Aktarılan'));
 assert.equal(effectiveGenre('Roman',new Map(options.map(g=>[genreId(g),g]))),'');
});
test('local storage persists overrides, resets and shared catalog without losing the book file',async()=>{
 const local=new LocalStorageAdapter();await local.start();
 const book=completed({file:new Blob(['pdf'])});await local.commit('book',book.id,book);
 await local.commit('book',book.id,{...book,pagesOverride:155},book);
 await local.commit('preferences','settings',{genreCatalog:{added:['Deneme'],removed:[]}});
 const restored=new LocalStorageAdapter();await restored.start();
 const read=(store,id)=>new Promise((ok,no)=>{const r=restored.db.transaction(store).objectStore(store).get(id);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
 const saved=await read('books',book.id);
 assert.equal(saved.file.size,3);assert.equal(saved.pages,90);assert.equal(pageCount(saved),155);
 assert.deepEqual((await read('preferences','settings')).genreCatalog.added,['Deneme']);
 await restored.commit('book',book.id,{...saved,pagesOverride:null},saved);
 assert.equal(pageCount(await read('books',book.id)),90);
 local.db.close();restored.db.close();
});
test('Docker profile queue sends page and genre changes without replacing a concurrent override',async()=>{
 const cloud=new LibrarySync();cloud.user={id:'new-features'};cloud.sync=async()=>{};await cloud.openDB();
 const book=completed();await cloud.commit('book',book.id,book);
 await cloud.commit('book',book.id,{...book,pagesOverride:180},book);
 await cloud.commit('book',book.id,{...book,notes:'Güncellendi'},book);
 await cloud.commit('preferences','settings',{genreCatalog:{added:['Deneme'],removed:['Roman']}},{});
 const operations=await cloud.pending();
 assert.deepEqual(operations[1].patch,{pagesOverride:180});
 assert.deepEqual(operations[3].patch.genreCatalog.removed,['Roman']);
 const saved=await new Promise(ok=>{const r=cloud.db.transaction('books').objectStore('books').get(book.id);r.onsuccess=()=>ok(r.result);});
 assert.equal(saved.pagesOverride,180);assert.equal(saved.pages,90);assert.equal(saved.notes,'Güncellendi');
 cloud.db.close();
});
