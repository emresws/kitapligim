import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {sha256Fallback,fileId,randomId} from '../src/identity.js';
test('HTTP fallback SHA-256 matches known digest and block/padding boundaries',()=>{
 assert.equal(sha256Fallback(new TextEncoder().encode('abc')),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 for(const n of [0,1,55,56,63,64,65,119,120,127,128,1024,1000000]){const b=Uint8Array.from({length:n},(_,i)=>i%251);assert.equal(sha256Fallback(b),createHash('sha256').update(b).digest('hex'));}
});
test('PDF/manual identities and operation ids work without subtle or randomUUID',async()=>{
 const before=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 Object.defineProperty(globalThis,'crypto',{value:{getRandomValues:webcrypto.getRandomValues.bind(webcrypto)},configurable:true});
 try{const bytes=new TextEncoder().encode('%PDF-1.4\nHTTP test');assert.equal(await fileId(bytes),createHash('sha256').update(bytes).digest('hex'));const id=randomId();assert.match(id,/^[a-f0-9]{32}$/);assert.notEqual(id,randomId());assert.match(await fileId(new TextEncoder().encode(id)),/^[a-f0-9]{64}$/);}finally{Object.defineProperty(globalThis,'crypto',before);}
});
