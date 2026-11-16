import {timeRowId,validTimeChunk} from './reading-time.js';
const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
export async function saveLocalReadingTime(db,event){
 if(!validTimeChunk(event))throw Error('Geçersiz okuma süresi.');
 await new Promise((ok,no)=>{const tx=db.transaction(['readingTime','readingReceipts'],'readwrite');const receipts=tx.objectStore('readingReceipts'),r=receipts.get(event.opId);r.onsuccess=()=>{if(r.result)return;const store=tx.objectStore('readingTime'),id=timeRowId(event.bookId,event.day),read=store.get(id);read.onsuccess=()=>{const milliseconds=(read.result?.milliseconds||0)+event.milliseconds;store.put({id,bookId:event.bookId,day:event.day,milliseconds});receipts.put({id:event.opId});};};tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});
}
export async function mergeLocalReadingTime(db,rows){
 for(const row of rows.filter(validTimeChunk))await new Promise((ok,no)=>{const tx=db.transaction('readingTime','readwrite'),store=tx.objectStore('readingTime'),id=timeRowId(row.bookId,row.day),r=store.get(id);r.onsuccess=()=>store.put({id,bookId:row.bookId,day:row.day,milliseconds:Math.max(r.result?.milliseconds||0,row.milliseconds)});tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error);});
}
