import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PROFILE_IMPORT_BYTES} from '../packages/profiles';
import {profileFixture} from './profile-fixture';

function document(count=629,chinese=false){return{format:'gems-profile',version:1,name:'capacity',mods:Array.from({length:count},(_,i)=>({modId:'mod-'+i,name:chinese?'中'.repeat(83)+'A':'A'.repeat(250),version:'1',fingerprint:'a'.repeat(64)}))};}
function atPrettyBytes(bytes:number,chinese:boolean){
 const raw=document(629,chinese);let delta=bytes-Buffer.byteLength(JSON.stringify(raw,null,2));
 for(const ref of raw.mods){if(delta===0)break;if(delta>0){const add=Math.min(delta,300-ref.name.length);ref.name+='B'.repeat(add);delta-=add;}else{const remove=Math.min(-delta,chinese?1:ref.name.length-1);ref.name=ref.name.slice(0,-remove);delta+=remove;}}
 assert.equal(delta,0);assert.equal(Buffer.byteLength(JSON.stringify(raw,null,2)),bytes);return raw;
}

test('合法629引用紧凑输入可导出再导入且不改变已有保存状态',async t=>{
 const f=await profileFixture(t),raw=document(),input=JSON.stringify(raw);assert.equal(Buffer.byteLength(input),235829);assert.equal(Buffer.byteLength(JSON.stringify(raw,null,2)),262267);
 const saved=f.profiles.importProfile(input,f.game),before=JSON.stringify(f.store.list('profile')),output=f.profiles.exportProfile(saved.id);
 t.diagnostic(JSON.stringify({inputBytes:Buffer.byteLength(input),outputBytes:Buffer.byteLength(output),limit:MAX_PROFILE_IMPORT_BYTES,refs:raw.mods.length}));
 assert.equal(JSON.stringify(f.store.list('profile')),before);assert.ok(Buffer.byteLength(output)<=MAX_PROFILE_IMPORT_BYTES,'合法保存方案导出超过自身256KiB导入上限');
 const again=f.profiles.importProfile(output,f.game);assert.deepEqual(again.mods,saved.mods);assert.equal(again.name,saved.name);assert.deepEqual(f.store.get('profile',saved.id),saved);assert.equal(f.store.list('transaction').length,0);assert.equal(f.read('mods/private.ini'),'user unowned');
});
for(const chinese of [false,true])for(const extra of [0,1])test(`${chinese?'中文UTF8':'ASCII'}美化输出在256KiB${extra?'+1':'精确'}边界仍能完整往返`,async t=>{
 const f=await profileFixture(t),raw=atPrettyBytes(MAX_PROFILE_IMPORT_BYTES+extra,chinese),input=JSON.stringify(raw),saved=f.profiles.importProfile(input,f.game),before=JSON.stringify(f.store.list('profile'));
 const output=f.profiles.exportProfile(saved.id);t.diagnostic(JSON.stringify({chinese,inputBytes:Buffer.byteLength(input),inputCharacters:input.length,prettyBytes:MAX_PROFILE_IMPORT_BYTES+extra,exportBytes:Buffer.byteLength(output)}));assert.equal(JSON.stringify(f.store.list('profile')),before);assert.ok(Buffer.byteLength(output)<=MAX_PROFILE_IMPORT_BYTES);assert.deepEqual(JSON.parse(output),raw);
 assert.deepEqual(f.profiles.importProfile(output,f.game).mods,saved.mods);assert.deepEqual(f.store.get('profile',saved.id),saved);
});
test('中文UTF8按字节严格接纳256KiB，超过一字节时保留已有保存记录',async t=>{
 const f=await profileFixture(t),raw=document(1,true),compact=JSON.stringify(raw),exact=compact+' '.repeat(MAX_PROFILE_IMPORT_BYTES-Buffer.byteLength(compact));assert.equal(Buffer.byteLength(exact),MAX_PROFILE_IMPORT_BYTES);assert.ok(exact.length<MAX_PROFILE_IMPORT_BYTES);
 const saved=f.profiles.importProfile(exact,f.game),before=JSON.stringify(f.store.list('profile'));assert.throws(()=>f.profiles.importProfile(exact+' ',f.game),/256KiB/);assert.equal(JSON.stringify(f.store.list('profile')),before);assert.deepEqual(JSON.parse(f.profiles.exportProfile(saved.id)),raw);
});
for(const profileName of ['中'.repeat(118),'中'.repeat(119),'中'.repeat(120),'A'.repeat(116)+'😀中中'])test(`合法${profileName.length}单元${profileName.includes('😀')?'emoji边界':'中文'}方案可默认复制且不截断代理对`,async t=>{
 const f=await profileFixture(t),original=f.create(profileName,[]),before=structuredClone(original);const copy=f.profiles.copy(original.id);assert.notEqual(copy.id,original.id);assert.ok(copy.name.length<=120);assert.ok(copy.name.endsWith(' 副本'));assert.equal(Array.from(copy.name).some(char=>char.length===1&&char.charCodeAt(0)>=0xd800&&char.charCodeAt(0)<=0xdfff),false,'默认副本名出现孤立UTF16代理项');assert.deepEqual(copy.mods,original.mods);assert.deepEqual(f.store.get('profile',original.id),before);
 const state=JSON.stringify(f.store.list('profile'));assert.throws(()=>f.profiles.copy(original.id,'中'.repeat(121)),/120/);assert.equal(JSON.stringify(f.store.list('profile')),state);assert.equal(f.profiles.copy(original.id,'明确命名').name,'明确命名');
});
