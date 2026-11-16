import {saveLocalReadingTime,mergeLocalReadingTime} from './time-storage.js';
import {diff} from './sync.js';

const read=request=>new Promise((ok,no)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>no(request.error)});
export class LocalStorageAdapter{
 async start(){
  // The previous Windows build uses this exact database at 127.0.0.1:8765.
  const open=indexedDB.open('kitapligim-local-v1',3);
  open.onupgradeneeded=()=>{for(const name of ['books','preferences','readingTime','readingReceipts'])if(!open.result.objectStoreNames.contains(name))open.result.createObjectStore(name,{keyPath:'id'});};
  open.onblocked=()=>{document.getElementById('toast').textContent='Güncelleme için eski Kitaplığım sekmelerini kapat.';document.getElementById('toast').hidden=false;};
  this.db=await read(open);this.db.onversionchange=()=>this.db.close();return this.db;
 }
 async commit(kind,id,next,editBase){
  const tx=this.db.transaction(kind==='preferences'?'preferences':'books','readwrite');
  const done=new Promise((ok,no)=>{tx.oncomplete=ok;tx.onabort=tx.onerror=()=>no(tx.error);});
  const store=tx.objectStore(kind==='preferences'?'preferences':'books');
  if(kind==='delete')store.delete(id);
  else{
   const old=await read(store.get(id));
   const change=editBase?diff(next,editBase,Object.keys(next).filter(k=>k!=='file')).patch:next;
   store.put({...old,...change,...(kind==='book'?{file:next.file||old?.file||null}:{}),id});
  }
  await done;
 }
 async ensureFile(book){if(!book?.file?.size)throw Error('Bu cihazda kitabın dosyası yok.');return book;}
 async recordReadingTime(event,imported=false){
  if(imported)return mergeLocalReadingTime(this.db,[event]);
  return saveLocalReadingTime(this.db,event);
 }
}
