import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
import type {ModRecord,Transaction} from '../packages/core/types';

async function fixture(t:any){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-lifecycle-')),game=path.join(root,'game'),data=path.join(root,'data'),source=path.join(root,'package');
  fs.mkdirSync(game);fs.mkdirSync(path.join(source,'scripts'),{recursive:true});fs.writeFileSync(path.join(source,'scripts/test.ini'),'mod value');
  const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  t.after(()=>store.close());const backup=new Backup(path.join(data,'backup')),installer=new Installer(store,backup,async()=>{});
  const report=await scan(source,data),target=path.join(game,'scripts/test.ini');
  return{root,game,data,source,store,backup,installer,report,target};
}
const approved={overwrite:true,binary:true};
async function install(f:Awaited<ReturnType<typeof fixture>>){return f.installer.install(await f.installer.plan(f.report,f.game),f.report,approved);}

test('停用后卸载仅更新记录，保留用户后来写入的文件和备份',async t=>{
  const f=await fixture(t);await install(f);await f.installer.disable(f.report.id);
  fs.writeFileSync(f.target,'user new file');f.installer.guard=async()=>{throw new Error('游戏正在运行');};
  const blobs=fs.readdirSync(path.join(f.backup.root,'blobs'));await f.installer.disable(f.report.id,true);
  assert.equal(f.store.get<ModRecord>('mod',f.report.id)!.status,'已卸载');assert.equal(fs.readFileSync(f.target,'utf8'),'user new file');assert.deepEqual(fs.readdirSync(path.join(f.backup.root,'blobs')),blobs);
});

test('覆盖型模组重新启用要求预览、原基线和明确覆盖确认',async t=>{
  const f=await fixture(t);fs.mkdirSync(path.dirname(f.target));fs.writeFileSync(f.target,'existing NVE config');
  const original=await install(f);await f.installer.disable(f.report.id);const plan=await f.installer.planEnable(f.report.id);
  assert.equal(plan.blockers.length,0);assert.equal(plan.conflicts.length,1);assert.equal(plan.reenableFrom,original.transactionId);
  await assert.rejects(f.installer.install(plan,f.report,{overwrite:false,binary:true}),/明确确认/);assert.equal(fs.readFileSync(f.target,'utf8'),'existing NVE config');
  const mod=await f.installer.install(plan,f.report,approved);assert.notEqual(mod.transactionId,original.transactionId);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');
  await f.installer.disable(mod.id);assert.equal(fs.readFileSync(f.target,'utf8'),'existing NVE config');
});

test('停用后外部更改不能通过重新启用强制覆盖',async t=>{
  const f=await fixture(t);await install(f);await f.installer.disable(f.report.id);fs.writeFileSync(f.target,'external change');
  const plan=await f.installer.planEnable(f.report.id);assert.ok(plan.blockers.some(b=>b.includes('目标已变化')));
  await assert.rejects(f.installer.install(plan,f.report,approved),/已变化/);assert.equal(fs.readFileSync(f.target,'utf8'),'external change');
});

test('同内容的后续模组也拥有文件：旧重新启用预览必须失效',async t=>{
  const f=await fixture(t);fs.mkdirSync(path.dirname(f.target));fs.writeFileSync(f.target,'baseline');await install(f);await f.installer.disable(f.report.id);
  const stale=await f.installer.planEnable(f.report.id);fs.writeFileSync(path.join(f.source,'scripts/test.ini'),'baseline');const newer=await scan(f.source,f.data);newer.name='后续模组';
  await f.installer.install(await f.installer.plan(newer,f.game),newer,approved);
  assert.ok((await f.installer.planEnable(f.report.id)).blockers.some(b=>b.includes('后续模组')));
  await assert.rejects(f.installer.install(stale,f.report,approved),/后续模组/);assert.equal(fs.readFileSync(f.target,'utf8'),'baseline');
  await f.installer.disable(newer.id);await f.installer.enable(f.report.id,approved);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');
});

