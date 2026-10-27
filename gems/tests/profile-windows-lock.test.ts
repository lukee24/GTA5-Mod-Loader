import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
import {Profiles} from '../packages/profiles';import {profileFixture,approval} from './profile-fixture';

async function lockFile(target:string,releaseFile:string){
 const script="$ErrorActionPreference='Stop'; $handle=[System.IO.File]::Open($env:GEMS_LOCK_TARGET,[System.IO.FileMode]::Open,[System.IO.FileAccess]::ReadWrite,[System.IO.FileShare]::None); try { [Console]::Out.WriteLine('GEMS_FILE_LOCKED'); [Console]::Out.Flush(); while (-not (Test-Path -LiteralPath $env:GEMS_LOCK_RELEASE)) { Start-Sleep -Milliseconds 30 } } finally { $handle.Dispose() }";
 const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,env:{...process.env,GEMS_LOCK_TARGET:target,GEMS_LOCK_RELEASE:releaseFile},stdio:['ignore','pipe','pipe']});
 let output='',errors='',readyResolve:()=>void=()=>{};const ready=new Promise<void>(resolve=>{readyResolve=resolve;});child.stdout.on('data',data=>{output+=data;if(output.includes('GEMS_FILE_LOCKED'))readyResolve();});child.stderr.on('data',data=>{errors+=data;});
 const ended=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});let timer:ReturnType<typeof setTimeout>|undefined;
 try{await Promise.race([ready,ended.then(code=>{throw new Error('独占锁子进程提前退出 '+code+' '+errors);}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Windows独占锁未就绪 '+errors)),10000);})]);}
 catch(error){if(child.exitCode===null&&child.signalCode===null)child.kill();await ended.catch(()=>{});throw error;}finally{clearTimeout(timer);}
 return async()=>{fs.writeFileSync(releaseFile,'release');let timeout:ReturnType<typeof setTimeout>|undefined;try{const result=await Promise.race([ended,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{child.kill();reject(new Error('独占锁子进程未正常关闭'));},10000);})]);assert.equal(result,0,errors);}finally{clearTimeout(timeout);if(child.exitCode===null&&child.signalCode===null){child.kill();await ended.catch(()=>{});}}};
}

test('Windows真实独占句柄：预览后文件占用拒绝切换，释放后可重新预览恢复',{skip:process.platform!=='win32',timeout:30000},async t=>{
 const f=await profileFixture(t);await f.install('locked',{'mods/shared.ini':'managed'});const off=f.create('off',[]),plan=await f.profiles.planSwitch(off.id),mods=f.store.list('mod'),transactions=f.store.list('transaction');
 const release=await lockFile(path.join(f.game,'mods/shared.ini'),path.join(f.root,'release'));try{
  assert.throws(()=>fs.readFileSync(path.join(f.game,'mods/shared.ini')),/EBUSY|EPERM|EACCES/i);
  await assert.rejects(f.profiles.execute(plan.id,approval));assert.deepEqual(f.store.list('mod'),mods);assert.deepEqual(f.store.list('transaction'),transactions);assert.equal(f.store.list('profile-switch').length,0);
 }finally{await release();}
 assert.equal(f.read('mods/shared.ini'),'managed');await f.activate(off.id);assert.equal(f.read('mods/shared.ini'),'original shared');assert.equal(f.read('mods/private.ini'),'user unowned');
});

test('Windows真实独占句柄：部分切换后占用下一目标保留待恢复，释放后完整复核',{skip:process.platform!=='win32',timeout:30000},async t=>{
 const f=await profileFixture(t);await f.install('locked',{'mods/a.ini':'added','mods/shared.ini':'managed'});const off=f.create('off',[]),mods=f.store.list('mod'),transactions=f.store.list('transaction');let needLock=false,release:(()=>Promise<void>)|undefined;
 const service=new Profiles(f.installer,()=>f.game,async game=>{if(needLock&&!release)release=await lockFile(path.join(game,'mods/shared.ini'),path.join(f.root,'release'));await f.guard();});
 const plan=await service.planSwitch(off.id);f.installer.progress=message=>{if(message.startsWith('正在切换'))needLock=true;};
 try{await assert.rejects(service.execute(plan.id,approval),/恢复待处理/);assert.ok(release,'首个文件已变化后应确实取得下一目标的独占锁');assert.equal(service.pending().length,1);assert.deepEqual(f.store.list('mod'),mods);assert.deepEqual(f.store.list('transaction'),transactions);assert.equal(f.read('mods/a.ini'),'added');}
 finally{if(release)await release();}
 f.installer.progress=()=>{};const result=await f.profiles.recover();assert.equal(result[0].state,'rolled-back');assert.equal(f.profiles.pending().length,0);assert.equal(f.read('mods/shared.ini'),'managed');assert.equal(f.read('mods/a.ini'),'added');assert.equal(f.read('mods/private.ini'),'user unowned');assert.deepEqual(f.store.list('mod'),mods);assert.deepEqual(f.store.list('transaction'),transactions);
});
