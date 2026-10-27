import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../packages/database';import {Backup} from '../packages/backup';import {Installer} from '../packages/installer';import {scan} from '../packages/scanner';import type {Transaction} from '../packages/core/types';
import {acquireGameDirectories} from '../packages/installer/game-directory-lease';
function gate(){let release!:()=>void;const wait=new Promise<void>(resolve=>{release=resolve;});return{wait,release};}
async function fixture(t:any){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-game-directory-exclusion-')),game=path.join(root,'game');fs.mkdirSync(game);
  const stores:Store[]=[];
  async function manager(name:string){const data=path.join(root,name),store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));stores.push(store);return{data,store,installer:new Installer(store,new Backup(path.join(data,'backup')),async()=>{})};}
  const first=await manager('data-a'),second=await manager('data-b');
  async function packageFor(m:typeof first,name:string,target='a.ini',content='same bytes'){
    const source=path.join(root,name);fs.mkdirSync(path.join(source,'mods'),{recursive:true});fs.writeFileSync(path.join(source,'mods',target),content);const report=await scan(source,m.data);return{report,plan:await m.installer.plan(report,game)};
  }
  const a=await packageFor(first,'first-source'),mod=await first.installer.install(a.plan,a.report,{overwrite:false,binary:false}),tx=first.store.get<Transaction>('transaction',mod.transactionId)!;
  t.after(()=>{for(const store of stores)store.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-game-directory-exclusion-'));fs.rmSync(root,{recursive:true});});
  return{root,game,first,second,packageFor,mod,tx,manager};
}
async function holdDisable(f:Awaited<ReturnType<typeof fixture>>){const hold=gate(),entered=gate();let calls=0;f.first.installer.guard=async()=>{if(++calls===1){entered.release();await hold.wait;}};const operation=f.first.installer.disable(f.mod.id);await entered.wait;return{hold,operation};}

test('不同数据库共用游戏根：真实停用等待中第二次相同字节安装必须零写拒绝',async t=>{
  const f=await fixture(t),b=await f.packageFor(f.second,'second-source'),held=await holdDisable(f),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  try{
    await assert.rejects(async()=>{const mod=await f.second.installer.install(b.plan,b.report,{overwrite:true,binary:false});t.diagnostic(JSON.stringify({secondStatus:mod.status,targetExists:fs.existsSync(path.join(f.game,'mods/a.ini'))}));},/另一个文件事务正在操作此游戏目录/);
    assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);assert.equal(fs.readFileSync(path.join(f.game,'mods/a.ini'),'utf8'),'same bytes');
  }finally{held.hold.release();await held.operation;t.diagnostic(JSON.stringify({afterFirstDisabled:true,secondStatus:f.second.store.get<any>('mod',b.report.id)?.status??null,targetExists:fs.existsSync(path.join(f.game,'mods/a.ini'))}));}
});

test('不同数据库共用游戏根：真实恢复不能在另一个安装器停用等待中删除文件',async t=>{
  const f=await fixture(t),b=await f.packageFor(f.second,'second-source','b.ini','second bytes'),mod=await f.second.installer.install(b.plan,b.report,{overwrite:false,binary:false}),tx=f.second.store.get<Transaction>('transaction',mod.transactionId)!,held=await holdDisable(f),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  try{await assert.rejects(async()=>{const result=await f.second.installer.restoreTransaction(tx);t.diagnostic(JSON.stringify({state:result.state,secondTargetExists:fs.existsSync(path.join(f.game,'mods/b.ini'))}));},/另一个文件事务正在操作此游戏目录/);assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);assert.equal(fs.readFileSync(path.join(f.game,'mods/b.ini'),'utf8'),'second bytes');}finally{held.hold.release();await held.operation;}
});

test('不同数据库共用游戏根：恢复孤立已完成事务也先拒绝，不删目标',async t=>{
  const f=await fixture(t),b=await f.packageFor(f.second,'second-source','b.ini','second bytes'),mod=await f.second.installer.install(b.plan,b.report,{overwrite:false,binary:false});f.second.store.remove('mod',mod.id);const held=await holdDisable(f),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  try{await assert.rejects(async()=>{const result=await f.second.installer.recover();t.diagnostic(JSON.stringify({result,secondTargetExists:fs.existsSync(path.join(f.game,'mods/b.ini'))}));},/另一个文件事务正在操作此游戏目录/);assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);assert.equal(fs.readFileSync(path.join(f.game,'mods/b.ini'),'utf8'),'second bytes');}finally{held.hold.release();await held.operation;}
});

test('释放游戏锁后另一独立库可真实安装/停用/卸载，大小写与斜杠等价目录同锁',async t=>{
  const f=await fixture(t),b=await f.packageFor(f.second,'second-source'),held=await holdDisable(f),alias={...b.plan,gamePath:f.game.toUpperCase()+path.sep};
  try{await assert.rejects(f.second.installer.install(alias,b.report,{overwrite:true,binary:false}),/另一个文件事务正在操作此游戏目录/);assert.equal(f.second.installer.busy,false);}finally{held.hold.release();await held.operation;}
  const fresh=await f.second.installer.plan(b.report,f.game),mod=await f.second.installer.install(fresh,b.report,{overwrite:false,binary:false});assert.equal(fs.readFileSync(path.join(f.game,'mods/a.ini'),'utf8'),'same bytes');await f.second.installer.disable(mod.id);assert.equal(fs.existsSync(path.join(f.game,'mods/a.ini')),false);await f.second.installer.disable(mod.id,true);assert.equal(f.second.store.get<any>('mod',mod.id).status,'已卸载');
});

