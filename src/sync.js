import {timeRowId,validTimeChunk} from './reading-time.js';
import {randomId} from './identity.js';
// Private IndexedDB per account; atomic local writes + durable outbox.
const req=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
const done=tx=>new Promise((ok,no)=>{tx.oncomplete=ok;tx.onerror=()=>no(tx.error);tx.onabort=()=>no(tx.error)});
const fields=['title','author','year','genre','status','rating','favorite','notes','started','ended','added','position','pages','pagesOverride','pagesSource','cover','readerFont','readerZoom','authorBookRank','filename','format','coverWarning'];
const prefFields=['quote','featuredBookId','themeId','customTheme','genreCatalog'];
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
export function diff(next,previous={},keys=fields){const patch={},base={};for(const k of keys)if(!same(next[k],previous?.[k])){patch[k]=next[k]??null;base[k]=previous?.[k]??null;}return {patch,base};}
export function overlayState(snapshot,pending,local){
 const map=new Map(snapshot.books.map(b=>[b.id,{...b,file:local.find(x=>x.id===b.id)?.file||null}]));
 let preferences={id:'settings',...snapshot.preferences};
 for(const op of pending){if(op.kind==='delete')map.delete(op.id);else if(op.kind==='book'){const b=map.get(op.id)||{id:op.id,file:local.find(x=>x.id===op.id)?.file||null};Object.assign(b,op.patch);if(op.upload)b.hasFile=true;map.set(op.id,b);}else Object.assign(preferences,op.patch);}
 return {books:[...map.values()],preferences};
}
export class LibrarySync{
 constructor(){this.db=null;this.user=null;this.running=null;this.onChange=()=>{};this.lastSync=0;this.authNeeded=false;}
 async api(url,options={}){
  const headers={'X-Kitaplik':'1','X-CSRF':this.user?.csrf||'',...options.headers};
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers});
  if(r.status===401){this.authNeeded=true;throw Error('Oturumun sona erdi. Yeniden giriş yap; bekleyen kayıtların korunur.');}
  if(!r.ok){const e=await r.json().catch(()=>({error:'Sunucuya ulaşılamadı.'}));const error=Error(e.error||'Bu bilgi diğer cihazda da değişti.');error.status=r.status;error.detail=e;throw error;}
  this.authNeeded=false;return r;
 }
 async start(){
  try{this.user=JSON.parse(localStorage.getItem('kitaplik-account'));}catch{}
  await this.login();
  await this.openDB();this.mountStatus();
  if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
  window.addEventListener('storage',event=>{if(event.key==='kitaplik-account'){let account;try{account=JSON.parse(event.newValue)}catch{}if(account?.id!==this.user.id){this.db?.close();location.reload();}}});
  window.addEventListener('online',()=>this.sync());window.addEventListener('focus',()=>this.sync());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.sync()});
  this.timer=setInterval(()=>{if(!document.hidden)this.sync()},15000);
  await this.sync();return this.db;
 }
 async login(){
  let dialog=document.getElementById('account-login');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='account-login';dialog.innerHTML='<form id="account-form"><span class="eyebrow">KİTAPLIĞIM</span><h2>Kitaplığını seç</h2><label>Profil<select name="profileId" required><option value="">Profiller yükleniyor…</option></select></label><p class="account-error" role="alert"></p><button class="primary" disabled>Profile gir</button><p class="settings-hint">Profiller sunucuda oluşturulur. Şifre gerekmez.</p></form>';document.body.append(dialog);dialog.addEventListener('cancel',e=>e.preventDefault());}
  const form=dialog.querySelector('form'),select=form.elements.profileId,button=form.querySelector('button'),error=dialog.querySelector('.account-error');
  try{
   const response=await fetch('/api/profiles',{cache:'no-store'});if(!response.ok)throw Error('Profiller yüklenemedi.');const profiles=await response.json();
   select.replaceChildren(new Option('Profil seç…',''),...profiles.map(p=>new Option(p.username,p.id)));
   if(profiles.some(p=>p.id===this.user?.id))select.value=this.user.id;
   error.textContent=profiles.length?'':'Henüz profil yok. Sunucuda “python manage.py add-user İsim” komutuyla profil oluştur.';
   button.textContent='Profile gir';form.noValidate=false;button.disabled=!profiles.length;
  }catch(e){if(this.user&&!this.authNeeded)return;error.textContent='Sunucuya ulaşılamıyor. İlk profil seçimi için bağlantı gerekir.';button.textContent='Tekrar dene';form.noValidate=true;button.disabled=false;}
  if(!dialog.open)dialog.showModal();
  await new Promise(resolve=>{form.onsubmit=async e=>{e.preventDefault();if(button.textContent==='Tekrar dene'){dialog.close();await this.login();resolve();return;}button.disabled=true;try{
   const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Kitaplik':'1'},body:JSON.stringify({profileId:select.value})});const data=await r.json();if(!r.ok)throw Error(data.error);
   if(this.db&&this.user?.id!==data.id){localStorage.setItem('kitaplik-account',JSON.stringify(data));location.reload();return;}
   this.user=data;this.authNeeded=false;localStorage.setItem('kitaplik-account',JSON.stringify(data));dialog.close();resolve();
  }catch(err){error.textContent=err.message||'Sunucuya ulaşılamadı.';}finally{button.disabled=false;}};select.onchange=()=>{if(select.value)form.requestSubmit();};});
 }
 async openDB(){const r=indexedDB.open('kitapligim-server-'+this.user.id,2);r.onupgradeneeded=()=>{for(const name of ['books','preferences','meta','readingTime','readingReceipts'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'id'});if(!r.result.objectStoreNames.contains('outbox'))r.result.createObjectStore('outbox',{keyPath:'opId'});};this.db=await req(r);this.db.onversionchange=()=>location.reload();}
 mountStatus(){
  const bar=document.createElement('div');bar.id='sync-bar';const name=document.createElement('span');name.textContent=this.user.username;bar.append(name);
  this.button=document.createElement('button');this.button.id='sync-now';this.button.textContent='Eşitleniyor…';this.button.onclick=async()=>{if(this.authNeeded){await this.login();await this.sync();}else await this.sync(true);};bar.append(this.button);
  const logout=document.createElement('button');logout.textContent='Profil değiştir';logout.onclick=()=>this.logout();bar.append(logout);document.querySelector('header').append(bar);
 }
 async pending(){return (await req(this.db.transaction('outbox').objectStore('outbox').getAll())).sort((a,b)=>a.sequence-b.sequence||a.opId.localeCompare(b.opId));}
 async commit(kind,id,next,editBase){
  const names=kind==='preferences'?['preferences','outbox','meta']:['books','outbox','meta'];const tx=this.db.transaction(names,'readwrite'),finish=done(tx);const store=tx.objectStore(kind==='preferences'?'preferences':'books');
  const old=await req(store.get(id));const previous=editBase||old||{};
  const {patch,base}=kind==='delete'?{patch:{},base:Object.fromEntries(fields.filter(k=>old?.[k]!==undefined).map(k=>[k,old[k]]))}:diff(next,previous,kind==='preferences'?prefFields:fields);
  if(kind!=='delete'&&!Object.keys(patch).length){await finish;return;}
  const counter=await req(tx.objectStore('meta').get('sequence'));const sequence=(counter?.value||0)+1;tx.objectStore('meta').put({id:'sequence',value:sequence});
  const op={opId:randomId(),sequence,kind,id,patch,base,upload:kind==='book'&&!!next.file&&!old?.hasFile};
  if(kind==='delete')store.delete(id);else store.put({...(old||next),...patch,id,...(kind==='book'?{file:next.file||old?.file||null,hasFile:old?.hasFile||!!next.file}:{})});
  tx.objectStore('outbox').put(op);await finish;this.show('Kayıt bekliyor');queueMicrotask(()=>this.sync());
 }
 async recordReadingTime(event,imported=false){
  if(!validTimeChunk(event))throw Error('Geçersiz süre kaydı.');
  const tx=this.db.transaction(['readingTime','readingReceipts','outbox','meta'],'readwrite'),finish=done(tx);
  if(await req(tx.objectStore('readingReceipts').get(event.opId))){await finish;return;}
  const id=timeRowId(event.bookId,event.day),old=await req(tx.objectStore('readingTime').get(id)),counter=await req(tx.objectStore('meta').get('sequence'));
  tx.objectStore('readingTime').put({id,bookId:event.bookId,day:event.day,milliseconds:imported?Math.max(old?.milliseconds||0,event.milliseconds):(old?.milliseconds||0)+event.milliseconds});
  tx.objectStore('readingReceipts').put({id:event.opId});tx.objectStore('meta').put({id:'sequence',value:(counter?.value||0)+1});
  tx.objectStore('outbox').put({...event,kind:'reading-time',sequence:(counter?.value||0)+1,import:imported});await finish;queueMicrotask(()=>this.sync());
 }
 async ensureFile(book){
  if(!book||book.format==='Manuel')return book;
  if(book.file?.size)return book;
  const r=await this.api('/api/books/'+book.id+'/file');const file=await r.blob();const tx=this.db.transaction('books','readwrite');const finish=done(tx);const current=await req(tx.objectStore('books').get(book.id));if(current)tx.objectStore('books').put({...current,file,hasFile:true});await finish;book.file=file;return book;
 }
 show(message){if(this.button)this.button.textContent=message;}
 async sync(showConflict=false){
  if(this.running)return this.running;
  this.running=this.perform(showConflict).finally(()=>{this.running=null});return this.running;
 }
 async perform(showConflict){
  if(!this.db)return;
  try{
   let conflicts=0;
   for(const op of await this.pending()){
    try{
     await this.api(op.kind==='reading-time'?'/api/reading-time':'/api/operation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(op)});
     if(op.upload){const b=await req(this.db.transaction('books').objectStore('books').get(op.id));if(b?.file?.size)await this.api('/api/books/'+op.id+'/file',{method:'PUT',body:b.file});else if(b&&b.format!=='Manuel')throw Error('Kitap dosyası cihazda bulunamadı.');}
     const tx=this.db.transaction('outbox','readwrite'),finish=done(tx);tx.objectStore('outbox').delete(op.opId);await finish;
    }catch(e){if(e.status===409){conflicts++;if(showConflict){await this.resolveConflict(op,e.detail);}break;}throw e;}
   }
   const snapshot=await (await this.api('/api/state')).json();
   // Read the outbox inside the write transaction, so edits during fetch survive.
   const tx=this.db.transaction(['books','preferences','outbox','meta','readingTime'],'readwrite'),finish=done(tx);
   const local=await req(tx.objectStore('books').getAll());const pending=await req(tx.objectStore('outbox').getAll());
   const merged=overlayState(snapshot,pending.filter(o=>o.kind!=='reading-time').sort((a,b)=>a.sequence-b.sequence),local);
   const time=new Map((snapshot.readingTime||[]).map(r=>[r.id,{...r}]));for(const event of pending.filter(o=>o.kind==='reading-time').sort((a,b)=>a.sequence-b.sequence)){const id=timeRowId(event.bookId,event.day),old=time.get(id);time.set(id,{id,bookId:event.bookId,day:event.day,milliseconds:event.import?Math.max(old?.milliseconds||0,event.milliseconds):(old?.milliseconds||0)+event.milliseconds});}tx.objectStore('readingTime').clear();for(const row of time.values())tx.objectStore('readingTime').put(row);
   tx.objectStore('books').clear();for(const b of merged.books)tx.objectStore('books').put(b);
   tx.objectStore('preferences').put(merged.preferences);tx.objectStore('meta').put({id:'lastSync',value:Date.now()});await finish;
   this.lastSync=Date.now();this.show(conflicts?'Çakışma var · seçmek için tıkla':pending.length?pending.length+' kayıt bekliyor':'Eşitlendi');this.onChange();
  }catch(e){this.show(this.authNeeded?'Yeniden giriş yap':navigator.onLine?'Sunucuya ulaşılamıyor · kayıtlar cihazda':'Çevrimdışı · kayıtlar cihazda');console.warn('Sync deferred:',e.message);}
 }
 async resolveConflict(op,detail){
  const local=detail.deleted&&op.kind==='book'?await req(this.db.transaction('books').objectStore('books').get(op.id)):null;
  const canRestore=!detail.deleted||op.kind!=='book'||local?.format==='Manuel'||!!local?.file?.size;
  const dialog=document.createElement('dialog');dialog.className='sync-conflict';
  const heading=document.createElement('h2');heading.textContent='İki cihaz aynı bilgiyi değiştirdi';dialog.append(heading);
  const info=document.createElement('p');info.textContent='Bu cihazdaki değişiklik henüz sunucuya gönderilmedi. Aşağıdaki alanlar için hangi kaydı koruyacağını seç.'+(detail.deleted?' Kitap sunucuda silinmiş. Bu cihazdaki dosya indirilmemişse kitap dosyasını yeniden eklemek gerekir.':'');dialog.append(info);
  const table=document.createElement('table');const head=document.createElement('tr');for(const t of ['Alan','Bu cihaz','Sunucu']){const th=document.createElement('th');th.textContent=t;head.append(th);}table.append(head);
  for(const field of detail.conflict){const tr=document.createElement('tr');for(const value of [field,op.kind==='delete'?'Kitabı sil':op.patch[field],detail.deleted?'Kitap silinmiş':detail.current[field]]){const td=document.createElement('td');td.textContent=typeof value==='object'?JSON.stringify(value):String(value??'—');tr.append(td);}table.append(tr);}dialog.append(table);
  const actions=document.createElement('div');dialog.append(actions);document.body.append(dialog);dialog.showModal();
  await new Promise(resolve=>{const finish=async choice=>{if(choice){const tx=this.db.transaction('outbox','readwrite'),end=done(tx);if(choice==='mine')tx.objectStore('outbox').put({...op,force:true,upload:op.upload||(detail.deleted&&op.kind==='book')});else {
    tx.objectStore('outbox').delete(op.opId);
    const rest=await req(tx.objectStore('outbox').getAll());
    for(const next of rest.filter(x=>x.sequence>op.sequence&&x.id===op.id&&x.kind===op.kind)){
      if(detail.deleted){tx.objectStore('outbox').delete(next.opId);continue;}
      const updated=structuredClone(next);for(const k of detail.conflict){delete updated.patch[k];delete updated.base[k];}
      if(!Object.keys(updated.patch).length)tx.objectStore('outbox').delete(next.opId);else tx.objectStore('outbox').put(updated);
    }
   }await end;}dialog.close();dialog.remove();resolve();};for(const [choice,label] of [['mine','Bu cihazı koru'],['server','Sunucuyu koru'],['','Daha sonra']]){const button=document.createElement('button');button.textContent=label;button.disabled=choice==='mine'&&!canRestore;button.onclick=()=>finish(choice);actions.append(button);}dialog.addEventListener('cancel',e=>{e.preventDefault();finish('')});});
 }
 async logout(){
  await this.sync();const pending=await this.pending();if(pending.length){alert('Henüz eşitlenmemiş kayıtların var. Önce bağlantıyı ve çakışmaları çöz; kayıtların kaybolmasın.');return;}
  try{await this.api('/api/logout',{method:'POST'});}catch{alert('Çıkış için sunucuya bağlanman gerekiyor.');return;}
  this.db.close();localStorage.removeItem('kitaplik-account');location.reload();
 }
}