test('不同游戏目录同名目标不共享所有权，也不阻止恢复',async t=>{
  const f=await fixture(t);await install(f);const game2=path.join(f.root,'game2');fs.mkdirSync(path.join(game2,'scripts'),{recursive:true});fs.writeFileSync(path.join(game2,'scripts/test.ini'),'game2 original');
  const other=await scan(f.source,f.data),plan=await f.installer.plan(other,game2);assert.equal(plan.files[0].owner,undefined);
  await f.installer.install(plan,other,approved);await f.installer.disable(f.report.id);assert.ok(!fs.existsSync(f.target));assert.equal(fs.readFileSync(path.join(game2,'scripts/test.ini'),'utf8'),'mod value');
  await f.installer.disable(other.id);assert.equal(fs.readFileSync(path.join(game2,'scripts/test.ini'),'utf8'),'game2 original');
});

test('同哈希覆盖仍遵守所有权顺序，不能删除后续模组的文件',async t=>{
  const f=await fixture(t);await install(f);const other=await scan(f.source,f.data);await f.installer.install(await f.installer.plan(other,f.game),other,approved);
  await assert.rejects(f.installer.disable(f.report.id),/后续/);assert.ok(fs.existsSync(f.target));await f.installer.disable(other.id);await f.installer.disable(f.report.id);assert.ok(!fs.existsSync(f.target));
});

test('恢复中途游戏启动立即停止剩余写入，关闭后可继续恢复',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'scripts/second.ini'),'second');f.report=await scan(f.source,f.data);await install(f);
  let running=false;f.installer.guard=async()=>{if(running)throw new Error('游戏正在运行');};f.installer.progress=message=>{if(message.startsWith('正在恢复'))running=true;};
  await assert.rejects(f.installer.disable(f.report.id),/游戏正在运行/);const mod=f.store.get<ModRecord>('mod',f.report.id)!,tx=f.store.get<Transaction>('transaction',mod.transactionId)!;
  assert.equal(tx.state,'恢复待处理');assert.equal(tx.changes.filter(c=>c.applied).length,1);assert.equal(fs.readdirSync(path.dirname(f.target)).length,1);
  running=false;f.installer.progress=()=>{};const result=await f.installer.recover();assert.ok(result[0].includes('已回滚'));assert.equal(fs.readdirSync(path.dirname(f.target)).length,0);assert.equal(f.store.get<ModRecord>('mod',mod.id)!.status,'已停用');
});

test('已预览的安装也不能覆盖后来出现的待恢复事务',async t=>{
  const f=await fixture(t);const mod=await install(f),other=await scan(f.source,f.data),stale=await f.installer.plan(other,f.game);
  const tx=f.store.get<Transaction>('transaction',mod.transactionId)!;tx.state='恢复待处理';f.store.put('transaction',tx.id,tx);
  assert.ok((await f.installer.plan(other,f.game)).blockers.some(b=>b.includes('未完成事务')));
  await assert.rejects(f.installer.install(stale,other,approved),/未完成事务/);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');await f.installer.recover();assert.ok(!fs.existsSync(f.target));
});

test('未提交的完成事务遇外部修改时报告待处理，不谎报已恢复',async t=>{
  const f=await fixture(t);await install(f);f.store.db.run('DELETE FROM documents WHERE kind=? AND id=?',['mod',f.report.id]);f.store.flush();fs.writeFileSync(f.target,'user changed');
  const messages=await f.installer.recover();assert.ok(messages[0].includes('恢复待处理'));assert.ok(!messages[0].includes('已恢复'));assert.equal(fs.readFileSync(f.target,'utf8'),'user changed');assert.equal(f.store.list<any>('log')[0].message,messages[0]);
});

