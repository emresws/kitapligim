import {availableGenres,genreLabel,genreId,effectiveGenre} from './genre-catalog.js';
import {createIntegratedReader} from './reader-upgrade.js';
import {ReadingClock,aggregateTime,validTimeChunk} from './reading-time.js';
import {renderTimeAnalysis} from './time-analysis.js';
import {saveLocalReadingTime,mergeLocalReadingTime} from './time-storage.js';
import {fileId,randomId} from './identity.js';
import {LibrarySync} from './sync.js';
import {LocalStorageAdapter} from './local-storage.js';
const localBuild=typeof __KITAPLIK_LOCAL__!=='undefined'&&__KITAPLIK_LOCAL__;
const cloud=localBuild?new LocalStorageAdapter():new LibrarySync();
import {createAtmosphere} from './atmosphere.js';
import {builtInThemes,themeTokens,validateTheme,themeTemplate,getTheme,readingChoices,currentReadingBook} from './themes.js';
import { defaultPreferences, cleanPreferences, parseTypedDate, displayTypedDate, bindDateInput } from './personalization.js';
import { pdfScale, requestedPage } from './reader-layout.js';
import { compareGenre, compareAuthor, authorKey, genreKey, canReorderBooks, reorderAuthorBooks } from './library-order.js';
import { readingStats, pageCount, pageOverride, originalPageCount, finishedInMonth, validDate } from './analytics.js';
import { epubPages } from './epub-pages.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import ePub from 'epubjs';
import JSZip from 'jszip';
// Keep PDF parsing self-contained in embedded and worker-restricted browsers.
globalThis.pdfjsWorker = { WorkerMessageHandler };
const $=id=>document.getElementById(id), statuses={want:'Okuyacağım',reading:'Okuyorum',read:'Okudum'};
let preferences={...defaultPreferences};
let readingTime=[];
async function recordReadingTime(event){await cloud.recordReadingTime(event);readingTime=await request(db.transaction('readingTime').objectStore('readingTime').getAll());}
const readingClock=new ReadingClock({write:recordReadingTime});
setInterval(()=>readingClock.tick()?.catch(e=>{console.error(e);notify('Okuma süresi kaydedilemedi.');}),15000);
for(const event of ['focus','blur','pageshow'])window.addEventListener(event,()=>readingClock.visibilityChanged()?.catch(e=>{console.error(e);notify('Okuma süresi kaydedilemedi.');}));
document.addEventListener('visibilitychange',()=>readingClock.visibilityChanged()?.catch(e=>{console.error(e);notify('Okuma süresi kaydedilemedi.');}));
window.addEventListener('pagehide',()=>readingClock.stop().catch(()=>{}));
const atmosphere=createAtmosphere({document,window});
let db,books=[],shelf='all',selected=null,epubBook=null,rendition=null,pdf=null,page=1,readerId=null,pdfRendering=false,toastTimer,manualCover=null,view='library',pageScan=null,manualMode=false,draggedBookId=null,orderSaving=false,pdfRenderAgain=false,positionQueue=Promise.resolve(),readerSession=0,epubTotal=0,readerResizeTimer;
const request=r=>new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});
async function storeRecord(book,explicitBase){const base=explicitBase||book._editBase;const next={...book};delete next._editBase;await cloud.commit('book',book.id,next,base)}
async function refresh(){books=await request(db.transaction('books').objectStore('books').getAll());readingTime=await request(db.transaction('readingTime').objectStore('readingTime').getAll());render();if($('settings-dialog').open&&!$('settings-genres-panel').hidden)renderGenreManager();}
function notify(t,lasting=false){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);if(!lasting)toastTimer=setTimeout(()=>$('toast').hidden=true,5000)}
function escaped(t){return String(t||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fallback(book){return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="#304338"/><rect x="18" y="18" width="264" height="414" fill="none" stroke="#bda36c"/><text x="150" y="135" text-anchor="middle" fill="#d7bd85" font-size="15" font-family="sans-serif">KİTAPLIĞIM</text><foreignObject x="36" y="175" width="228" height="180"><div xmlns="http://www.w3.org/1999/xhtml" style="color:#f6eedb;text-align:center;font:28px Georgia;overflow-wrap:anywhere">${escaped(book.title)}</div></foreignObject><text x="150" y="390" text-anchor="middle" fill="#d7bd85" font-size="14" font-family="sans-serif">${escaped(book.format)}</text></svg>`)}
const genreOptions=()=>availableGenres(books,preferences.genreCatalog);
const genreLabels=()=>new Map(genreOptions().map(g=>[genreId(g),g]));
const shownBooks=()=>{const labels=genreLabels();return books.map(b=>({...b,genre:effectiveGenre(b.genre,labels)}));};
function render(){
 renderPersonalization();
 $('library-view').hidden=view==='analysis';$('analysis-view').hidden=view!=='analysis';if(view==='analysis')renderAnalysis();
 const q=$('search').value.toLocaleLowerCase('tr'),labels=genreLabels(),genres=[...labels.values()],genre=effectiveGenre($('genre').value,labels);
 let result=shownBooks().filter(b=>(shelf==='all'||(shelf==='favorite'?b.favorite:b.status===shelf))&&(!genre||b.genre===genre)&&(`${b.title} ${b.author}`).toLocaleLowerCase('tr').includes(q));
 $('sort-read-date').hidden=shelf!=='read';
 const sort=$('sort').value;result.sort((a,b)=>sort==='genre'?compareGenre(a,b):sort==='read-date'?((b.ended||'').localeCompare(a.ended||'')||b.added-a.added):sort==='title'?a.title.localeCompare(b.title,'tr'):sort==='author'?compareAuthor(a,b):sort==='rating'?b.rating-a.rating:b.added-a.added);
 $('total').textContent=books.length;$('finished').textContent=books.filter(b=>b.status==='read').length;
 ['all','reading','want','read'].forEach(s=>$('count-'+s).textContent=books.filter(b=>s==='all'||(s==='favorite'?b.favorite:b.status===s)).length);
 $('shelf-title').textContent=shelf==='all'?'Kitaplığın':shelf==='favorite'?'Favorilerin':statuses[shelf];
 $('subtitle').textContent=books.length?`${result.length} kitap · Her kapağın ardında başka bir dünya.`:'Bir sonraki hikâyen burada başlasın.';
 $('genre').innerHTML='<option value="">Tüm türler</option>'+genres.map(g=>`<option value="${escaped(g)}">${escaped(g)}</option>`).join('');$('genre').value=genre;
 $('empty').hidden=books.length>0;$('no-results').hidden=!books.length||result.length>0;
 const nodes=[];let previousGroup=null;for(const b of result){if(sort==='genre'||sort==='author'){const key=sort==='genre'?genreKey(b):authorKey(b);if(key!==previousGroup){const heading=document.createElement('h2');heading.className='genre-heading';heading.textContent=sort==='genre'?(genreKey(b)||'Türsüz'):(String(b.author||'').trim()||'Yazar belirtilmemiş');nodes.push(heading);previousGroup=key;}}nodes.push((()=>{const card=document.createElement('button');card.className='card';card.setAttribute('aria-label',b.title+' ayrıntılarını aç');card.innerHTML=`<img class="cover" src="${escaped(b.cover||fallback(b))}" alt="${escaped(b.title)} kapağı"><h3>${escaped(b.title)}</h3><p>${escaped(b.author||'Yazar belirtilmemiş')}</p><div class="meta"><span>${b.rating?'★'.repeat(b.rating):b.format}${b.favorite?' ♥':''}</span><span class="status">${shelf==='read'?(validDate(b.ended)?new Intl.DateTimeFormat('tr',{day:'numeric',month:'short',year:'numeric'}).format(new Date(b.ended+'T12:00:00')):'Bitiş tarihi yok'):statuses[b.status]}</span></div>`;card.querySelector('img').draggable=false;card.dataset.bookId=b.id;card.draggable=manualMode;card.classList.toggle('movable',manualMode);card.onclick=()=>{if(!manualMode)openDetail(b.id)};
 if(manualMode){
  card.setAttribute('aria-label',b.title+' · Sıralamak için sürükle veya Alt ve sol/sağ ok tuşlarını kullan');
  card.ondragstart=e=>{if(orderSaving){e.preventDefault();return;}draggedBookId=b.id;e.dataTransfer.setData('application/x-kitaplik-book',b.id);e.dataTransfer.effectAllowed='move';card.classList.add('dragging');};
  card.ondragend=()=>{draggedBookId=null;document.querySelectorAll('.card').forEach(c=>c.classList.remove('dragging','drop-before','drop-after'));};
  card.ondragover=e=>{if(!draggedBookId||draggedBookId===b.id||!canReorderBooks(books.find(x=>x.id===draggedBookId),b,sort))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect='move';const after=e.clientX>card.getBoundingClientRect().left+card.getBoundingClientRect().width/2;card.classList.toggle('drop-after',after);card.classList.toggle('drop-before',!after);};
  card.ondragleave=()=>card.classList.remove('drop-before','drop-after');
  card.ondrop=e=>{if(!draggedBookId)return;e.preventDefault();e.stopPropagation();const id=draggedBookId;draggedBookId=null;const after=e.clientX>card.getBoundingClientRect().left+card.getBoundingClientRect().width/2;card.classList.remove('drop-before','drop-after');saveLibraryOrder(id,b.id,after);};
  card.onkeydown=e=>{if(!e.altKey||!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const index=result.findIndex(x=>x.id===b.id),direction=e.key==='ArrowLeft'?-1:1,target=result[index+direction];if(target&&canReorderBooks(b,target,sort))saveLibraryOrder(b.id,target.id,direction>0);};
 }
 return card;})());} $('grid').replaceChildren(...nodes);
 $('manual-order').hidden=!['genre','author'].includes(sort);$('manual-order').textContent=manualMode?'Düzenlemeyi bitir':'Elle düzenle';$('manual-order').setAttribute('aria-pressed',String(manualMode));$('order-hint').hidden=!manualMode;

}
async function openDetail(id){const original=books.find(b=>b.id===id);if(original?.format==='EPUB'&&!original.pagesSource)await ensureEpubPages(original);selected=structuredClone(books.find(b=>b.id===id));if(!selected)return;selected._editBase={...selected};delete selected._editBase.file;for(const k of ['title','author','year','rating','status','started','ended','notes','favorite']){if(k==='favorite')$(k).checked=!!selected[k];else $(k).value=['started','ended'].includes(k)?displayTypedDate(selected[k]):selected[k]|| (k==='rating'?'0':'')}for(const id of ['started','ended'])$(id).setCustomValidity('');fillGenreSelect('book-genre',selected.genre||'');$('detail-cover').src=selected.cover||fallback(selected);$('file-info').textContent=(selected.file||selected.hasFile)?`${selected.format} · ${selected.file?.size?(selected.file.size/1024/1024).toFixed(1)+' MB':'Sunucuda'}${selected.pages?' · '+selected.pages+' sayfa':''}`:'Manuel kayıt · Kitap dosyası yok';$('read-book').hidden=!selected.file&&!selected.hasFile;$('offline-book').hidden=localBuild||selected.format==='Manuel';$('offline-book').textContent=selected.file?.size?'Çevrimdışı hazır':'Çevrimdışı indir';$('pages').value=pageCount(selected)||'';$('pages-auto').hidden=selected.format==='Manuel';$('pages-info').textContent='';updatePageEditor();$('detail').showModal()}
function updatePageEditor(){
 const input=$('pages'),automatic=originalPageCount(selected),manual=selected.format==='Manuel';
 $('pages-info').textContent=manual?'Kitabın toplam sayfa sayısını girebilirsin.':(automatic?
  'Otomatik sayı: '+automatic+(selected.pagesSource==='estimated'?' sayfa (tahmini EPUB).':' sayfa.'):'Otomatik sayfa sayısı bulunamadı.')+
  (pageOverride(selected)?' Analizde elle girdiğin sayı kullanılıyor.':' İstersen analiz için bu sayıyı değiştir.');
 input.placeholder=manual?'İsteğe bağlı':automatic?'Boş bırak: otomatik':'İsteğe bağlı';
}
$('pages-auto').onclick=()=>{$('pages').value='';$('pages').focus();$('pages-info').textContent='Kaydettiğinde otomatik sayfa sayısına dönülür.';};
async function saveDetail(){if(!selected)return;const started=parseTypedDate($('started').value,'Başlangıç'),ended=parseTypedDate($('ended').value,'Bitiş');for(const k of ['title','author','year','status','notes'])selected[k]=$(k).value.trim();selected.started=started;selected.ended=ended;const enteredPages=parseManualPages($('pages').value);if(selected.format==='Manuel'){selected.pages=enteredPages;selected.pagesSource='manual';}
 else if(enteredPages!==pageCount(selected)||!enteredPages){selected.pagesOverride=enteredPages;}selected.genre=$('book-genre').value;selected.rating=Number($('rating').value);selected.favorite=$('favorite').checked;await storeRecord(selected);selected._editBase={...selected};delete selected._editBase._editBase;delete selected._editBase.file;await refresh()}
async function blobData(blob){return new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=no;fr.readAsDataURL(blob)})}
async function importFiles(files){const valid=[...files].filter(f=>/\.(pdf|epub)$/i.test(f.name));if(!valid.length)return notify('PDF veya EPUB dosyası seç.');$('add').disabled=true;let count=0,failed=0,duplicate=0,coverWarnings=0;const failures=[];
 try{await navigator.storage?.persist?.();for(const file of valid){notify(`${file.name} hazırlanıyor…`,true);try{const data=await file.arrayBuffer();const id=await fileId(data);if(books.some(b=>b.id===id)){duplicate++;continue}
 const format=file.name.toLowerCase().endsWith('.pdf')?'PDF':'EPUB';let b={id,file:new Blob([data],{type:format==='PDF'?'application/pdf':'application/epub+zip'}),filename:file.name,format,title:file.name.replace(/\.(pdf|epub)$/i,'').replace(/_/g,' '),author:'',year:'',genre:'',status:'want',rating:0,favorite:false,notes:'',started:'',ended:'',added:Date.now(),position:null};
 if(format==='PDF'){
 let doc;
 try {
  doc=await pdfjs.getDocument({data:new Uint8Array(data.slice(0)),isEvalSupported:false,standardFontDataUrl:new URL('./pdf-assets/standard_fonts/',document.baseURI).href,cMapUrl:new URL('./pdf-assets/cmaps/',document.baseURI).href,cMapPacked:true,wasmUrl:new URL('./pdf-assets/wasm/',document.baseURI).href}).promise;
  b.pages=doc.numPages;b.pagesSource='pdf';
  try { const meta=await doc.getMetadata();if(meta.info?.Title?.trim())b.title=meta.info.Title;if(meta.info?.Author)b.author=meta.info.Author; } catch(e) { console.warn('PDF metadata unavailable',e); }
  try {
   const p=await doc.getPage(1),vp=p.getViewport({scale:1});const view=p.getViewport({scale:440/vp.width});const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await p.render({canvas,canvasContext:canvas.getContext('2d'),viewport:view}).promise;b.cover=canvas.toDataURL('image/jpeg',.8);
  } catch(e) { console.warn('PDF cover unavailable',e);b.coverWarning=true; }
 } finally { await doc?.loadingTask.destroy(); }
 }
 else{const zip=await JSZip.loadAsync(data);const containerFile=zip.file('META-INF/container.xml');if(!containerFile)throw Error('Geçerli EPUB değil');const xml=new DOMParser().parseFromString(await containerFile.async('string'),'application/xml');const opfPath=xml.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');if(!opfPath||!zip.file(opfPath))throw Error('EPUB bilgileri bulunamadı');const opf=new DOMParser().parseFromString(await zip.file(opfPath).async('string'),'application/xml');const field=name=>opf.getElementsByTagNameNS('*',name)[0]?.textContent?.trim()||'';b.title=field('title')||b.title;b.author=field('creator');b.year=field('date').slice(0,4);b.genre=field('subject');const items=Array.from(opf.getElementsByTagNameNS('*','item'));const coverId=Array.from(opf.getElementsByTagNameNS('*','meta')).find(m=>m.getAttribute('name')==='cover')?.getAttribute('content');const item=items.find(i=>(i.getAttribute('properties')||'').split(' ').includes('cover-image'))||items.find(i=>i.getAttribute('id')===coverId);if(item){const path=new URL(item.getAttribute('href'),'https://epub.local/'+opfPath).pathname.slice(1);const image=zip.file(decodeURIComponent(path));if(image){const blob=new Blob([await image.async('uint8array')],{type:item.getAttribute('media-type')||'image/jpeg'});if(blob.type.startsWith('image/')&&blob.type!=='image/svg+xml')b.cover=await blobData(blob)}}}
 if(format==='EPUB'){try{Object.assign(b,await epubPages(data))}catch(e){console.warn('EPUB page count unavailable',e);b.pagesSource='unknown';}}
 await storeRecord(b);books.push(b);count++;if(b.coverWarning)coverWarnings++;
 }catch(e){console.error(e);failed++;failures.push(`${file.name}: ${e.name==='PasswordException'?'Dosya şifreli. Şifresiz bir kopyasını seç.':e.name==='InvalidPDFException'?'Geçerli bir PDF dosyası değil.':e.name==='QuotaExceededError'?'Tarayıcı depolaması dolu.':e.message||'Dosya işlenemedi.'}`)}}await refresh();notify(`${count} kitap eklendi.${duplicate?' '+duplicate+' kitap zaten rafında.':''}${coverWarnings?' '+coverWarnings+' kitabın kapağı çıkarılamadı; kapağı elle ekleyebilirsin.':''}${failed?' '+failures.join(' '):''}`)}finally{$('add').disabled=false;$('files').value=''}
}
async function writeReaderState(id,patch){
 if(!id)return;const b=books.find(b=>b.id===id);if(b)Object.assign(b,patch);
 positionQueue=positionQueue.catch(()=>{}).then(async()=>{const latest=await request(db.transaction('books').objectStore('books').get(id));if(!latest)return;const base={...latest};Object.assign(latest,patch);await storeRecord(latest,base);const current=books.find(b=>b.id===id);if(current)Object.assign(current,patch);});
 try{await positionQueue}catch(e){notify('Okuma konumu kaydedilemedi.');console.error(e)}
}
const integratedReader=createIntegratedReader({save:writeReaderState,notify,getBook:id=>books.find(b=>b.id===id),storageNamespace:()=>db?.name||'kitapligim-local-v1',onStart:id=>readingClock.start(id),onStop:()=>readingClock.stop()});
async function closeReader(){return integratedReader.close();}
async function readBook(){if(!selected)return;
 try{await cloud.ensureFile(selected);}catch(e){notify(localBuild?e.message:'Kitabı indirmek için sunucuya bağlan.');return;}
 if(!selected.file)return;try{parseTypedDate($('started').value,'Başlangıç');parseTypedDate($('ended').value,'Bitiş');await saveDetail();const book=books.find(b=>b.id===selected.id);$('detail').close();await integratedReader.open(book);}catch(e){console.error(e);notify(e.message||'Kitap açılamadı.');}}
async function backup(){try{notify('Kitapların ve notların yedekleniyor…',true);const zip=new JSZip();for(const b of books)if(b.hasFile&&!b.file)await cloud.ensureFile(b);const records=books.map(({file,_editBase,hasFile,...b})=>b);zip.file('kitaplik.json',JSON.stringify({version:4,books:records,preferences,readingTime}));for(const b of books)if(b.file)zip.file('books/'+b.id,b.file);const blob=await zip.generateAsync({type:'blob',compression:'STORE'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='kitapligim-'+new Date().toISOString().slice(0,10)+'.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);notify('Tam yedeğin indirildi; kapakların, notların ve varsa kitap dosyaların da içinde.')}catch(e){notify('Yedek oluşturulamadı. Tekrar dene.')}}
async function restore(file){try{notify('Yedek okunuyor…',true);const zip=await JSZip.loadAsync(file);const manifest=zip.file('kitaplik.json');if(!manifest)throw Error('Yedek bulunamadı');const data=JSON.parse(await manifest.async('string'));if(![1,2,3,4].includes(data.version)||!Array.isArray(data.books))throw Error('Geçersiz yedek');const pending=[];for(const b of data.books){if(!/^[a-f0-9]{64}$/.test(b.id)||typeof b.title!=='string'||!['PDF','EPUB','Manuel'].includes(b.format)||!statuses[b.status]||(b.format!=='Manuel'&&!zip.file('books/'+b.id)))throw Error('Geçersiz kitap');if(books.some(x=>x.id===b.id))continue;const file=b.format==='Manuel'?null:await zip.file('books/'+b.id).async('blob');pending.push({...b,file,cover:b.cover?.startsWith('data:image/')?b.cover:null,author:String(b.author||''),genre:String(b.genre||''),rating:Math.max(0,Math.min(5,Number(b.rating)||0))})}
 const restoredPreferences=data.preferences?cleanPreferences({genreCatalog:preferences.genreCatalog,...data.preferences}):null;if(restoredPreferences?.featuredBookId&&![...books,...pending].some(b=>b.id===restoredPreferences.featuredBookId))restoredPreferences.featuredBookId='';
 for(const book of pending)await storeRecord(book);if(restoredPreferences)await cloud.commit('preferences','settings',restoredPreferences);if(restoredPreferences)preferences=restoredPreferences;for(const row of (data.readingTime||[]).filter(validTimeChunk))await cloud.recordReadingTime({...row,opId:randomId()},true);await refresh();notify(`${pending.length} kitap geri yüklendi. Mevcut kitapların korundu.`)}catch(e){console.error(e);notify('Yedek geri yüklenemedi. Geçerli bir Kitaplığım ZIP yedeği seç.')}finally{$('backup-file').value=''}}
async function savePreferences(patch){const next=cleanPreferences({...preferences,...patch});await cloud.commit('preferences','settings',next,preferences);preferences=next;render();}
function renderPersonalization(){
 $('quote-text').textContent=preferences.quote||'…';
 $('current-reading').hidden=view!=='library'||shelf!=='all';
 const b=currentReadingBook(books,preferences.featuredBookId);
 $('current-cover').hidden=!b;$('current-plus').hidden=!!b;
 if(b){$('current-cover').src=b.cover||fallback(b);$('current-cover').alt=b.title+' kapağı';}
 else $('current-cover').removeAttribute('src');
 $('current-reading').setAttribute('aria-label',b?b.title+' · Şu an okunan kitabı değiştir':'Şu an okunan kitabı seç');
 $('current-reading').title=b?b.title+' · Kitap seçeneklerini aç':'Okuyorum rafından kitap seç';$('current-read-now').hidden=!b;$('current-read-now').disabled=!!b&&b.format==='Manuel';$('current-read-now').title=b?.format==='Manuel'?'Bu kayıtta okunabilir kitap dosyası yok.':'Seçili kitaba kaldığın yerden devam et';
 applyTheme();
}
function openReadingPicker(){
 const options=readingChoices(books);$('reading-options').replaceChildren();$('reading-picker-empty').hidden=!!options.length;
 for(const b of options){const button=document.createElement('button');button.className='reading-option';button.setAttribute('aria-pressed',String(b.id===preferences.featuredBookId));button.innerHTML=`<img src="${escaped(b.cover||fallback(b))}" alt=""><span><strong>${escaped(b.title)}</strong><small>${escaped(b.author||'Yazar belirtilmemiş')}</small></span>`;button.onclick=async()=>{button.disabled=true;try{await savePreferences({featuredBookId:b.id});$('reading-picker').close()}catch{notify('Kitap seçimi kaydedilemedi.');button.disabled=false}};$('reading-options').append(button);}
 const featured=currentReadingBook(books,preferences.featuredBookId);$('reading-current-read').hidden=!featured;$('reading-current-read').disabled=featured?.format==='Manuel';$('reading-clear').hidden=!preferences.featuredBookId;$('reading-picker').showModal();
}
function applyTheme(){const theme=getTheme(preferences);for(const [key,token] of Object.entries(themeTokens))document.documentElement.style.setProperty(token,theme.colors[key]);document.body.classList.remove('light');document.body.classList.toggle('arrakis',theme.atmosphere==='arrakis');atmosphere.set(theme.atmosphere==='arrakis');document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.colors.background);}
function renderThemeOptions(){
 const themes=[...builtInThemes,...(preferences.customTheme?[{...preferences.customTheme,id:'custom'}]:[])];$('theme-options').replaceChildren();
 for(const theme of themes){const button=document.createElement('button');button.className='theme-option';button.setAttribute('aria-pressed',String(theme.id===preferences.themeId));button.style.setProperty('--preview-bg',theme.colors.background);button.style.setProperty('--preview-panel',theme.colors.panel);button.style.setProperty('--preview-accent',theme.colors.accent);button.innerHTML=`<span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i></span><span>${escaped(theme.name)}</span>`;button.onclick=async()=>{button.disabled=true;try{await savePreferences({themeId:theme.id});renderThemeOptions()}catch{notify('Tema kaydedilemedi.');button.disabled=false}};$('theme-options').append(button);}
 $('custom-theme-name').textContent=preferences.customTheme?'Yüklü tema: '+preferences.customTheme.name:'';
}
function downloadThemeTemplate(){const url=URL.createObjectURL(new Blob([JSON.stringify(preferences.themeId==='arrakis'?{format:'kitapligim-theme',version:1,name:getTheme(preferences).name,atmosphere:'arrakis',colors:getTheme(preferences).colors}:themeTemplate,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=preferences.themeId==='arrakis'?'kitapligim-arrakis-tema.json':'kitapligim-tema-sablonu.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
async function importTheme(file){$('theme-upload').disabled=true;$('theme-error').hidden=true;try{if(file.size>20000)throw Error('Tema dosyası 20 KB veya daha küçük olmalı.');const theme=validateTheme(JSON.parse(await file.text()));await savePreferences({customTheme:theme,themeId:'custom'});renderThemeOptions();notify('Özel teman uygulandı ve kaydedildi.')}catch(e){$('theme-error').textContent=e instanceof SyntaxError?'Dosya geçerli JSON içermiyor.':e.message||'Tema yüklenemedi.';$('theme-error').hidden=false;}finally{$('theme-upload').disabled=false;$('theme-file').value='';}}
async function saveLibraryOrder(movingId,targetId,after){
 if(orderSaving||movingId===targetId)return;orderSaving=true;
 try{const current=await request(db.transaction('books').objectStore('books').getAll());const labels=genreLabels();const next=reorderAuthorBooks(current.map(b=>({...b,genre:effectiveGenre(b.genre,labels)})),movingId,targetId,after,$('sort').value);for(const b of next){const raw=current.find(x=>x.id===b.id);await storeRecord({...raw,authorBookRank:b.authorBookRank},raw);}await refresh();notify('Bu yazarın kitap sırası kaydedildi.');document.querySelector(`[data-book-id="${movingId}"]`)?.focus();}catch(e){notify(e.message||'Sıralama kaydedilemedi; önceki sıran korundu.');console.error(e)}finally{orderSaving=false;}
}
function parseManualPages(value){if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);if(!Number.isInteger(n)||n<1||n>1000000)throw Error('Sayfa sayısı 1–1.000.000 arasında tam sayı olmalı.');return n;}
async function ensureEpubPages(book){
 if(book.format!=='EPUB'||book.pagesSource||!book.file)return;
 let count;try{count=await epubPages(await book.file.arrayBuffer())}catch(e){console.warn('EPUB pages unavailable',e);count={pages:null,pagesSource:'unknown'}}
 const latest=await request(db.transaction('books').objectStore('books').get(book.id));if(!latest)return;const base={...latest};Object.assign(latest,count);await storeRecord(latest,base);const index=books.findIndex(b=>b.id===book.id);if(index>=0)books[index]=latest;
}
async function backfillEpubPages(){if(pageScan)return;const pending=books.filter(b=>b.format==='EPUB'&&!b.pagesSource&&b.file);if(!pending.length)return;pageScan=(async()=>{try{for(const b of pending){await ensureEpubPages(b);if(view==='analysis')renderAnalysis()}}catch(e){notify('Bazı EPUB sayfa bilgileri hesaplanamadı.')}finally{pageScan=null;if(view==='analysis')renderAnalysis()}})();if(view==='analysis')renderAnalysis();await pageScan;}
const monthNames=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
function renderAnalysis(){
 const mode=$('analysis-mode').value||'pages',time=mode==='time',year=Number($('analysis-year').value)||new Date().getFullYear();
 $('chart-metric').hidden=time;$('analysis-chart-title').textContent=time?'Aylara göre okuma süresi · saat':'Aylara göre okuma';$('analysis-genre-title').textContent=time?'Türlere göre okuma süresi':'Okuduğun türler';
 $('analysis-method').textContent=time?'Süre, okuyucu görünür ve ön plandayken ölçülür. Arka plandaki sekmeler ve uzun askıya alma aralıkları sayılmaz. Gün ve ay sınırları ayrı kaydedilir; kitabın bitirme tarihi süreyi taşımaz. Önceki okumalar için geriye dönük süre üretilmez.':'Sayfa özeti, Okudum rafındaki kitapların bitirme tarihine göre hesaplanır. Sayfalar kitabın tamamlandığı aya aittir; gün gün okunan sayfa kaydı değildir. EPUB sayısı sabit sayfa listesi yoksa 250 kelime ≈ 1 sayfa olarak tahmin edilir.';
 if(time)renderTimeAnalysis({books:shownBooks(),rows:readingTime,year,escape:escaped});else renderPageAnalysis();
 renderFinishedMonth();
}
const fullMonthNames=Array.from({length:12},(_,i)=>new Intl.DateTimeFormat('tr',{month:'long'}).format(new Date(2020,i,1)));
function renderFinishedMonth(){
 const now=new Date(),year=Number($('analysis-year').value)||now.getFullYear(),picker=$('finished-month');
 const years=[...new Set([...Array.from($('analysis-year').options,o=>Number(o.value)),...readingStats(books,year,now).years])].sort((a,b)=>b-a);
 $('finished-year').replaceChildren(...years.map(y=>new Option(y,String(y))));$('finished-year').value=String(year);
 if(!picker.options.length)picker.replaceChildren(...fullMonthNames.map((name,i)=>new Option(name,String(i+1))),new Option('Tüm aylar','all'));
 if(!picker.dataset.ready){picker.value=String(now.getMonth()+1);picker.dataset.ready='true';}
 const month=Number(picker.value),list=month?finishedInMonth(books,year,month,now):
  Array.from({length:12},(_,i)=>finishedInMonth(books,year,12-i,now)).flat();
 $('finished-month-count').textContent=(month?fullMonthNames[month-1]+' ':'')+year+' · '+list.length+' kitap';
 $('finished-month-empty').hidden=!!list.length;
 const format=new Intl.DateTimeFormat('tr',{day:'numeric',month:'long',year:'numeric'});
 const entries=list.map(b=>{
  const li=document.createElement('li'),button=document.createElement('button'),title=document.createElement('strong'),meta=document.createElement('small');
  button.type='button';title.textContent=b.title;meta.textContent=[b.author,format.format(new Date(b.ended+'T12:00:00')),pageCount(b)?pageCount(b).toLocaleString('tr')+' sayfa':''].filter(Boolean).join(' · ');
  button.append(title,meta);button.onclick=()=>openDetail(b.id).catch(e=>notify(e.message));li.append(button);return li;
 });
 $('finished-month-books').replaceChildren(...entries);
}
function renderPageAnalysis(){
 const now=new Date();const year=Number($('analysis-year').value)||now.getFullYear();const stats=readingStats(shownBooks(),year,now);const fmt=n=>new Intl.NumberFormat('tr',{maximumFractionDigits:1}).format(n);
 $('analysis-year').innerHTML=[...new Set([...stats.years,...aggregateTime(readingTime,year,now).years,year])].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join('');$('analysis-year').value=year;
 const cards=(data,annual)=>[{title:annual?'Yılda biten kitap':'Bu ay biten kitap',value:data.books,unit:'kitap'},{title:annual?'Yıllık sayfa toplamı':'Bu ay toplam sayfa',value:data.pages,unit:data.estimated?'sayfa · tahmin dahil':'sayfa'},{title:annual?'Yıllık günlük ortalama':'Bu ay günlük ortalama',value:data.average,unit:'sayfa / takvim günü'}].map(c=>`<article><span>${c.title}</span><strong>${fmt(c.value)}</strong><small>${c.unit}</small></article>`).join('');
 $('month-stats').innerHTML=cards(stats.month,false);$('year-stats').innerHTML=cards(stats.year,true);
 const notes=[];if(stats.undated)notes.push(`${stats.undated} okunan kitabın bitirme tarihi yok; tarihli özetlere dahil edilmedi.`);if(stats.future)notes.push(`${stats.future} kitabın bitirme tarihi gelecekte; henüz dahil edilmedi.`);if(stats.year.unknown)notes.push(`${year} yılında ${stats.year.unknown} kitabın sayfa bilgisi eksik.`);if(stats.year.estimated)notes.push(`Sayfa toplamında ${stats.year.estimated} EPUB kitabının tahmini sayısı var.`);if(pageScan)notes.push('Mevcut EPUB kitaplarının sayfa bilgileri hesaplanıyor…');$('analysis-notice').textContent=notes.join(' ');$('analysis-notice').hidden=!notes.length;
 const metric=$('chart-metric').value||'books',max=Math.max(1,...stats.months.map(m=>m[metric])),ticks=4,top=Math.max(ticks,Math.ceil(max/ticks)*ticks),height=180,width=720,left=45,bottom=230,step=(width-left-20)/12;let svg=`<svg viewBox="0 0 ${width} 265" role="img" aria-label="${year} aylık ${metric==='books'?'kitap':'sayfa'} sayısı">`;
 for(let i=0;i<=ticks;i++){const y=bottom-height*i/ticks;svg+=`<line x1="${left}" y1="${y}" x2="${width-10}" y2="${y}" stroke="var(--line)"/><text x="${left-10}" y="${y+4}" text-anchor="end" fill="var(--muted)" font-size="12">${fmt(top*i/ticks)}</text>`}
 stats.months.forEach((m,i)=>{const x=left+i*step+step/2,h=m[metric]/top*height;svg+=`<rect x="${x-14}" y="${bottom-h}" width="28" height="${h}" rx="3" fill="var(--gold)"><title>${monthNames[i]}: ${m.books} kitap, ${m.pages} sayfa</title></rect><text x="${x}" y="${bottom-h-9}" text-anchor="middle" fill="var(--text)" font-size="12">${fmt(m[metric])}</text><text x="${x}" y="${bottom+23}" text-anchor="middle" fill="var(--muted)" font-size="13">${monthNames[i]}</text>`});$('monthly-chart').innerHTML=svg+'</svg>';
 $('monthly-table').innerHTML='<table><thead><tr><th>Ay</th><th>Kitap</th><th>Sayfa</th></tr></thead><tbody>'+stats.months.map(m=>`<tr><td>${monthNames[m.month]}</td><td>${m.books}</td><td>${m.pages}</td></tr>`).join('')+'</tbody></table>';
 const genreMax=Math.max(1,...stats.genres.map(g=>g[1]));$('genre-chart').innerHTML=stats.genres.length?stats.genres.map(([genre,count])=>`<div class="genre-row"><span>${escaped(genre)}</span><div class="genre-track"><div style="width:${count/genreMax*100}%"></div></div><strong>${count}</strong></div>`).join(''):'<p class="analysis-method">Bu yıl için tarihli, bitmiş kitap kaydı yok.</p>';
}
async function resizedCover(file){
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas');const scale=Math.min(1,600/bitmap.width);canvas.width=bitmap.width*scale;canvas.height=bitmap.height*scale;canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.85)}finally{bitmap.close()}
}
function fillGenreSelect(id,current=''){
 const labels=genreLabels();
 $(id).replaceChildren(new Option('Türsüz',''),...[...labels.values()].map(g=>new Option(g,g)));
 $(id).value=effectiveGenre(current,labels);
}
function showSettingsTab(name){
 const genres=name==='genres';$('settings-genres-panel').hidden=!genres;$('settings-design-panel').hidden=genres;
 for(const tab of $('settings-tabs').querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.panel===name));
 if(genres)renderGenreManager();
}
function renderGenreManager(){
 const counts=new Map();for(const b of books){const id=genreId(b.genre);counts.set(id,(counts.get(id)||0)+1);}
 const items=genreOptions().map(name=>{
  const li=document.createElement('li'),description=document.createElement('span'),remove=document.createElement('button'),count=counts.get(genreId(name))||0;
  description.textContent=name+' · '+count+' kitap';remove.type='button';remove.textContent='Sil';remove.setAttribute('aria-label',name+' türünü sil');
  remove.onclick=()=>changeGenre(name,true,count);li.append(description,remove);return li;
 });
 $('genre-manager-list').replaceChildren(...items);$('genre-manager-empty').hidden=!!items.length;
}
let changingGenre=false;
async function changeGenre(raw,remove=false,count=0){
 if(changingGenre||!db)return;
 const name=genreLabel(raw),id=genreId(name),prev=preferences.genreCatalog||{added:[],removed:[]};
 const error=$('genre-manager-error');error.textContent='';
 if(!name||name.length>120){error.textContent='Tür adı 1–120 karakter olmalı.';return;}
 if(!remove&&genreOptions().some(g=>genreId(g)===id)){error.textContent='Bu tür zaten listede.';return;}
 if(remove&&!confirm('“'+name+'” türü silinsin mi? '+(count?count+' kitap Türsüz olarak görünecek.':'Kitaplar silinmez.')))return;
 const added=prev.added.filter(g=>genreId(g)!==id),removed=prev.removed.filter(g=>genreId(g)!==id);
 (remove?removed:added).push(name);
 if(added.length>2000||removed.length>2000){error.textContent='Tür listesi sınırına ulaşıldı.';return;}
 changingGenre=true;const submit=$('genre-manager-add');submit.disabled=true;
 try{
  // Save the removal first so even a pending device sees the effective genre as empty.
  if(remove)await savePreferences({genreCatalog:{added,removed}});
  if(remove||prev.removed.some(g=>genreId(g)===id)){
   const records=await request(db.transaction('books').objectStore('books').getAll());
   for(const b of records.filter(b=>genreId(b.genre)===id))await storeRecord({...b,genre:''},b);
  }
  if(!remove)await savePreferences({genreCatalog:{added,removed}});
  $('genre-manager-name').value='';await refresh();
 }catch(e){error.textContent=e.message||'Tür değişikliği kaydedilemedi.';}
 finally{changingGenre=false;submit.disabled=false;renderGenreManager();}
}
$('genre-manager-form').onsubmit=e=>{e.preventDefault();changeGenre($('genre-manager-name').value);};
for(const tab of $('settings-tabs').querySelectorAll('button'))tab.onclick=()=>showSettingsTab(tab.dataset.panel);
function openAddDialog(){if(!db)return notify('Kitaplık hazırlanıyor. Birazdan tekrar dene.');$('manual-form').reset();fillGenreSelect('manual-genre');manualCover=null;$('manual-cover-preview').hidden=true;$('manual-cover-preview').removeAttribute('src');$('manual-cover-label').hidden=false;$('add-dialog').showModal()}
async function createManualBook(title,author,cover,pages=null,genre=''){
 title=title.trim();author=author.trim();if(!title||title.length>300||author.length>300)throw Error('Geçerli bir kitap adı ve yazar gir.');
 const id=await fileId(new TextEncoder().encode(randomId()));
 const b={id,file:null,format:'Manuel',pages:parseManualPages(pages),pagesSource:'manual',title,author,cover:cover||null,year:'',genre,status:'want',rating:0,favorite:false,notes:'',started:'',ended:'',added:Date.now(),position:null};
 await storeRecord(b);await refresh();return b;
}
$('close-add').onclick=$('cancel-add').onclick=()=>$('add-dialog').close();
$('add-from-file').onclick=()=>{$('add-dialog').close();$('files').click()};
$('manual-cover-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('save-manual').disabled=true;try{manualCover=await resizedCover(file);$('manual-cover-preview').src=manualCover;$('manual-cover-preview').hidden=false;$('manual-cover-label').hidden=true}catch{notify('Görsel açılamadı. JPEG, PNG veya WebP seç.')}finally{$('save-manual').disabled=false}};
$('manual-form').onsubmit=async e=>{e.preventDefault();$('save-manual').disabled=true;try{await createManualBook($('manual-title').value,$('manual-author').value,manualCover,$('manual-pages').value,$('manual-genre').value);$('add-dialog').close();notify('Kitap rafına eklendi.')}catch(e){notify(e.name==='QuotaExceededError'?'Tarayıcı depolaması dolu.':e.message||'Kitap kaydedilemedi.')}finally{$('save-manual').disabled=false}};
$('add').onclick=$('empty-add').onclick=openAddDialog;$('files').onchange=e=>importFiles(e.target.files).catch(()=>notify('Kitaplar kaydedilemedi. Tarayıcı depolamasını kontrol et.'));
for(const b of document.querySelectorAll('[data-shelf]'))b.onclick=()=>{view='library';manualMode=false;$('analysis-tab').classList.remove('active');shelf=b.dataset.shelf;if(shelf==='read')$('sort').value='read-date';else if($('sort').value==='read-date')$('sort').value='new';document.querySelectorAll('[data-shelf]').forEach(x=>x.classList.toggle('active',x===b));render()};
for(const id of ['search','genre'])$(id).addEventListener(id==='search'?'input':'change',render);$('sort').onchange=()=>{manualMode=false;render();};$('manual-order').onclick=()=>{manualMode=!manualMode;render();};
$('edit').onsubmit=async e=>{e.preventDefault();try{await saveDetail();$('detail').close();notify('Kitap bilgileri kaydedildi.')}catch(e){notify(e.message||'Kaydedilemedi; değişikliklerin hâlâ açık.')}};
document.querySelector('#detail .close').onclick=()=>$('detail').close();$('read-book').onclick=()=>{if($('edit').reportValidity())readBook()};
$('cover-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{selected.cover=await resizedCover(file);$('detail-cover').src=selected.cover;notify('Yeni kapak seçildi. Kaydet ile uygula.')}catch{notify('Bu görsel açılamadı. PNG, JPEG veya WebP seç.')}e.target.value=''};
$('delete').onclick=()=>$('confirm').showModal();$('cancel-delete').onclick=()=>$('confirm').close();$('confirm-delete').onclick=async()=>{try{await cloud.commit('delete',selected.id);$('confirm').close();$('detail').close();selected=null;await refresh();notify('Kitap silindi.')}catch{notify('Kitap silinemedi.')}};
$('backup').onclick=backup;$('restore').onclick=()=>$('backup-file').click();$('backup-file').onchange=e=>{if(e.target.files[0])restore(e.target.files[0])};
$('analysis-tab').onclick=()=>{view='analysis';manualMode=false;document.querySelectorAll('[data-shelf]').forEach(b=>b.classList.remove('active'));$('analysis-tab').classList.add('active');render();backfillEpubPages();};$('finished-month').onchange=renderFinishedMonth;$('finished-year').onchange=()=>{const year=$('finished-year').value;if(![...$('analysis-year').options].some(o=>o.value===year))$('analysis-year').add(new Option(year,year));$('analysis-year').value=year;renderAnalysis();};$('analysis-year').onchange=$('chart-metric').onchange=$('analysis-mode').onchange=renderAnalysis;
async function continueFeaturedBook(){
 const b=currentReadingBook(books,preferences.featuredBookId);if(!b)return notify('Önce bir kitap seç.');if(b.format==='Manuel')return notify('Bu kayıtta okunabilir kitap dosyası yok.');
 try{if($('reading-picker').open)$('reading-picker').close();await openDetail(b.id);await readBook();}catch(e){console.error(e);notify('Kitap açılamadı.');}
}
$('current-read-now').onclick=$('reading-current-read').onclick=continueFeaturedBook;
$('current-reading').onclick=openReadingPicker;
$('close-reading-picker').onclick=()=>$('reading-picker').close();
$('reading-clear').onclick=async()=>{try{await savePreferences({featuredBookId:''});$('reading-picker').close()}catch{notify('Kitap seçimi kaydedilemedi.')}};
$('settings').onclick=()=>{if(!db)return notify('Kitaplık hazırlanıyor.');renderThemeOptions();showSettingsTab('design');$('settings-dialog').showModal()};
$('close-settings').onclick=()=>$('settings-dialog').close();
$('theme-upload').onclick=()=>$('theme-file').click();
$('theme-file').onchange=e=>{if(e.target.files[0])importTheme(e.target.files[0])};
$('theme-template').onclick=downloadThemeTemplate;
$('quote-display').onclick=()=>{$('quote-input').value=preferences.quote;$('quote-form').hidden=false;$('quote-display').hidden=true;$('quote-input').focus()};
$('quote-cancel').onclick=()=>{$('quote-form').hidden=true;$('quote-display').hidden=false};
$('quote-form').onsubmit=async e=>{e.preventDefault();$('quote-save').disabled=true;try{await savePreferences({quote:$('quote-input').value.trim()});$('quote-form').hidden=true;$('quote-display').hidden=false;notify('Alıntın kaydedildi.')}catch{notify('Alıntı kaydedilemedi; yazdığın metin korundu.')}finally{$('quote-save').disabled=false}};
for(const id of ['started','ended'])bindDateInput($(id));
$('date').textContent=new Intl.DateTimeFormat('tr',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
let drags=0;document.addEventListener('dragenter',e=>{if([...e.dataTransfer.types].includes('Files')&&!draggedBookId){e.preventDefault();drags++;$('drop-overlay').hidden=false}});document.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('Files')&&!draggedBookId)e.preventDefault()});document.addEventListener('dragleave',()=>{if(--drags<=0){drags=0;$('drop-overlay').hidden=true}});document.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();drags=0;$('drop-overlay').hidden=true;if(!$('reader').open&&!$('detail').open&&!$('add-dialog').open&&!$('settings-dialog').open&&!$('reading-picker').open)importFiles(e.dataTransfer.files).catch(()=>notify('Dosyalar kaydedilemedi.'))});
async function init(){try{db=await cloud.start();preferences=cleanPreferences(await request(db.transaction('preferences').objectStore('preferences').get('settings')));await refresh();cloud.onChange=async()=>{preferences=cleanPreferences(await request(db.transaction('preferences').objectStore('preferences').get('settings')));await refresh();};if(document.modelContext?.registerTool){document.modelContext.registerTool({name:'list_books',description:'Kişisel kitaplıktaki kitapları ve okuma durumlarını listeler.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>books.map(({id,title,author,status,rating})=>({id,title,author,status,rating}))});document.modelContext.registerTool({name:'set_reading_status',description:'Bir kitabın okuma durumunu değiştirir ve kaydeder.',inputSchema:{type:'object',properties:{id:{type:'string'},status:{type:'string',enum:['want','reading','read']}},required:['id','status'],additionalProperties:false},execute:async input=>{if(!input||!statuses[input.status])throw Error('Geçersiz durum');const b=books.find(x=>x.id===input.id);if(!b)throw Error('Kitap bulunamadı');await storeRecord({...b,status:input.status});await refresh();return {id:b.id,status:input.status}}})}}catch(e){console.error(e);notify('Tarayıcı depolaması açılamadı. Normal bir tarayıcı penceresinde tekrar dene.',true);$('add').disabled=true;$('empty-add').disabled=true}}
$('offline-book').onclick=async()=>{if(!selected)return;$('offline-book').disabled=true;try{await cloud.ensureFile(selected);$('offline-book').textContent='Çevrimdışı hazır';notify('Kitap bu cihaza indirildi. Bağlantı yokken de okuyabilirsin.');}catch{notify('Dosya indirilemedi. Sunucu bağlantısını kontrol et.');}finally{$('offline-book').disabled=false;}};
init();
