// Calendar boundaries use the reader device's local timezone, including DST.
export function localDay(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function splitReadingInterval(start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const parts=[];let cursor=start;
 while(cursor<end){const d=new Date(cursor),midnight=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1).getTime(),limit=Math.min(end,midnight);if(limit<=cursor)break;parts.push({day:localDay(cursor),milliseconds:limit-cursor});cursor=limit;}
 return parts;
}
export function validTimeChunk(row){return !!row&&typeof row.bookId==='string'&&/^[a-f0-9]{64}$/.test(row.bookId)&&/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&localDay(new Date(row.day+'T12:00:00').getTime())===row.day&&Number.isSafeInteger(row.milliseconds)&&row.milliseconds>0&&row.milliseconds<=172800000;}
export function timeRowId(bookId,day){return bookId+'|'+day;}
export function aggregateTime(rows,year,now=new Date()){
 const today=localDay(now.getTime()),month=today.slice(0,7),thisYear=now.getFullYear();const days=year<thisYear?(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000:year===thisYear?Math.floor((Date.UTC(thisYear,now.getMonth(),now.getDate())-Date.UTC(year,0,1))/86400000)+1:0;
 const usable=rows.filter(r=>validTimeChunk(r)&&r.day<=today),annual=usable.filter(r=>r.day.startsWith(year+'-')),current=usable.filter(r=>r.day.startsWith(month));
 const summary=(list,elapsed)=>({milliseconds:list.reduce((s,r)=>s+r.milliseconds,0),days:new Set(list.map(r=>r.day)).size,books:new Set(list.map(r=>r.bookId)).size,average:elapsed?list.reduce((s,r)=>s+r.milliseconds,0)/elapsed:0});
 const months=Array.from({length:12},(_,i)=>({month:i,...summary(annual.filter(r=>Number(r.day.slice(5,7))===i+1),new Date(year,i+1,0).getDate())}));
 return {month:summary(current,now.getDate()),year:summary(annual,days),months,annual,years:[...new Set([thisYear,...usable.map(r=>Number(r.day.slice(0,4)))])].sort((a,b)=>b-a)};
}
export function formatReadingTime(ms){const minutes=Math.floor(Math.max(0,ms)/60000),hours=Math.floor(minutes/60);return hours?`${hours} sa ${minutes%60} dk`:minutes?`${minutes} dk`:ms>0?'1 dk altı':'0 dk';}
export class ReadingClock{
 constructor({write,isVisible=()=>document.visibilityState==='visible'&&document.hasFocus(),wall=()=>Date.now(),monotonic=()=>performance.now(),newId=()=>{const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('')}}){Object.assign(this,{write,isVisible,wall,monotonic,newId});this.bookId=null;this.visible=false;this.queue=Promise.resolve();this.residual=0;}
 start(bookId){this.stop();this.bookId=bookId;this.lastWall=this.wall();this.lastMono=this.monotonic();this.visible=this.isVisible();}
 tick(){if(!this.bookId)return;const wall=this.wall(),mono=this.monotonic(),delta=mono-this.lastMono;
  // Never count a suspended browser's long timer gap as reading.
  if(this.visible&&delta>0&&delta<=20000&&Math.abs((wall-this.lastWall)-delta)<2000){this.residual+=delta;const whole=Math.floor(this.residual);this.residual-=whole;const start=this.lastWall;for(const part of splitReadingInterval(start,start+whole)){const event={...part,bookId:this.bookId,opId:this.newId()};this.queue=this.queue.catch(()=>{}).then(()=>this.write(event));}}
  this.lastWall=wall;this.lastMono=mono;this.visible=this.isVisible();return this.queue;
 }
 visibilityChanged(){const saved=this.tick();this.visible=this.isVisible();return saved;}
 stop(){this.tick();this.bookId=null;this.visible=false;return this.queue;}
 flush(){this.tick();return this.queue;}
}
