export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.valueOf())&&d.toISOString().slice(0,10)===value}
const positivePages=value=>{const n=Number(value);return Number.isInteger(n)&&n>0?n:0};
export const originalPageCount=book=>positivePages(book.pages);
export const pageOverride=book=>positivePages(book.pagesOverride);
export const pageCount=book=>pageOverride(book)||originalPageCount(book);
export function finishedInMonth(books,year,month,now=new Date()){
 const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const prefix=year+'-'+String(month).padStart(2,'0')+'-';
 return books.filter(b=>b.status==='read'&&validDate(b.ended)&&b.ended.startsWith(prefix)&&b.ended<=today)
  .sort((a,b)=>b.ended.localeCompare(a.ended)||(b.added||0)-(a.added||0)||a.title.localeCompare(b.title,'tr'));
}
export function readingStats(books,year,now=new Date()){
 const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
 const completed=books.filter(b=>b.status==='read');const dated=completed.filter(b=>validDate(b.ended)&&b.ended<=today);
 const current=dated.filter(b=>b.ended.startsWith(today.slice(0,7)));
 const annual=dated.filter(b=>Number(b.ended.slice(0,4))===year);
 const sum=list=>list.reduce((s,b)=>s+pageCount(b),0);
 const elapsedYear=year===now.getFullYear()?Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(year,0,1))/86400000)+1:year<now.getFullYear()?(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000:0;
 const months=Array.from({length:12},(_,month)=>{const list=annual.filter(b=>Number(b.ended.slice(5,7))===month+1);return {month,books:list.length,pages:sum(list)}});
 const genres=new Map();for(const b of annual){const key=b.genre?.trim()||'Tür belirtilmemiş';genres.set(key,(genres.get(key)||0)+1)}
 return {month:{books:current.length,pages:sum(current),average:sum(current)/now.getDate(),unknown:current.filter(b=>!pageCount(b)).length,estimated:current.filter(b=>!pageOverride(b)&&b.pagesSource==='estimated').length},year:{books:annual.length,pages:sum(annual),average:elapsedYear?sum(annual)/elapsedYear:0,unknown:annual.filter(b=>!pageCount(b)).length,estimated:annual.filter(b=>!pageOverride(b)&&b.pagesSource==='estimated').length},months,genres:[...genres].sort((a,b)=>b[1]-a[1]),undated:completed.filter(b=>!validDate(b.ended)).length,future:completed.filter(b=>validDate(b.ended)&&b.ended>today).length,years:[...new Set([now.getFullYear(),...dated.map(b=>Number(b.ended.slice(0,4)))])].sort((a,b)=>b-a)};
}
