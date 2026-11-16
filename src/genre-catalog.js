import {mainGenres} from './library-order.js';
export const genreLabel=value=>typeof value==='string'?value.normalize('NFC').trim().replace(/\s+/g,' '):'';
export const genreId=value=>genreLabel(value).toLocaleLowerCase('tr');
export function cleanGenreCatalog(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const unique=items=>[...new Map((Array.isArray(items)?items:[]).map(genreLabel).filter(s=>s&&s.length<=120).map(s=>[genreId(s),s])).values()].slice(0,2000);
 return {added:unique(value.added),removed:unique(value.removed)};
}
export function availableGenres(books,catalog){
 const hidden=new Set((catalog?.removed||[]).map(genreId)),result=new Map();
 for(const value of [...mainGenres,...(catalog?.added||[]),...books.map(b=>b.genre)]){
  const label=genreLabel(value),id=genreId(label);
  if(id&&!hidden.has(id)&&!result.has(id))result.set(id,label);
 }
 return [...result.values()].sort((a,b)=>a.localeCompare(b,'tr'));
}
export const effectiveGenre=(value,labels)=>labels.get(genreId(value))||'';
