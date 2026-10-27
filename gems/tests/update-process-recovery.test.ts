import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {noLinks} from '../packages/core/security';
import type {ModRecord,Transaction} from '../packages/core/types';

for(const stage of ['partial','removal','before-commit','after-commit'])test('更新实际子进程终止后恢复/提交边界：'+stage,{timeout:20000},async()=>{
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'gems-update-crash-'));
  const child=spawn(process.execPath,['--import','tsx','tests/update-crash-worker.ts',base,stage],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','ignore','pipe']});
  let errors='';child.stderr.on('data',chunk=>{errors+=chunk;});
  const ended=new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  let store:Store|undefined;
  const read=(name:string)=>fs.readFileSync(path.join(base,'game/mods',name),'utf8');
  try{
    for(let i=0;i<250&&!fs.existsSync(path.join(base,'checkpoint'));i++){if(child.exitCode!==null)throw new Error(errors);await new Promise(resolve=>setTimeout(resolve,25));}
    assert.ok(fs.existsSync(path.join(base,'checkpoint')),'未到达更新边界：'+errors);
    assert.equal(read('shared.ini'),'new shared');assert.ok(child.kill());const result=await ended;assert.ok(result.code!==0||result.signal!==null);
    const identity=JSON.parse(fs.readFileSync(path.join(base,'identity.json'),'utf8'));
    store=await Store.open(path.join(base,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
    const installer=new Installer(store,new Backup(path.join(base,'data/backup')),async()=>{});
    const restored=await installer.recover();
    const mod=store.get<ModRecord>('mod',identity.modId)!;
    if(stage==='after-commit'){
      assert.equal(restored.length,0);assert.equal(mod.report.name,'new-version');assert.notEqual(mod.transactionId,identity.oldTransaction);
      assert.equal(read('shared.ini'),'new shared');assert.equal(read('new.ini'),'new only');assert.equal(fs.existsSync(path.join(base,'game/mods/removed.ini')),false);
    }else{
      assert.equal(restored.length,1);assert.equal(mod.report.name,'old-version');assert.equal(mod.transactionId,identity.oldTransaction);
      assert.equal(read('shared.ini'),'old shared');assert.equal(read('removed.ini'),'old only');assert.equal(fs.existsSync(path.join(base,'game/mods/new.ini')),false);
      assert.equal(store.list<Transaction>('transaction').find(item=>item.operation==='update')?.state,'已回滚');
    }
    assert.equal(mod.status,'已启用');assert.equal(read('unrelated.ini'),'other mod original');assert.equal((await installer.recover()).length,0);
    await installer.disable(mod.id,true);assert.equal(read('shared.ini'),'user original');assert.equal(read('unrelated.ini'),'other mod original');
    assert.equal(fs.existsSync(path.join(base,'game/mods/removed.ini')),false);assert.equal(fs.existsSync(path.join(base,'game/mods/new.ini')),false);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){child.kill();await ended;}
    store?.close();const resolved=path.resolve(base);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gems-update-crash-'));noLinks(path.parse(resolved).root,resolved);fs.rmSync(resolved,{recursive:true,force:true});
  }
});