test('备份阶段源文件变化不得写入未经批准的新内容',async t=>{
  const f=await fixture(t),plan=await f.installer.plan(f.report,f.game),original=f.backup.put.bind(f.backup);
  f.backup.put=async file=>{if(file===f.report.files[0].source)fs.writeFileSync(file,'changed during backup');return original(file);};
  await assert.rejects(f.installer.install(plan,f.report,approved),/备份期间/);assert.ok(!fs.existsSync(f.target));assert.equal(f.store.list<Transaction>('transaction')[0].state,'已回滚');
});

test('备份阶段目标变化保留外部新文件，不改写为旧备份',async t=>{
  const f=await fixture(t);fs.mkdirSync(path.dirname(f.target));fs.writeFileSync(f.target,'original');const plan=await f.installer.plan(f.report,f.game),original=f.backup.put.bind(f.backup);
  f.backup.put=async file=>{if(file===f.target)fs.writeFileSync(file,'external during backup');return original(file);};
  await assert.rejects(f.installer.install(plan,f.report,approved),/备份期间/);assert.equal(fs.readFileSync(f.target,'utf8'),'external during backup');
});

test('计划与另一份报告或修改后的目标清单不匹配时拒绝执行',async t=>{
  const f=await fixture(t),plan=await f.installer.plan(f.report,f.game);
  await assert.rejects(f.installer.install(plan,{...f.report,id:crypto.randomUUID()},approved),/不匹配/);
  await assert.rejects(f.installer.install(plan,{...f.report,files:f.report.files.map(r=>({...r,target:'mods/other.ini'}))},approved),/不匹配/);assert.equal(f.store.list('transaction').length,0);
});

test('预览后目标目录变为 junction 时拒绝越界写入',async t=>{
  const f=await fixture(t),plan=await f.installer.plan(f.report,f.game),outside=path.join(f.root,'outside');fs.mkdirSync(outside);fs.symlinkSync(outside,path.dirname(f.target),'junction');
  await assert.rejects(f.installer.install(plan,f.report,approved),/链接|连接/);assert.ok(!fs.existsSync(path.join(outside,'test.ini')));
});

test('恢复事务缺失给出中文错误，保留当前文件',async t=>{
  const f=await fixture(t),mod=await install(f);mod.transactionId='missing';f.store.put('mod',mod.id,mod);
  await assert.rejects(f.installer.disable(mod.id),/事务记录缺失/);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');
});

test('并发安装拒绝第二个写事务，首个事务仍能完整提交',async t=>{
  const f=await fixture(t),plan=await f.installer.plan(f.report,f.game);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let gated=true;
  f.installer.guard=async()=>{if(gated){gated=false;await gate;}};const first=f.installer.install(plan,f.report,approved);
  try{await assert.rejects(f.installer.install(plan,f.report,approved),/另一个文件事务/);}finally{release();}
  await first;assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');assert.equal(f.store.list<Transaction>('transaction').length,1);
});

test('重新启用中断不能借旧停用记录卸载，必须先恢复新事务',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'scripts/second.ini'),'second');f.report=await scan(f.source,f.data);await install(f);await f.installer.disable(f.report.id);
  const plan=await f.installer.planEnable(f.report.id);let running=false;f.installer.guard=async()=>{if(running)throw new Error('游戏正在运行');};
  const original=f.backup.restore.bind(f.backup);f.backup.restore=async(hash,target,expected,beforeCommit)=>{await original(hash,target,expected,beforeCommit);running=true;};
  await assert.rejects(f.installer.install(plan,f.report,approved),/游戏正在运行/);assert.equal(f.store.get<ModRecord>('mod',f.report.id)!.status,'已停用');assert.equal(fs.readdirSync(path.dirname(f.target)).length,1);
  await assert.rejects(f.installer.disable(f.report.id,true),/未完成事务/);assert.equal(fs.readdirSync(path.dirname(f.target)).length,1);
  running=false;f.backup.restore=original;await f.installer.recover();assert.equal(fs.readdirSync(path.dirname(f.target)).length,0);await f.installer.disable(f.report.id,true);assert.equal(f.store.get<ModRecord>('mod',f.report.id)!.status,'已卸载');
});
