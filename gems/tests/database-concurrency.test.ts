import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {Store} from '../packages/database';
import {DatabaseSync} from 'node:sqlite';
const wasm=path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture(t:any){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-concurrency-'));const stores:Store[]=[];t.after(()=>{for(const store of stores)try{store.close();}catch{}assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-concurrency-'));fs.rmSync(root,{recursive:true});});const first=await Store.open(root,wasm);stores.push(first);first.put('settings','main',{value:'初始记录'});return{root,first,stores,file:path.join(root,'gems.sqlite')};}
test('另一实例提交后旧实例不能覆盖其数据库记录',async t=>{const f=await fixture(t),second=await Store.open(f.root,wasm);f.stores.push(second);second.put('settings','main',{value:'另一实例提交'});const before=fs.readFileSync(f.file);assert.throws(()=>f.first.put('settings','main',{value:'旧状态覆盖'}),/数据库.*更改/);assert.deepEqual(fs.readFileSync(f.file),before);assert.deepEqual(f.first.get('settings','main'),{value:'初始记录'});});
test('删除数据库后旧实例不能悄悄重新创建',async t=>{const f=await fixture(t);fs.unlinkSync(f.file);assert.throws(()=>f.first.put('settings','main',{value:'不应写入'}),/数据库.*更改/);assert.equal(fs.existsSync(f.file),false);});
for(const suffix of ['-wal','-journal','-shm'])test('发现外部 SQLite '+suffix+' 文件时保留并拒绝保存',async t=>{const f=await fixture(t),sidecar=f.file+suffix;fs.writeFileSync(sidecar,'未确认的外部日志');const before=fs.readFileSync(f.file);assert.throws(()=>f.first.put('settings','main',{value:'不能保存'}),/数据库.*日志/);assert.deepEqual(fs.readFileSync(f.file),before);assert.equal(fs.readFileSync(sidecar,'utf8'),'未确认的外部日志');await assert.rejects(Store.open(f.root,wasm),/数据库.*日志/);});
test('临时副本完成后、重命名前再次检查外部修改并清理临时文件',async t=>{
  const f=await fixture(t),copy=await Store.open(f.root,wasm);copy.put('settings','main',{value:'外部副本'});const external=fs.readFileSync(f.file);copy.close();
  // 恢复自己的已知基线；在 fsync 真正完成之后注入另一进程替换的相同效果。
  const baseline=f.first.db.export();fs.writeFileSync(f.file,baseline);const sync=fs.fsyncSync;let changed=false;
  fs.fsyncSync=((fd:number)=>{sync(fd);if(!changed){changed=true;fs.writeFileSync(f.file,external);}}) as typeof fs.fsyncSync;
  try{assert.throws(()=>f.first.put('settings','main',{value:'不应覆盖'}),/数据库.*更改|提交前目标发生变化/);assert.deepEqual(fs.readFileSync(f.file),external);assert.equal(fs.readdirSync(f.root).some(name=>name.includes('.gems-')),false);}finally{fs.fsyncSync=sync;}
});
test('真正外部 SQLite WAL 未结束时拒绝打开且原库和 WAL 不变',async t=>{
  const f=await fixture(t),native=new DatabaseSync(f.file);try{
    native.exec('PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;');native.prepare('INSERT INTO documents VALUES(?,?,?)').run('external','wal',JSON.stringify({value:'真实外部提交'}));
    const original=fs.readFileSync(f.file),wal=fs.readFileSync(f.file+'-wal');assert.ok(wal.length>0);
    await assert.rejects(Store.open(f.root,wasm),/数据库.*日志/);assert.throws(()=>f.first.put('settings','main',{value:'不能覆盖 WAL'}),/数据库.*日志/);
    assert.deepEqual(fs.readFileSync(f.file),original);assert.deepEqual(fs.readFileSync(f.file+'-wal'),wal);
  }finally{native.close();}
});
test('关闭时保存被拒绝也释放 WASM，失败文件日志不伪造数据库记录',async t=>{
  const f=await fixture(t);fs.writeFileSync(f.file+'-journal','保护的日志');const before=fs.readFileSync(f.file);
  assert.throws(()=>f.first.close(),/数据库.*日志/);assert.throws(()=>f.first.get('settings','main'));
  f.first.logFailure('退出','保存已拒绝');assert.deepEqual(fs.readFileSync(f.file),before);assert.match(fs.readFileSync(path.join(f.root,'operations.jsonl'),'utf8'),/仅文件日志/);
  const protectedFile=path.join(f.root,'protected.txt'),log=path.join(f.root,'operations.jsonl');fs.writeFileSync(protectedFile,'不应更改');fs.unlinkSync(log);fs.linkSync(protectedFile,log);
  assert.throws(()=>f.first.logFailure('退出','不允许追加'),/硬链接/);assert.equal(fs.readFileSync(protectedFile,'utf8'),'不应更改');
});
test('提交复核读取期间原地改写，不能用刚读到的旧内容哈希放行',async t=>{
  const f=await fixture(t),copy=await Store.open(f.root,wasm);copy.put('settings','main',{value:'复核期间外部替换'});const external=fs.readFileSync(f.file);copy.close();fs.writeFileSync(f.file,f.first.db.export());
  const read=fs.readSync,databaseIdentity=fs.statSync(f.file,{bigint:true});let hashes=0,changed=false;
  fs.readSync=((fd:any,buffer:any,...args:any[])=>{const count=(read as any)(fd,buffer,...args);const identity=fs.fstatSync(fd,{bigint:true});if(identity.dev===databaseIdentity.dev&&identity.ino===databaseIdentity.ino&&buffer.length===64*1024&&count>0&&++hashes===2){fs.writeFileSync(f.file,external);changed=true;}return count;}) as typeof fs.readSync;
  try{assert.throws(()=>f.first.put('settings','main',{value:'不应覆盖'}),/数据库.*更改/);assert.equal(changed,true);assert.deepEqual(fs.readFileSync(f.file),external);}finally{fs.readSync=read;}
});
