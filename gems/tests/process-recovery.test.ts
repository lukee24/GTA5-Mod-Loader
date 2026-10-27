import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {noLinks} from '../packages/core/security';
import type {Transaction,ModRecord} from '../packages/core/types';

for(const stage of ['partial-write','initial-commit','reenable-commit']){
  test(`实际子进程终止后的持久事务恢复：${stage}`,{timeout:20000},async()=>{
    const base=fs.mkdtempSync(path.join(os.tmpdir(),'gems-process-crash-'));
    const child=spawn(process.execPath,['--import','tsx','tests/crash-worker.ts',base,stage],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe']});
    let errorOutput='';child.stderr.on('data',chunk=>errorOutput+=chunk);
    const ended=new Promise<{code:number|null;signal:string|null}>((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
    let store:Store|undefined;
    try{
      for(let i=0;i<200&&!fs.existsSync(path.join(base,'checkpoint'));i++){
        if(child.exitCode!==null)throw new Error('测试子进程过早退出：'+errorOutput);
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      assert.ok(fs.existsSync(path.join(base,'checkpoint')),'未到达真实写入边界：'+errorOutput);
      assert.equal(fs.readFileSync(path.join(base,'game/mods/file-0.ini'),'utf8'),'新配置 0');
      assert.ok(child.kill(),'未能终止本次测试创建的子进程');
      const exit=await ended;assert.ok(exit.code!==0||exit.signal!==null,'子进程不应正常退出');
      store=await Store.open(path.join(base,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
      const pending=store.list<Transaction>('transaction').filter(tx=>tx.state!=='已回滚');
      assert.equal(pending.length,1);
      const installer=new Installer(store,new Backup(path.join(base,'data/backup')),async()=>{});
      const restored=await installer.recover();assert.equal(restored.length,1);
      for(let i=0;i<4;i++)assert.equal(fs.readFileSync(path.join(base,'game/mods',`file-${i}.ini`),'utf8'),'原配置 '+i);
      assert.ok(store.list<Transaction>('transaction').every(tx=>tx.state==='已回滚'&&tx.changes.every(c=>!c.applied)));
      assert.ok(store.list<ModRecord>('mod').every(mod=>mod.status!=='已启用'));
      assert.equal((await installer.recover()).length,0,'恢复重复执行应幂等');
    }finally{
      if(child.exitCode===null&&child.signalCode===null){child.kill();await ended;}
      store?.close();
      const resolved=path.resolve(base);
      assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));
      assert.ok(path.basename(resolved).startsWith('gems-process-crash-'));
      noLinks(path.parse(resolved).root,resolved);fs.rmSync(resolved,{recursive:true,force:true});
    }
  });
}
