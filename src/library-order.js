export const mainGenres=['Roman','Klasikler','İngilizce Kitaplar','Almanca Kitaplar','Bilimkurgu / Fantastik','Polisiye / Gerilim','Öykü / Şiir','Tarih / Biyografi','Felsefe / Düşünce','Din / İnanç','Bilim / Mühendislik','Psikoloji / Kişisel Gelişim'];
export function compareLibrary(a,b){const rank=x=>Number.isFinite(x.orderRank)&&x.orderRank>=0?x.orderRank:Infinity;const ar=rank(a),br=rank(b);return (ar===br?0:ar-br)||(a.added||0)-(b.added||0)||String(a.id).localeCompare(String(b.id));}
export function compareGenre(a,b){const ag=genreKey(a),bg=genreKey(b);if(!ag&&bg)return 1;if(ag&&!bg)return -1;return ag.localeCompare(bg,'tr')||compareAuthor(a,b);}
export function reorderedBooks(books,movingId,targetId,after=false){if(movingId===targetId)return [...books].sort(compareLibrary);const sorted=[...books].sort(compareLibrary);const moving=sorted.find(b=>b.id===movingId);if(!moving||!sorted.some(b=>b.id===targetId))throw Error('Kitap bulunamadı.');const result=sorted.filter(b=>b.id!==movingId);const index=result.findIndex(b=>b.id===targetId);result.splice(index+(after?1:0),0,moving);return result.map((b,orderRank)=>({...b,orderRank}));}
const collation=new Intl.Collator('tr',{sensitivity:'base',numeric:true});
export function authorKey(book){return String(book.author||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('tr');}
export function genreKey(book){return String(book.genre||'').trim();}
export function compareAuthorName(a,b){const ak=authorKey(a),bk=authorKey(b);if(!ak&&bk)return 1;if(ak&&!bk)return -1;return collation.compare(ak,bk)||ak.localeCompare(bk,'tr');}
export function compareAuthorBooks(a,b){const rank=b=>Number.isFinite(b.authorBookRank)&&b.authorBookRank>=0?b.authorBookRank:Infinity;const ar=rank(a),br=rank(b);return (ar===br?0:ar-br)||collation.compare(a.title||'',b.title||'')||String(a.id).localeCompare(String(b.id));}
export function compareAuthor(a,b){return compareAuthorName(a,b)||compareAuthorBooks(a,b);}
export function canReorderBooks(a,b,sort){return !!a&&!!b&&['author','genre'].includes(sort)&&authorKey(a)===authorKey(b)&&(sort!=='genre'||genreKey(a)===genreKey(b));}
export function reorderAuthorBooks(books,movingId,targetId,after=false,sort='genre'){
 const moving=books.find(b=>b.id===movingId),target=books.find(b=>b.id===targetId);
 if(!canReorderBooks(moving,target,sort))throw Error('Aynı yazara ait kitapları kendi aralarında sırala.');
 const group=books.filter(b=>authorKey(b)===authorKey(moving)).sort(compareAuthorBooks);
 if(movingId===targetId)return group;
 const ordered=group.filter(b=>b.id!==movingId),index=ordered.findIndex(b=>b.id===targetId);ordered.splice(index+(after?1:0),0,moving);
 return ordered.map((b,authorBookRank)=>({...b,authorBookRank}));
}
