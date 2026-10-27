import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Backup} from '../packages/backup';import {hashFile} from '../packages/core/security';
import {Store} from '../packages/database';import {Installer} from '../packages/installer';import {scan} from '../packages/scanner';
async function fixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-restore-stage-')),backup=new Backup(path.join(root,'backup')),source=path.join(root,'source.ini'),target=path.join(root,'target.ini');fs.writeFileSync(source,'verified backup');fs.writeFileSync(target,'user original');const hash=await backup.put(source),before=fs.readFileSync(target),expected=await hashFile(target);
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-restore-stage-'));fs.rmSync(root,{recursive:true});});return{root,backup,source,target,hash,before,expected};
}
test('恢复暂存已核验后在fsync阶段实际损坏，拒绝时原目标仍完整',async t=>{
 const f=await fixture(t),copy=fs.copyFileSync,sync=fs.fsyncSync;let temporary='',changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0])===f.backup.file(f.hash))temporary=String(args[1]);return result;}) as typeof fs.copyFileSync;
 fs.fsyncSync=((...args:any[])=>{if(temporary&&!changed){changed=true;fs.writeFileSync(temporary,'late corruption');}return(sync as any)(...args);}) as typeof fs.fsyncSync;
 try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected));}finally{fs.copyFileSync=copy;fs.fsyncSync=sync;}
 t.diagnostic(JSON.stringify({changed,target:fs.readFileSync(f.target,'utf8')}));assert.ok(changed);assert.deepEqual(fs.readFileSync(f.target),f.before);
});
for(const mode of ['replace','hardlink','same-content-replace'])test('最后核对目标时恢复暂存被实际替换，不能提交新文件：'+mode,async t=>{
 const f=await fixture(t),copy=fs.copyFileSync,open=fs.openSync;let temporary='',changed=false;const moved=path.join(f.root,'saved-stage.ini'),external=path.join(f.root,'external.ini');fs.writeFileSync(external,'verified backup');
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0])===f.backup.file(f.hash))temporary=String(args[1]);return result;}) as typeof fs.copyFileSync;
 fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.target&&temporary&&!changed){changed=true;fs.renameSync(temporary,moved);if(mode==='hardlink')fs.linkSync(external,temporary);else fs.writeFileSync(temporary,mode==='same-content-replace'?'verified backup':'late corruption');}return fd;}) as typeof fs.openSync;
 try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected));}finally{fs.copyFileSync=copy;fs.openSync=open;}
 t.diagnostic(JSON.stringify({mode,changed,target:fs.readFileSync(f.target,'utf8'),links:fs.statSync(f.target).nlink}));assert.ok(changed);assert.deepEqual(fs.readFileSync(f.target),f.before);assert.equal(fs.readFileSync(external,'utf8'),'verified backup');assert.equal(fs.readFileSync(moved,'utf8'),'verified backup');assert.ok(fs.existsSync(temporary),'保留其他操作替换的暂存，不擅自删除');
});
test('目标核对后同inode暂存内容/时间变化也不能提交，自有文件可清理',async t=>{
 const f=await fixture(t),copy=fs.copyFileSync,open=fs.openSync;let temporary='',changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0])===f.backup.file(f.hash))temporary=String(args[1]);return result;}) as typeof fs.copyFileSync;
 fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.target&&temporary&&!changed){changed=true;fs.writeFileSync(temporary,'corrupted data!');fs.utimesSync(temporary,new Date('2020-01-01'),new Date('2020-01-01'));}return fd;}) as typeof fs.openSync;
 try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected),/临时副本/);}finally{fs.copyFileSync=copy;fs.openSync=open;}
 assert.ok(changed);assert.deepEqual(fs.readFileSync(f.target),f.before);assert.equal(fs.existsSync(temporary),false);
});
test('暂存父目录实际换址或变junction后，不删除外部同名文件/外移暂存',async t=>{
 for(const mode of ['directory','junction']){
  const f=await fixture(t),directory=path.join(f.root,'game/mods'),moved=path.join(f.root,'game/moved'),outside=path.join(f.root,'outside');fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(outside);f.target=path.join(directory,'target.ini');fs.writeFileSync(f.target,f.before);
  const copy=fs.copyFileSync,open=fs.openSync,close=fs.closeSync;let temporary='',targetFd:number|undefined,changed=false,foreign='';
  fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0])===f.backup.file(f.hash))temporary=String(args[1]);return result;}) as typeof fs.copyFileSync;
  fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.target&&temporary)targetFd=fd;return fd;}) as typeof fs.openSync;
  fs.closeSync=((fd:number)=>{const result=close(fd);if(fd===targetFd&&!changed){changed=true;fs.renameSync(directory,moved);if(mode==='junction')fs.symlinkSync(outside,directory,'junction');else fs.mkdirSync(directory);const actual=mode==='junction'?outside:directory;fs.writeFileSync(path.join(actual,'target.ini'),'外部新目标');foreign=path.join(actual,path.basename(temporary));fs.writeFileSync(foreign,'外部同名暂存');}return result;}) as typeof fs.closeSync;
  try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected),/临时副本|链接|连接|目标发生变化/);}finally{fs.copyFileSync=copy;fs.openSync=open;fs.closeSync=close;}
  assert.ok(changed);assert.equal(fs.readFileSync(f.target,'utf8'),'外部新目标');assert.equal(fs.readFileSync(foreign,'utf8'),'外部同名暂存');assert.deepEqual(fs.readFileSync(path.join(moved,'target.ini')),f.before);assert.equal(fs.readFileSync(path.join(moved,path.basename(temporary)),'utf8'),'verified backup');
 }
});
test('恢复fsync故障保留原错误/目标且清理自有暂存，重试可完成',async t=>{
 const f=await fixture(t),sync=fs.fsyncSync,failure=new Error('注入真实恢复刷新故障');fs.fsyncSync=()=>{throw failure;};
 try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected),error=>error===failure);}finally{fs.fsyncSync=sync;}
 assert.deepEqual(fs.readFileSync(f.target),f.before);assert.ok(!fs.readdirSync(f.root).some(name=>name.includes('.gems-')));await f.backup.restore(f.hash,f.target,f.expected);assert.equal(fs.readFileSync(f.target,'utf8'),'verified backup');
});
test('源blob损坏在复制前拒绝，保持目标/源且不创建恢复暂存',async t=>{
 const f=await fixture(t),blob=f.backup.file(f.hash),copy=fs.copyFileSync;fs.writeFileSync(blob,'damaged blob');let calls=0;
 fs.copyFileSync=((...args:any[])=>{calls++;return(copy as any)(...args);}) as typeof fs.copyFileSync;
 try{await assert.rejects(f.backup.restore(f.hash,f.target,f.expected),/备份校验失败/);}finally{fs.copyFileSync=copy;}
 assert.equal(calls,0);assert.deepEqual(fs.readFileSync(f.target),f.before);assert.equal(fs.readFileSync(blob,'utf8'),'damaged blob');assert.ok(!fs.readdirSync(f.root).some(name=>name.includes('.gems-')));
});
test('正常/零字节恢复目标为独立普通文件，不改原备份或来源',async t=>{
 const f=await fixture(t);await f.backup.restore(f.hash,f.target,f.expected);assert.equal(await hashFile(f.target),f.hash);assert.equal(fs.statSync(f.target).nlink,1);assert.equal(fs.readFileSync(f.source,'utf8'),'verified backup');assert.equal(fs.readFileSync(f.backup.file(f.hash),'utf8'),'verified backup');
 const empty=path.join(f.root,'empty.ini');fs.writeFileSync(empty,'');const hash=await f.backup.put(empty);await f.backup.restore(hash,f.target,f.hash);assert.equal(fs.statSync(f.target).size,0);assert.equal(fs.statSync(f.target).nlink,1);assert.equal(await hashFile(f.target),hash);assert.ok(!fs.readdirSync(f.root).some(name=>name.includes('.gems-')));
});
test('真实Installer暂存损坏失败在目标提交前，事务回滚保留用户文件',async t=>{
 const f=await fixture(t),data=path.join(f.root,'data'),game=path.join(f.root,'game'),source=path.join(f.root,'package');fs.mkdirSync(path.join(game,'mods'),{recursive:true});fs.mkdirSync(path.join(source,'mods'),{recursive:true});const target=path.join(game,'mods/a.ini');fs.writeFileSync(target,f.before);fs.writeFileSync(path.join(source,'mods/a.ini'),'mod new');const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
 try{
  const installer=new Installer(store,f.backup,async()=>{}),report=await scan(source,data),plan=await installer.plan(report,game),copy=fs.copyFileSync,sync=fs.fsyncSync;let temporary='',changed=false;
  fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-'))temporary=String(args[1]);return result;}) as typeof fs.copyFileSync;
  fs.fsyncSync=((...args:any[])=>{if(temporary&&!changed){changed=true;fs.writeFileSync(temporary,'late install corruption');}return(sync as any)(...args);}) as typeof fs.fsyncSync;
  try{await assert.rejects(installer.install(plan,report,{overwrite:true,binary:false}),/临时副本/);}finally{fs.copyFileSync=copy;fs.fsyncSync=sync;}
  assert.ok(changed);assert.deepEqual(fs.readFileSync(target),f.before);assert.equal(store.list('mod').length,0);const tx=store.list<any>('transaction')[0];assert.equal(tx.state,'已回滚');assert.ok(tx.changes.every((entry:any)=>!entry.applied));assert.ok(!fs.readdirSync(path.dirname(target)).some(name=>name.includes('.gems-')));assert.equal(fs.readFileSync(path.join(source,'mods/a.ini'),'utf8'),'mod new');
  const healthy=await installer.plan(report,game),mod=await installer.install(healthy,report,{overwrite:true,binary:false});assert.equal(fs.readFileSync(target,'utf8'),'mod new');await installer.disable(mod.id);assert.deepEqual(fs.readFileSync(target),f.before);
 }finally{store.close();}
});
