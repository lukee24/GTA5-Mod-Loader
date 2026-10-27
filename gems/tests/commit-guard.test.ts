import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {Store} from '../packages/database';import {Backup} from '../packages/backup';import {Installer} from '../packages/installer';import {scan} from '../packages/scanner';import type {Transaction} from '../packages/core/types';
import {hashFile} from '../packages/core/security';
import {captureCommitTarget,assertCommitTarget} from '../packages/core/commit-target';
async function fixture(t:any,existing=true){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-commit-guard-')),game=path.join(root,'game'),source=path.join(root,'package'),data=path.join(root,'data'),target=path.join(game,'mods/a.ini');fs.mkdirSync(path.dirname(target),{recursive:true});fs.mkdirSync(path.join(source,'mods'),{recursive:true});fs.writeFileSync(path.join(source,'mods/a.ini'),'mod value');if(existing)fs.writeFileSync(target,'user original');
 const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),backup=new Backup(path.join(data,'backup')),state={running:false},installer=new Installer(store,backup,async()=>{if(state.running)throw new Error('模拟游戏正在运行');}),report=await scan(source,data),plan=await installer.plan(report,game);
 t.after(()=>{store.db.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-commit-guard-'));fs.rmSync(root,{recursive:true});});return{root,game,source,data,target,store,backup,state,installer,report,plan};
}
const approved={overwrite:true,binary:false};
test('安装副本准备期间守卫变为运行中，不能继续提交目标/启用MOD',async t=>{
 const f=await fixture(t),copy=fs.copyFileSync;let changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-')){changed=true;f.state.running=true;}return result;}) as typeof fs.copyFileSync;
 try{await assert.rejects(async()=>{const mod=await f.installer.install(f.plan,f.report,approved);t.diagnostic(JSON.stringify({running:f.state.running,mod:mod.status,target:fs.readFileSync(f.target,'utf8')}));},/游戏正在运行/);}finally{fs.copyFileSync=copy;}
 assert.ok(changed);assert.equal(fs.readFileSync(f.target,'utf8'),'user original');assert.equal(f.store.list('mod').length,0);assert.equal(f.store.list<Transaction>('transaction')[0].state,'恢复待处理');
});
test('新增目标父目录尚未创建也能记录缺失，早期失败可无写入回滚',async t=>{
 const f=await fixture(t,false),missing=path.join(f.game,'mods/new/a.ini'),checkpoint=captureCommitTarget(missing);assert.equal(checkpoint.stamp,null);assert.doesNotThrow(()=>assertCommitTarget(checkpoint));assert.equal(fs.existsSync(path.dirname(missing)),false);
 fs.mkdirSync(path.dirname(missing));assert.throws(()=>assertCommitTarget(checkpoint),/目标发生变化/);fs.rmdirSync(path.dirname(missing));
 fs.mkdirSync(path.join(f.source,'mods/new'));fs.renameSync(path.join(f.source,'mods/a.ini'),path.join(f.source,'mods/new/a.ini'));const report=await scan(f.source,f.data),plan=await f.installer.plan(report,f.game),restore=f.backup.restore.bind(f.backup),failure=new Error('注入父目录创建前恢复故障');f.backup.restore=async()=>{throw failure;};
 try{await assert.rejects(f.installer.install(plan,report,approved),error=>error===failure);}finally{f.backup.restore=restore;}
 const tx=f.store.list<Transaction>('transaction')[0];assert.equal(tx.state,'已回滚');assert.ok(tx.changes.every(change=>!change.applied));assert.equal(fs.existsSync(path.dirname(missing)),false);assert.equal(f.store.list('mod').length,0);
});
test('提交点进程未知/环境未就绪同样拒绝，不把不确定当未运行',async t=>{
 for(const message of ['模拟无法确认游戏进程','模拟Steam部署尚未就绪']){
  const f=await fixture(t),failure=new Error(message),copy=fs.copyFileSync;let changed=false;
  f.installer.guard=async()=>{if(changed)throw failure;};
  fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-'))changed=true;return result;}) as typeof fs.copyFileSync;
  try{await assert.rejects(f.installer.install(f.plan,f.report,approved),error=>error===failure);}finally{fs.copyFileSync=copy;}
  assert.ok(changed);assert.equal(fs.readFileSync(f.target,'utf8'),'user original');assert.equal(f.store.list('mod').length,0);assert.equal(f.store.list<Transaction>('transaction')[0].state,'恢复待处理');assert.ok(!fs.readdirSync(path.dirname(f.target)).some(name=>name.includes('.gems-')));
 }
});
test('提交失败后守卫恢复允许，recover消除未提交标记再安装/停用正常',async t=>{
 const f=await fixture(t),copy=fs.copyFileSync;let changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(!changed&&String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-')){changed=true;f.state.running=true;}return result;}) as typeof fs.copyFileSync;
 try{await assert.rejects(f.installer.install(f.plan,f.report,approved),/游戏正在运行/);}finally{fs.copyFileSync=copy;}
 const pending=f.store.list<Transaction>('transaction')[0];assert.equal(pending.state,'恢复待处理');assert.ok(pending.changes[0].applied,'写前持久化标记不伪称目标已修改');assert.equal(fs.readFileSync(f.target,'utf8'),'user original');
 f.state.running=false;const messages=await f.installer.recover();assert.ok(messages[0].includes('已回滚'));assert.ok(f.store.get<Transaction>('transaction',pending.id)!.changes.every(change=>!change.applied));
 const plan=await f.installer.plan(f.report,f.game),mod=await f.installer.install(plan,f.report,approved);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');await f.installer.disable(mod.id);assert.equal(fs.readFileSync(f.target,'utf8'),'user original');
});
test('恢复覆盖文件在提交点暂停后，守卫允许才继续还原并更新MOD状态',async t=>{
 const f=await fixture(t),mod=await f.installer.install(f.plan,f.report,approved),copy=fs.copyFileSync;let changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(!changed&&String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-')){changed=true;f.state.running=true;}return result;}) as typeof fs.copyFileSync;
 try{await assert.rejects(f.installer.disable(mod.id),/游戏正在运行/);}finally{fs.copyFileSync=copy;}
 assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');assert.equal(f.store.get<any>('mod',mod.id).status,'已启用');f.state.running=false;await f.installer.recover();assert.equal(fs.readFileSync(f.target,'utf8'),'user original');assert.equal(f.store.get<any>('mod',mod.id).status,'已停用');
});
test('异步提交回调期间目标被改写，守卫通过也不覆盖用户新内容',async t=>{
 const f=await fixture(t),hash=await f.backup.put(f.report.files[0].source),expected=await hashFile(f.target);let calls=0;
 await assert.rejects(f.backup.restore(hash,f.target,expected,async()=>{calls++;await Promise.resolve();fs.writeFileSync(f.target,'user latest');}),/目标发生变化/);
 assert.equal(calls,1);assert.equal(fs.readFileSync(f.target,'utf8'),'user latest');assert.ok(!fs.readdirSync(path.dirname(f.target)).some(name=>name.includes('.gems-')));
});
test('异步提交回调期间原缺失目标被新增，不能按原null覆盖',async t=>{
 const f=await fixture(t,false),hash=await f.backup.put(f.report.files[0].source);let calls=0;
 await assert.rejects(f.backup.restore(hash,f.target,null,async()=>{calls++;fs.writeFileSync(f.target,'user created');}),/目标发生变化/);
 assert.equal(calls,1);assert.equal(fs.readFileSync(f.target,'utf8'),'user created');assert.ok(!fs.readdirSync(path.dirname(f.target)).some(name=>name.includes('.gems-')));
});
test('unlink最终守卫期间用户改文件，保持新内容并留下待处理事务',async t=>{
 const f=await fixture(t,false),mod=await f.installer.install(f.plan,f.report,approved),tx=f.store.get<Transaction>('transaction',mod.transactionId)!,open=fs.openSync,read=fs.read;let descriptor:number|undefined,armed=false,changed=false;
 f.installer.guard=async()=>{if(armed&&!changed){changed=true;fs.writeFileSync(f.target,'user latest');}};
 fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.target)descriptor=fd;return fd;}) as typeof fs.openSync;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(args[0]===descriptor)armed=true;callback(...result);};return(read as any)(...args);};
 let restored:Transaction;try{restored=await f.installer.restoreTransaction(tx);}finally{fs.openSync=open;(fs as any).read=read;}
 assert.ok(changed);assert.equal(restored!.state,'恢复待处理');assert.match(restored!.error!,/目标发生变化/);assert.equal(f.store.get<Transaction>('transaction',tx.id)!.state,'恢复待处理');assert.equal(tx.state,'已完成');assert.equal(fs.readFileSync(f.target,'utf8'),'user latest');assert.equal(f.store.get<any>('mod',mod.id).status,'已启用');
});
test('恢复提交回调在核验完成/rename前调用一次，非法回调预先拒绝',async t=>{
 const f=await fixture(t),hash=await f.backup.put(f.report.files[0].source),expected=await hashFile(f.target);let calls=0;
 await f.backup.restore(hash,f.target,expected,async()=>{calls++;const temporary=fs.readdirSync(path.dirname(f.target)).filter(name=>name.includes('.gems-'));assert.equal(temporary.length,1);assert.equal(await hashFile(path.join(path.dirname(f.target),temporary[0])),hash);assert.equal(fs.readFileSync(f.target,'utf8'),'user original');await new Promise<void>(resolve=>setImmediate(resolve));});
 assert.equal(calls,1);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');assert.ok(!fs.readdirSync(path.dirname(f.target)).some(name=>name.includes('.gems-')));
 await assert.rejects(f.backup.restore(hash,f.target,hash,{} as any),/无法验证恢复提交条件/);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');
});
test('停用恢复副本准备期间守卫变为运行中，保持已安装字节及状态',async t=>{
 const f=await fixture(t),mod=await f.installer.install(f.plan,f.report,approved),copy=fs.copyFileSync;let changed=false;
 fs.copyFileSync=((...args:any[])=>{const result=(copy as any)(...args);if(String(args[0]).includes(path.sep+'blobs'+path.sep)&&String(args[1]).includes('.gems-')){changed=true;f.state.running=true;}return result;}) as typeof fs.copyFileSync;
 try{await assert.rejects(async()=>{await f.installer.disable(mod.id);t.diagnostic(JSON.stringify({running:f.state.running,target:fs.readFileSync(f.target,'utf8'),status:f.store.get<any>('mod',mod.id).status}));},/游戏正在运行/);}finally{fs.copyFileSync=copy;}
 assert.ok(changed);assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');assert.equal(f.store.get<any>('mod',mod.id).status,'已启用');assert.equal(f.store.list<Transaction>('transaction')[0].state,'恢复待处理');
});
test('恢复新增文件的目标哈希读取期间守卫变化，不能继续unlink',async t=>{
 const f=await fixture(t,false),mod=await f.installer.install(f.plan,f.report,approved),tx=f.store.get<Transaction>('transaction',mod.transactionId)!,read=fs.read,open=fs.openSync;let descriptor:number|undefined,changed=false;
 fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.target)descriptor=fd;return fd;}) as typeof fs.openSync;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(args[0]===descriptor){changed=true;f.state.running=true;}callback(...result);};return(read as any)(...args);};
 let restored:Transaction;try{restored=await f.installer.restoreTransaction(tx);}finally{fs.openSync=open;(fs as any).read=read;}
 t.diagnostic(JSON.stringify({changed,running:f.state.running,state:restored!.state,targetExists:fs.existsSync(f.target)}));assert.ok(changed);assert.equal(restored!.state,'恢复待处理');assert.equal(f.store.get<Transaction>('transaction',tx.id)!.state,'恢复待处理');assert.equal(tx.state,'已完成');assert.equal(fs.readFileSync(f.target,'utf8'),'mod value');assert.equal(f.store.get<any>('mod',mod.id).status,'已启用');
});
