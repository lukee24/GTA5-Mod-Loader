import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../packages/database';import {Backup} from '../packages/backup';import {Installer} from '../packages/installer';import {scan} from '../packages/scanner';
import {inspectFileHash,hashFile,MAX_BYTES} from '../packages/core/security';import crypto from 'node:crypto';
async function fixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-file-size-')),source=path.join(root,'package'),game=path.join(root,'game'),data=path.join(root,'data'),bytes=Buffer.from('actual mod bytes');
 fs.mkdirSync(path.join(source,'mods'),{recursive:true});fs.mkdirSync(game);fs.writeFileSync(path.join(source,'mods/a.ini'),bytes);
 const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),backup=new Backup(path.join(data,'backup')),installer=new Installer(store,backup,async()=>{});
 t.after(()=>{store.db.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-file-size-'));fs.rmSync(root,{recursive:true});});
 return{root,source,game,data,bytes,store,backup,installer};
}
test('扫描枚举后缓存在首个哈希快照前增长，不能保存旧size配新SHA',async t=>{
 const f=await fixture(t),lstat=fs.lstatSync;let changed=false;
 (fs as any).lstatSync=(...args:any[])=>{const file=String(args[0]);if(!changed&&args[1]?.bigint&&file.includes(path.sep+'contents'+path.sep)&&file.endsWith('a.ini')){changed=true;fs.appendFileSync(file,'cache growth');}return(lstat as any)(...args);};
 try{await assert.rejects(async()=>{const report=await scan(f.source,f.data);t.diagnostic(JSON.stringify({declared:report.files[0].size,actual:fs.statSync(report.files[0].source).size}));},/文件大小/);}finally{(fs as any).lstatSync=lstat;}
 assert.ok(changed);assert.deepEqual(fs.readFileSync(path.join(f.source,'mods/a.ini')),f.bytes);
});
test('报告size低估但SHA正确时，安装预览必须阻止容量估计',async t=>{
 const f=await fixture(t),report=await scan(f.source,f.data);report.files[0].size=0;
 const plan=await f.installer.plan(report,f.game);t.diagnostic(JSON.stringify({planBytes:plan.bytes,blockers:plan.blockers}));assert.ok(plan.blockers.some(message=>/文件大小/.test(message)));assert.equal(plan.files.length,0);
});
test('计划与报告同时低估size时，在事务/备份/目标写入前拒绝',async t=>{
 const f=await fixture(t),report=await scan(f.source,f.data),plan=await f.installer.plan(report,f.game),before=fs.readFileSync(path.join(f.data,'gems.sqlite'));report.files[0].size=0;plan.files[0].size=0;plan.bytes=0;
 await assert.rejects(async()=>{const mod=await f.installer.install(plan,report,{overwrite:false,binary:false});t.diagnostic(JSON.stringify({storedBytes:mod.bytes,actualBytes:fs.statSync(path.join(f.game,'mods/a.ini')).size}));},/文件大小/);
 assert.deepEqual(fs.readFileSync(path.join(f.data,'gems.sqlite')),before);assert.deepEqual(fs.readdirSync(f.game),[]);assert.deepEqual(fs.readdirSync(path.join(f.backup.root,'blobs')),[]);assert.equal(f.store.list('transaction').length,0);
});
test('仅计划总bytes被改时，不允许持久化虚构MOD占用',async t=>{
 const f=await fixture(t),report=await scan(f.source,f.data),plan=await f.installer.plan(report,f.game);plan.bytes=1;
 await assert.rejects(async()=>{const mod=await f.installer.install(plan,report,{overwrite:false,binary:false});t.diagnostic(JSON.stringify({storedBytes:mod.bytes,actualBytes:fs.statSync(path.join(f.game,'mods/a.ini')).size}));},/总字节数/);
 assert.deepEqual(fs.readdirSync(f.game),[]);assert.equal(f.store.list('transaction').length,0);assert.equal(f.store.list('mod').length,0);
});
test('同一个固定fd返回真实SHA与bytes，旧hashFile接口保持，空文件支持',async t=>{
 const f=await fixture(t),file=path.join(f.source,'mods/a.ini'),evidence=await inspectFileHash(file,{expectedBytes:f.bytes.length});
 assert.deepEqual(evidence,{hash:crypto.createHash('sha256').update(f.bytes).digest('hex'),bytes:f.bytes.length});assert.ok(Object.isFrozen(evidence));assert.equal(await hashFile(file),evidence.hash);
 fs.writeFileSync(file,'');assert.deepEqual(await inspectFileHash(file,{expectedBytes:0}),{hash:crypto.createHash('sha256').digest('hex'),bytes:0});
});
test('错大小/异常预计参数在打开内容前拒绝，原文件完整',async t=>{
 const f=await fixture(t),file=path.join(f.source,'mods/a.ini'),open=fs.openSync;let opens=0;
 fs.openSync=((...args:any[])=>{opens++;return(open as any)(...args);}) as typeof fs.openSync;
 try{
  for(const expectedBytes of [0,f.bytes.length+1])await assert.rejects(inspectFileHash(file,{expectedBytes}),/文件大小/);
  for(const options of [null,{},[],{expectedBytes:undefined},{expectedBytes:-1},{expectedBytes:0.5},{expectedBytes:NaN},{expectedBytes:MAX_BYTES+1},{expectedBytes:'16'},{expectedBytes:16,extra:true}])await assert.rejects(inspectFileHash(file,options as any),/文件大小预期无效/);
  assert.equal(opens,0);
 }finally{fs.openSync=open;}
 assert.deepEqual(fs.readFileSync(file),f.bytes);
});
test('高估大小也不能预览/直接安装；拒绝之后修正元数据能继续',async t=>{
 const f=await fixture(t),report=await scan(f.source,f.data),plan=await f.installer.plan(report,f.game),original=report.files[0].size;report.files[0].size=original+1;plan.files[0].size=original+1;plan.bytes=original+1;
 assert.ok((await f.installer.plan(report,f.game)).blockers.some(message=>/文件大小/.test(message)));await assert.rejects(f.installer.install(plan,report,{overwrite:false,binary:false}),/文件大小/);assert.equal(f.store.list('transaction').length,0);
 report.files[0].size=original;const healthy=await f.installer.plan(report,f.game),mod=await f.installer.install(healthy,report,{overwrite:false,binary:false});assert.equal(mod.bytes,original);await f.installer.disable(mod.id);assert.equal(fs.existsSync(path.join(f.game,'mods/a.ini')),false);
});
test('原预览后实际缓存变长在执行阶段拒绝，不创建事务与备份',async t=>{
 const f=await fixture(t),report=await scan(f.source,f.data),plan=await f.installer.plan(report,f.game),before=fs.readFileSync(path.join(f.data,'gems.sqlite')),cached=report.files[0].source;fs.appendFileSync(cached,'later growth');
 await assert.rejects(f.installer.install(plan,report,{overwrite:false,binary:false}),/文件大小/);assert.deepEqual(fs.readFileSync(path.join(f.data,'gems.sqlite')),before);assert.deepEqual(fs.readdirSync(f.game),[]);assert.deepEqual(fs.readdirSync(path.join(f.backup.root,'blobs')),[]);assert.equal(fs.statSync(cached).size,f.bytes.length+12);assert.deepEqual(fs.readFileSync(path.join(f.source,'mods/a.ini')),f.bytes);
});
test('正常多文件/零字节扫描安装统计与实际目标大小一致，停用保留原始包',async t=>{
 const f=await fixture(t);fs.writeFileSync(path.join(f.source,'mods/empty.ini'),'');const report=await scan(f.source,f.data);assert.equal(report.files.length,2);
 for(const file of report.files)assert.equal(file.size,fs.statSync(file.source).size);
 const plan=await f.installer.plan(report,f.game);assert.deepEqual(plan.blockers,[]);assert.equal(plan.bytes,f.bytes.length);const mod=await f.installer.install(plan,report,{overwrite:false,binary:false});
 assert.equal(mod.bytes,report.files.reduce((bytes,file)=>bytes+file.size,0));assert.equal(mod.bytes,plan.files.reduce((bytes,file)=>bytes+fs.statSync(path.join(f.game,file.target)).size,0));assert.equal((f.store.get<any>('mod',mod.id)).bytes,mod.bytes);
 await f.installer.disable(mod.id);assert.deepEqual(fs.readdirSync(path.join(f.game,'mods')),[]);assert.deepEqual(fs.readFileSync(path.join(f.source,'mods/a.ini')),f.bytes);assert.equal(fs.statSync(path.join(f.source,'mods/empty.ini')).size,0);
});
test('后续坏容量包失败不改变此前成功模组、文件、事务及备份',async t=>{
 const f=await fixture(t),first=await scan(f.source,f.data),firstPlan=await f.installer.plan(first,f.game),installed=await f.installer.install(firstPlan,first,{overwrite:false,binary:false}),second=await scan(f.source,f.data);second.files[0].size=0;
 const before=fs.readFileSync(path.join(f.data,'gems.sqlite')),blobs=fs.readdirSync(path.join(f.backup.root,'blobs')),plan=await f.installer.plan(second,f.game);await assert.rejects(f.installer.install(plan,second,{overwrite:true,binary:true}),/文件大小/);
 assert.deepEqual(fs.readFileSync(path.join(f.data,'gems.sqlite')),before);assert.deepEqual(fs.readFileSync(path.join(f.game,'mods/a.ini')),f.bytes);assert.deepEqual(fs.readdirSync(path.join(f.backup.root,'blobs')),blobs);assert.equal(f.store.list('transaction').length,1);assert.equal(f.store.list('mod').length,1);assert.equal(f.store.get<any>('mod',installed.id).status,'已启用');assert.equal(f.store.get('mod',second.id),undefined);
 await f.installer.disable(installed.id);assert.equal(fs.existsSync(path.join(f.game,'mods/a.ini')),false);
});
