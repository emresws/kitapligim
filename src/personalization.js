import {cleanGenreCatalog} from './genre-catalog.js';
import {validateTheme,builtInThemes} from './themes.js';
import {validDate} from './analytics.js';
export const defaultPreferences={id:'settings',quote:'Senin kitapların.\nSenin küçük dünyan.',featuredBookId:'',themeId:'forest',customTheme:null,genreCatalog:null};
export function parseTypedDate(value,label='Tarih'){const text=String(value||'').trim();if(!text)return '';const normal=/^\d{8}$/.test(text)?formatDateDigits(text):text.replace(/[\/]/g,'.');const m=/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(normal);const iso=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:text;if(!validDate(iso))throw Error(`${label}: GG.AA.YYYY biçiminde geçerli bir tarih gir. Örn. 06.10.2026`);return iso;}
export function displayTypedDate(value){return validDate(value)?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4):value||'';}
export function cleanPreferences(value){const p=value&&typeof value==='object'?value:{};let customTheme=null;try{if(p.customTheme)customTheme=validateTheme(p.customTheme)}catch{};const themeId=p.themeId==='custom'&&customTheme?'custom':builtInThemes.some(t=>t.id===p.themeId)?p.themeId:'forest';return {id:'settings',themeId,customTheme,genreCatalog:cleanGenreCatalog(p.genreCatalog),quote:typeof p.quote==='string'?p.quote.slice(0,1500):defaultPreferences.quote,featuredBookId:typeof p.featuredBookId==='string'&&(/^[a-f0-9]{64}$/.test(p.featuredBookId)||p.featuredBookId==='')?p.featuredBookId:''};}

export function formatDateDigits(value){const digits=String(value||'').replace(/\D/g,'').slice(0,8);return digits.slice(0,2)+(digits.length>2?'.'+digits.slice(2,4):'')+(digits.length>4?'.'+digits.slice(4):'');}
export function bindDateInput(input){
 input.addEventListener('input',()=>{const raw=input.value;if(/^\d{1,2}[.\/]\d{1,2}[.\/]\d{4}$/.test(raw)){try{input.value=displayTypedDate(parseTypedDate(raw));return}catch{}}if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){input.value=displayTypedDate(raw);return;}const caret=input.selectionStart??raw.length,count=raw.slice(0,caret).replace(/\D/g,'').length;input.value=formatDateDigits(raw);let position=0,seen=0;while(position<input.value.length&&seen<count){if(/\d/.test(input.value[position]))seen++;position++;}input.setSelectionRange(position,position);});
 input.addEventListener('keydown',e=>{const pos=input.selectionStart;if(input.selectionEnd!==pos)return;if(e.key==='Backspace'&&pos>0&&input.value[pos-1]==='.')input.setSelectionRange(pos-2,pos);else if(e.key==='Delete'&&input.value[pos]==='.')input.setSelectionRange(pos,pos+2);});
 input.addEventListener('blur',()=>{try{input.value=displayTypedDate(parseTypedDate(input.value));input.setCustomValidity('')}catch(e){input.setCustomValidity(e.message)}});
 input.addEventListener('input',()=>input.setCustomValidity(''));
}
