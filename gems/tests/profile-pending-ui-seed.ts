import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {Profiles} from '../packages/profiles';
import type {Journal} from '../packages/profiles/records';
import {scan} from '../packages/scanner';
import {bindGameSettings} from '../packages/core/settings';
import type {Transaction} from '../packages/core/types';

// Seeder-only failure injection. The Electron test runs the unchanged product
// guard, process inspection, launcher gate, IPC, recovery and persistent store.
const [directory,mode,action]=process.argv.slice(2),root=path.resolve(directory);
assert.equal(path.dirname(root),path.resolve(os.tmpdir()));
assert.ok(path.basename(root).startsWith('gems-profile-pending-ui-'));
assert.ok(['automatic','blocked'].includes(mode));
const data=path.join(root,'data'),game=path.join(root,'中文 game'),otherGame=path.join(root,'另一 合成 game');
const write=(file:string,value:string|Buffer)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
function syntheticGame(folder:string){const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);write(path.join(folder,'GTA5_Enhanced.exe'),pe);const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);write(path.join(folder,'update/update.rpf'),rpf);}
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
try{
 if(action==='verify'){
  const meta=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8'));
  const journals=store.list<Journal>('profile-switch');assert.equal(journals.length,1);assert.equal(journals[0].state,'rolled-back');assert.ok(journals[0].files.every(f=>!f.applied));
  assert.equal(store.get<Transaction>('transaction',meta.otherTransactionId)?.state,'已回滚');
  assert.equal(JSON.stringify(store.get('mod',meta.modId)),JSON.stringify(meta.mod));
  assert.equal(fs.readFileSync(path.join(game,'mods/a.ini'),'utf8'),'managed a');
  assert.equal(fs.readFileSync(path.join(game,'mods/shared.ini'),'utf8'),'managed shared');
  assert.equal(fs.readFileSync(path.join(game,'mods/private.ini'),'utf8'),'user unowned');
  assert.equal(fs.readFileSync(path.join(otherGame,'mods/probe.ini'),'utf8'),'second original');
  console.log(JSON.stringify({mode,databaseReopened:true,profile:'rolled-back',ordinary:'已回滚',ownershipUnchanged:true}));
 }else{
  syntheticGame(game);syntheticGame(otherGame);write(path.join(game,'mods/shared.ini'),'original shared');write(path.join(game,'mods/private.ini'),'user unowned');
  const backup=new Backup(path.join(data,'backup'));let running=false;
  const guard=async()=>{if(running)throw new Error('seeder: 模拟游戏运行，故意保留恢复账本');};
  const installer=new Installer(store,backup,guard),profiles=new Profiles(installer,()=>game,guard);
  const source=path.join(root,'受管样本');write(path.join(source,'a.ini'),'managed a');write(path.join(source,'shared.ini'),'managed shared');
  write(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name:'待恢复样本',version:'1',files:[{source:'a.ini',target:'mods/a.ini'},{source:'shared.ini',target:'mods/shared.ini'}]}));
  const report=await scan(source,data),mod=await installer.install(await installer.plan(report,game),report,{overwrite:true,binary:true});store.put('import',report.id,report);bindGameSettings(store,game);
  // A different game's ordinary pending transaction is included in the profile
  // catalogue digest. Recovering it first would invalidate profile recovery.
  const probe=path.join(otherGame,'mods/probe.ini');write(probe,'second original');const before=await backup.put(probe);write(probe,'interrupted other');const after=await backup.put(probe);
  const other:Transaction={id:'ordinary-order-probe',name:'第二目录启动顺序探针',modId:'uncommitted-order-probe',gamePath:otherGame,created:new Date().toISOString(),state:'执行中',changes:[{target:'mods/probe.ini',before,after,applied:true}]};store.put('transaction',other.id,other);
  const profile=profiles.create({name:'中断空方案',gamePath:game,modIds:[]}),plan=await profiles.planSwitch(profile.id);assert.deepEqual(plan.blockers,[]);
  installer.progress=message=>{if(message.startsWith('正在切换'))running=true;};
  await assert.rejects(profiles.execute(plan.id,{confirmed:true,binary:true}),/恢复待处理.*模拟游戏运行/);
  const journal=store.list<Journal>('profile-switch')[0];assert.equal(journal.state,'recovery-required');assert.equal(journal.files.filter(f=>f.applied).length,1);
  const applied=journal.files.find(f=>f.applied)!;assert.equal(applied.target,'mods/a.ini');assert.equal(applied.after,null);assert.equal(fs.existsSync(path.join(game,applied.target)),false);
  if(mode==='blocked')write(path.join(game,applied.target),'external user edit');
  const meta={mode,game,otherGame,data,modId:mod.id,mod,reportId:report.id,profileId:profile.id,journalId:journal.id,otherTransactionId:other.id,repairTarget:applied.target,knownOutput:applied.after};
  write(path.join(root,'fixture.json'),JSON.stringify(meta,null,2));console.log(JSON.stringify({mode,profilePending:1,ordinaryPending:1,firstTarget:applied.target,seederGuardOnly:true}));
 }
}finally{store.db.close();}
