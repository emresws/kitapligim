import {build} from 'esbuild';import {mkdir,cp,copyFile,readFile,writeFile} from 'node:fs/promises';
const local=process.argv.includes('--local');const out=local?'dist-local':'dist';
await mkdir(out,{recursive:true});
await cp('web',out,{recursive:true});
if(local){const html=(await readFile(out+'/index.html','utf8')).replace('Kitapların kişisel hesabında, sunucunda saklanır.','Dosyaların bu cihazda kalır.');await writeFile(out+'/index.html',html);}
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',target:'es2022',outfile:out+'/app.js',define:{__KITAPLIK_LOCAL__:String(local)},minify:true,legalComments:'eof'});
for(const folder of ['cmaps','standard_fonts','wasm'])await cp('node_modules/pdfjs-dist/'+folder,out+'/pdf-assets/'+folder,{recursive:true});
await copyFile('node_modules/pdfjs-dist/web/pdf_viewer.css',out+'/pdf_viewer.css');await cp('node_modules/pdfjs-dist/web/images',out+'/images',{recursive:true});await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',out+'/pdf.worker.mjs');
let notices='Kitaplığım okuyucu bileşenleri\n';for(const [name,file]of [['PDF.js','pdfjs-dist/LICENSE'],['EPUB.js','epubjs/license'],['foliate-js','foliate-js/LICENSE'],['JSZip','jszip/LICENSE.markdown'],['noble-hashes','@noble/hashes/LICENSE']])notices+='\n\n'+name+'\n'+await readFile('node_modules/'+file,'utf8');await writeFile(out+'/OKUYUCU-LISANSLARI.txt',notices);console.log('Library built with readers and reading-time analytics.');
