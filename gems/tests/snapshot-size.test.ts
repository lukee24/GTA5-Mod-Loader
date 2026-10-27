import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Backup} from '../packages/backup';
import {snapshotReport} from '../packages/backup/snapshot-report';
import {hashFile} from '../packages/core/security';
async function fixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-snapshot-size-')),game=path.join(root,'game'),data=path.join(root,'data'),backup=new Backup(path.join(data,'backup')),source=path.join(game,'mods/a.ini');
 fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,'verified snapshot');const snapshot=await backup.snapshot([{absolute:source,relative:'mods/a.ini'}],game),blob=backup.file(snapshot.entries[0].hash);
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-snapshot-size-'));fs.rmSync(root,{recursive:true});});return{root,game,data,backup,source,snapshot,blob};
}
for(const before of ['x','larger damaged snapshot before repair'])test('快照blob在首次SHA前实际被修复，报告不能配上旧长度：'+Buffer.byteLength(before),async t=>{
 const f=await fixture(t),lstat=fs.lstatSync;fs.writeFileSync(f.blob,before);let repaired=false;
 (fs as any).lstatSync=(...args:any[])=>{if(String(args[0])===f.blob&&args[1]?.bigint===true&&!repaired){repaired=true;fs.writeFileSync(f.blob,'verified snapshot');}return(lstat as any)(...args);};
 let report;try{report=await snapshotReport(f.snapshot,f.backup,f.data,f.game);}finally{(fs as any).lstatSync=lstat;}
 t.diagnostic(JSON.stringify({repaired,reported:report.files[0].size,actual:fs.statSync(f.blob).size}));assert.ok(repaired);assert.equal(report.files[0].size,fs.statSync(f.blob).size);assert.equal(report.files[0].hash,await hashFile(f.blob));assert.equal(fs.readFileSync(f.source,'utf8'),'verified snapshot');
});

for(const change of ['append','remove'])test('快照SHA读取中实际增长或删除blob，不返回半核验恢复报告：'+change,async t=>{
 const f=await fixture(t),open=fs.openSync,read=fs.read;let fd:number|undefined,changed=false;
 fs.openSync=((...args:any[])=>{const result=(open as any)(...args);if(String(args[0])===f.blob&&args[1]==='r')fd=result;return result;}) as typeof open;
 (fs as any).read=(...args:any[])=>{const callback=args.at(-1);return(read as any)(...args.slice(0,-1),(error:any,...result:any[])=>{if(args[0]===fd&&!changed){changed=true;if(change==='append')fs.appendFileSync(f.blob,' externally appended');else fs.unlinkSync(f.blob);}callback(error,...result);});};
 try{await assert.rejects(snapshotReport(f.snapshot,f.backup,f.data,f.game),error=>error instanceof Error&&/快照备份.*校验失败/.test(error.message)&&error.cause instanceof Error);}finally{fs.openSync=open;(fs as any).read=read;}
 assert.ok(changed);assert.equal(fs.readFileSync(f.source,'utf8'),'verified snapshot');if(change==='append')assert.equal(fs.readFileSync(f.blob,'utf8'),'verified snapshot externally appended');else assert.equal(fs.existsSync(f.blob),false);assert.equal(fs.existsSync(path.join(f.data,'gems.sqlite')),false);
});

test('快照实际空文件报告长度为零，后续坏blob不能被忽略或写入记录',async t=>{
 const f=await fixture(t),empty=path.join(f.game,'mods/empty.ini');fs.writeFileSync(empty,'');const record=await f.backup.snapshot([{absolute:empty,relative:'mods/empty.ini'},{absolute:f.source,relative:'mods/a.ini'}],f.game),report=await snapshotReport(record,f.backup,f.data,f.game);assert.equal(report.files[0].size,0);assert.equal(report.files[1].size,17);for(const file of report.files){assert.equal(file.size,fs.statSync(file.source).size);assert.equal(file.hash,await hashFile(file.source));}
 fs.writeFileSync(f.blob,'damaged snapshot!');await assert.rejects(snapshotReport(record,f.backup,f.data,f.game),/快照备份.*mods\/a.ini/);assert.equal(fs.readFileSync(f.blob,'utf8'),'damaged snapshot!');assert.equal(fs.readFileSync(f.source,'utf8'),'verified snapshot');assert.equal(fs.statSync(empty).size,0);assert.equal(fs.existsSync(path.join(f.data,'gems.sqlite')),false);
});

test('真实快照/SQLite恢复计划使用正确长度，恢复后停用保持之后用户文件',async t=>{
 const {Store}=await import('../packages/database'),{Installer}=await import('../packages/installer'),{saveSnapshot,readSnapshot}=await import('../packages/backup/snapshot-records');const f=await fixture(t),store=await Store.open(f.data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
 try{
  saveSnapshot(store,f.snapshot);const record=readSnapshot(store,f.snapshot.id)!;fs.writeFileSync(f.source,'later user content');fs.writeFileSync(f.blob,'x');const lstat=fs.lstatSync;let repaired=false;
  (fs as any).lstatSync=(...args:any[])=>{if(String(args[0])===f.blob&&args[1]?.bigint===true&&!repaired){repaired=true;fs.writeFileSync(f.blob,'verified snapshot');}return(lstat as any)(...args);};
  let report;try{report=await snapshotReport(record,f.backup,f.data,f.game);}finally{(fs as any).lstatSync=lstat;}
  assert.ok(repaired);const installer=new Installer(store,f.backup,async()=>{}),plan=await installer.plan(report,f.game,true);assert.deepEqual(plan.blockers,[]);assert.equal(plan.bytes,17);assert.equal(fs.readFileSync(f.source,'utf8'),'later user content');const mod=await installer.install(plan,report,{overwrite:true,binary:true});assert.equal(fs.readFileSync(f.source,'utf8'),'verified snapshot');assert.equal(store.get<any>('mod',mod.id).report.files[0].size,17);await installer.disable(mod.id);assert.equal(fs.readFileSync(f.source,'utf8'),'later user content');assert.equal(readSnapshot(store,record.id)!.entries[0].hash,record.entries[0].hash);assert.equal(fs.readFileSync(f.blob,'utf8'),'verified snapshot');
 }finally{store.close();}
});