test('安装进度原异常及内部回滚释放游戏锁，不误阻另一数据库后续实际安装',async t=>{
  const f=await fixture(t);await f.first.installer.disable(f.mod.id);const a=await f.first.installer.planEnable(f.mod.id),failure=new Error('写后进度故障');f.first.installer.progress=()=>{throw failure;};
  await assert.rejects(f.first.installer.install(a,f.mod.report,{overwrite:false,binary:false}),error=>error===failure);assert.equal(fs.existsSync(path.join(f.game,'mods/a.ini')),false);assert.equal(f.first.installer.busy,false);
  const b=await f.packageFor(f.second,'second-source');const mod=await f.second.installer.install(b.plan,b.report,{overwrite:false,binary:false});assert.equal(mod.status,'已启用');await f.second.installer.disable(mod.id);assert.equal(fs.existsSync(path.join(f.game,'mods/a.ini')),false);
});

test('不同游戏根与不同Store仍允许独立文件操作，根锁不变成全局单队列',async t=>{
  const f=await fixture(t),other=path.join(f.root,'other-game');fs.mkdirSync(other);const b=await f.packageFor(f.second,'second-source','b.ini','other bytes'),plan=await f.second.installer.plan(b.report,other),held=await holdDisable(f);
  try{const mod=await f.second.installer.install(plan,b.report,{overwrite:false,binary:false});assert.equal(fs.readFileSync(path.join(other,'mods/b.ini'),'utf8'),'other bytes');await f.second.installer.disable(mod.id);assert.equal(fs.existsSync(path.join(other,'mods/b.ini')),false);assert.equal(f.first.installer.busy,true);}finally{held.hold.release();await held.operation;}
});

test('多游戏恢复在任意根冲突时整批零写，提前申请的无冲突根不泄漏锁',async t=>{
  const f=await fixture(t),other=path.join(f.root,'other-game');fs.mkdirSync(other);const b=await f.packageFor(f.second,'b-source','b.ini','second bytes'),bm=await f.second.installer.install(b.plan,b.report,{overwrite:false,binary:false});f.second.store.remove('mod',bm.id);
  const c=await f.packageFor(f.second,'c-source','c.ini','third bytes'),cm=await f.second.installer.install(await f.second.installer.plan(c.report,other),c.report,{overwrite:false,binary:false});f.second.store.remove('mod',cm.id);
  const held=await holdDisable(f),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  try{await assert.rejects(f.second.installer.recover(),/另一个文件事务正在操作此游戏目录/);assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);assert.equal(fs.readFileSync(path.join(other,'mods/c.ini'),'utf8'),'third bytes');assert.equal(fs.readFileSync(path.join(f.game,'mods/b.ini'),'utf8'),'second bytes');const third=await f.manager('data-c'),d=await f.packageFor(third,'d-source','d.ini','fourth bytes'),dm=await third.installer.install(await third.installer.plan(d.report,other),d.report,{overwrite:false,binary:false});await third.installer.disable(dm.id);}finally{held.hold.release();await held.operation;}
  const messages=await f.second.installer.recover();assert.equal(messages.length,2);assert.equal(fs.existsSync(path.join(other,'mods/c.ini')),false);assert.equal(fs.existsSync(path.join(f.game,'mods/b.ini')),false);
});

test('游戏根准入失败也释放Store锁，不修改坏根且正确根随后可安装',async t=>{
  const f=await fixture(t),b=await f.packageFor(f.second,'b-source','b.ini','second bytes'),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  await assert.rejects(f.second.installer.install({...b.plan,gamePath:''},b.report,{overwrite:false,binary:false}),/游戏目录/);assert.equal(f.second.installer.busy,false);assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);const mod=await f.second.installer.install(b.plan,b.report,{overwrite:false,binary:false});assert.equal(mod.status,'已启用');
});

test('目录连接作为游戏根在租约前拒绝，普通根和数据库保持',async t=>{
  const f=await fixture(t),alias=path.join(f.root,'game-alias');fs.symlinkSync(f.game,alias,'junction');
  const b=await f.packageFor(f.second,'b-source','b.ini','second bytes'),before=fs.readFileSync(path.join(f.second.data,'gems.sqlite'));
  await assert.rejects(f.second.installer.install({...b.plan,gamePath:alias},b.report,{overwrite:false,binary:false}),/符号链接或目录连接/);
  assert.deepEqual(fs.readFileSync(path.join(f.second.data,'gems.sqlite')),before);assert.equal(fs.existsSync(path.join(f.game,'mods/b.ini')),false);assert.equal(f.second.installer.busy,false);
});

test('批次较晚根无效不泄漏前面租约，释放函数重复调用不解除后来租约',async t=>{
  const f=await fixture(t);assert.throws(()=>acquireGameDirectories([f.game,'']),/游戏目录/);
  const release=acquireGameDirectories([f.game,f.game+path.sep]);assert.throws(()=>acquireGameDirectories([f.game]),/另一个文件事务/);release();
  const later=acquireGameDirectories([f.game]);release();assert.throws(()=>acquireGameDirectories([f.game]),/另一个文件事务/);later();const final=acquireGameDirectories([f.game]);final();
});

test('已停用模组卸载仅更新记录，游戏目录已经移除也不误申请文件租约',async t=>{
  const f=await fixture(t);await f.first.installer.disable(f.mod.id);fs.renameSync(f.game,path.join(f.root,'removed-game'));
  await f.first.installer.disable(f.mod.id,true);assert.equal(f.first.store.get<any>('mod',f.mod.id).status,'已卸载');assert.equal(fs.existsSync(f.game),false);
});
