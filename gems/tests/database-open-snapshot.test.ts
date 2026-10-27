import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Store} from '../packages/database';import {readDatabase} from '../packages/database/validation';import {noLinks} from '../packages/core/security';
const wasm=path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-open-')),file=path.join(root,'gems.sqlite');const first=await Store.open(root,wasm);first.put('settings','main',{value:'old'});first.close();const baseline=fs.readFileSync(file);const second=await Store.open(root,wasm);second.put('settings','main',{value:'new'});second.close();const external=fs.readFileSync(file);assert.equal(external.length,baseline.length);assert.notDeepEqual(external,baseline);fs.writeFileSync(file,baseline);return{root,file,baseline,external,cleanup(){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-open-'));noLinks(path.parse(root).root,root);fs.rmSync(root,{recursive:true});}};}
async function duringInit(f:Awaited<ReturnType<typeof fixture>>,mutate:()=>void){
 const open=fs.openSync,close=fs.closeSync;let target:number|undefined,scheduled=false,opened:Store|undefined;
 try{
  fs.openSync=((file,...args)=>{const fd=(open as any)(file,...args);if(path.resolve(String(file))===f.file&&args[0]==='r')target=fd;return fd;}) as typeof fs.openSync;
  fs.closeSync=((fd:number)=>{close(fd);if(fd===target&&!scheduled){scheduled=true;queueMicrotask(mutate);}}) as typeof fs.closeSync;
  await assert.rejects(Store.open(f.root,wasm).then(store=>{opened=store;return store;}),/数据库.*更改|数据库.*日志|独立普通文件/);assert.equal(scheduled,true);
 }finally{fs.openSync=open;fs.closeSync=close;opened?.db.close();}
}
test('稳定真实SQLite只读打开返回实际记录，不改原库',async()=>{const f=await fixture();let store:Store|undefined;try{assert.deepEqual(Buffer.from(readDatabase(f.file)),f.baseline);store=await Store.open(f.root,wasm);assert.deepEqual(store.get('settings','main'),{value:'old'});assert.deepEqual(fs.readFileSync(f.file),f.baseline);}finally{store?.db.close();f.cleanup();}});
test('数据库读取后同长度原地改写必须拒绝，而非返回旧快照',async()=>{
 const f=await fixture(),read=fs.readSync;let changed=false;
 try{fs.readSync=((fd,buffer,...args)=>{const result=(read as any)(fd,buffer,...args);if(!changed&&buffer.byteLength===f.baseline.length&&result>0){changed=true;fs.writeFileSync(f.file,f.external);}return result;}) as typeof fs.readSync;assert.throws(()=>readDatabase(f.file),/数据库.*变化/);assert.equal(changed,true);assert.deepEqual(fs.readFileSync(f.file),f.external);}finally{fs.readSync=read;f.cleanup();}
});
test('数据库同长度改写即使时间戳不变也必须按真实字节拒绝',async()=>{
 const f=await fixture(),read=fs.readSync,open=fs.openSync,fstat=fs.fstatSync,lstat=fs.lstatSync;
 const stamp=fs.statSync(f.file,{bigint:true}),lstatDescriptor=Object.getOwnPropertyDescriptor(fs,'lstatSync')!;let target:number|undefined,changed=false;
 try{
  fs.openSync=((file,...args)=>{const fd=(open as any)(file,...args);if(path.resolve(String(file))===f.file&&args[0]==='r')target=fd;return fd;}) as typeof fs.openSync;
  fs.fstatSync=((fd,...args)=>{const stat=(fstat as any)(fd,...args);if(fd===target){stat.mtimeNs=stamp.mtimeNs;stat.ctimeNs=stamp.ctimeNs;}return stat;}) as typeof fs.fstatSync;
  Object.defineProperty(fs,'lstatSync',{...lstatDescriptor,value:((file,...args)=>{const stat=(lstat as any)(file,...args);if(path.resolve(String(file))===f.file){stat.mtimeNs=stamp.mtimeNs;stat.ctimeNs=stamp.ctimeNs;}return stat;}) as typeof fs.lstatSync});
  fs.readSync=((fd,buffer,...args)=>{const count=(read as any)(fd,buffer,...args);if(fd===target&&!changed&&buffer.byteLength===f.baseline.length&&count>0){changed=true;fs.writeFileSync(f.file,f.external);}return count;}) as typeof fs.readSync;
  assert.throws(()=>readDatabase(f.file),/数据库.*变化/);
  assert.equal(changed,true);assert.deepEqual(fs.readFileSync(f.file),f.external);
 }finally{fs.readSync=read;fs.openSync=open;fs.fstatSync=fstat;Object.defineProperty(fs,'lstatSync',lstatDescriptor);f.cleanup();}
});
test('数据库读取后路径替换即使大小相同也拒绝，旧新文件保留',async()=>{
 const f=await fixture(),read=fs.readSync,moved=f.file+'.old';let changed=false;
 try{fs.readSync=((fd,buffer,...args)=>{const result=(read as any)(fd,buffer,...args);if(!changed&&buffer.byteLength===f.baseline.length&&result>0){changed=true;fs.renameSync(f.file,moved);fs.writeFileSync(f.file,f.external);}return result;}) as typeof fs.readSync;assert.throws(()=>readDatabase(f.file),/数据库.*变化/);assert.deepEqual(fs.readFileSync(f.file),f.external);assert.deepEqual(fs.readFileSync(moved),f.baseline);}finally{fs.readSync=read;f.cleanup();}
});
test('已有数据库硬链接拒绝，两个路径原字节均保留',async()=>{const f=await fixture(),alias=path.join(f.root,'alias.sqlite');try{fs.linkSync(f.file,alias);await assert.rejects(Store.open(f.root,wasm),/独立普通文件/);assert.deepEqual(fs.readFileSync(f.file),f.baseline);assert.deepEqual(fs.readFileSync(alias),f.baseline);}finally{fs.unlinkSync(alias);f.cleanup();}});
test('SQL运行时初始化期间真实外部改写必须拒绝，外部新记录保留',async()=>{const f=await fixture();try{await duringInit(f,()=>fs.writeFileSync(f.file,f.external));assert.deepEqual(fs.readFileSync(f.file),f.external);}finally{f.cleanup();}});
test('SQL运行时初始化期间出现日志文件必须拒绝，不删除或回写',async()=>{const f=await fixture(),wal=f.file+'-wal';try{await duringInit(f,()=>fs.writeFileSync(wal,'unconfirmed external journal'));assert.deepEqual(fs.readFileSync(f.file),f.baseline);assert.equal(fs.readFileSync(wal,'utf8'),'unconfirmed external journal');}finally{f.cleanup();}});
test('SQL运行时初始化期间删除数据库必须拒绝，不重建原库',async()=>{const f=await fixture();try{await duringInit(f,()=>fs.unlinkSync(f.file));assert.equal(fs.existsSync(f.file),false);}finally{f.cleanup();}});
test('SQL运行时初始化期间新增数据库硬链接必须拒绝',async()=>{const f=await fixture(),alias=path.join(f.root,'alias.sqlite');try{await duringInit(f,()=>fs.linkSync(f.file,alias));assert.deepEqual(fs.readFileSync(f.file),f.baseline);assert.deepEqual(fs.readFileSync(alias),f.baseline);}finally{if(fs.existsSync(alias))fs.unlinkSync(alias);f.cleanup();}});
