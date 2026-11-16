export const themeTokens={background:'--bg',sidebar:'--side',panel:'--panel',input:'--input',border:'--line',text:'--text',muted:'--muted',accent:'--gold',active:'--active'};
const palette=(background,sidebar,panel,input,border,text,muted,accent,active)=>({background,sidebar,panel,input,border,text,muted,accent,active});
export const builtInThemes=[
 {id:'forest',name:'Orman & Altın',colors:palette('#171c1b','#121715','#1e2422','#202724','#343d37','#ebece6','#a6b7ad','#d9b579','#29382c')},
 {id:'midnight',name:'Gece & Buz',colors:palette('#111827','#0c1220','#192235','#202b40','#36435b','#edf2fc','#a7b7d2','#94c9f5','#263b57')},
 {id:'plum',name:'Mürdüm & Gül',colors:palette('#211721','#160f18','#2b1e2c','#322436','#513d53','#f5edf4','#c9adca','#e6acd0','#443047')},
 {id:'coffee',name:'Kahve & Bakır',colors:palette('#211a17','#17120f','#2b221d','#322821','#514039','#f6ede4','#c4b0a2','#e4b486','#473225')},
 {id:'ocean',name:'Okyanus & Turkuaz',colors:palette('#111e23','#0c161a','#192a30','#20343b','#345159','#e8f3f3','#a3bec3','#83d8ca','#24434a')},
 {id:'arrakis',name:'Arrakis · Çöl Gezegeni',atmosphere:'arrakis',colors:palette('#1b1813','#12110e','#252019','#2d261d','#584735','#f3e8d2','#c6b392','#e2b773','#3b2e20')},
 {id:'graphite',name:'Grafit & Gümüş',colors:palette('#19191c','#111114','#242428','#2b2b30','#42424b','#f0f0f3','#b6b6c1','#d1d1e0','#38383f')}
];
function luminance(hex){const rgb=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
export function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function validateTheme(value){
 if(!value||value.format!=='kitapligim-theme'||value.version!==1||typeof value.name!=='string'||!value.name.trim()||value.name.length>60||!value.colors||typeof value.colors!=='object')throw Error('Kitaplığım tema şablonuna uygun bir JSON dosyası seç.');
 const colors={};for(const key of Object.keys(themeTokens)){const v=value.colors[key];if(typeof v!=='string'||!/^#[a-f\d]{6}$/i.test(v))throw Error(`${key} rengi #RRGGBB biçiminde olmalı.`);colors[key]=v.toLowerCase();}
 for(const key of ['background','sidebar','panel','input','active'])if(luminance(colors[key])>.09)throw Error('Arka plan, panel ve seçili alan renkleri koyu olmalı.');
 for(const surface of ['background','sidebar','panel','input','active'])for(const ink of ['text','muted','accent'])if(contrast(colors[ink],colors[surface])<4.5)throw Error(`${ink} ve ${surface} renklerinin kontrastı en az 4.5:1 olmalı.`);
 if(contrast(colors.accent,'#101410')<4.5)throw Error('Vurgu rengi üzerindeki koyu yazı okunabilir olmalı.');
 if(value.atmosphere!==undefined&&!['none','arrakis'].includes(value.atmosphere))throw Error('Görsel atmosfer none veya arrakis olmalı.');
 return {format:'kitapligim-theme',version:1,name:value.name.trim(),colors,...(value.atmosphere?{atmosphere:value.atmosphere}:{})};
}
export const themeTemplate={format:'kitapligim-theme',version:1,name:'Kitabımın Teması',colors:{...builtInThemes[0].colors}};
export function getTheme(preferences){return preferences.themeId==='custom'&&preferences.customTheme?{...preferences.customTheme,id:'custom'}:builtInThemes.find(t=>t.id===preferences.themeId)||builtInThemes[0];}
export function readingChoices(books){return books.filter(b=>b.status==='reading').sort((a,b)=>a.title.localeCompare(b.title,'tr'));}
export function currentReadingBook(books,id){return readingChoices(books).find(b=>b.id===id)||null;}
