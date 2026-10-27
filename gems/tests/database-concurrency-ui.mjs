import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
const results=[];
for(const mode of ['edited','wal']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-ui-')),file=path.join(root,'data/gems.sqlite');let app,child,native;
  try{
    execFileSync(process.execPath,['--import','tsx','tests/database-ui-seed.ts',root,'normal'],{windowsHide:true});
    if(mode==='wal'){
      native=new DatabaseSync(file);native.exec('PRAGMA journal_mode=WAL;PRAGMA wal_autocheckpoint=0;');native.prepare('INSERT INTO documents VALUES(?,?,?)').run('external','committed',JSON.stringify({value:'外部真实 WAL 提交'}));
      const before=fs.readFileSync(file),wal=fs.readFileSync(file+'-wal');assert.ok(wal.length>0);
      try{app=await electron.launch({args:['-r',path.resolve('tests/database-error-capture.cjs'),'.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data'),GEMS_DB_FIXTURE_ROOT:root},timeout:10000});child=app.process();}catch{}
      const until=Date.now()+5000;while(!fs.existsSync(path.join(root,'notice.json'))&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
      assert.ok(fs.existsSync(path.join(root,'notice.json')));assert.match(JSON.parse(fs.readFileSync(path.join(root,'notice.json'),'utf8')).message,/数据库.*SQLite 日志/);
      if(app&&child.exitCode===null){let timer;try{await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('WAL 拒绝后未退出')),3000))]);}finally{clearTimeout(timer);}}
      assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(file+'-wal'),wal);results.push({mode,passed:true,realNativeWAL:true,startupRejected:true,originalAndWALUnchanged:true});
    }else{
      app=await electron.launch({args:['-r',path.resolve('tests/database-error-capture.cjs'),'.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data'),GEMS_DB_FIXTURE_ROOT:root},timeout:10000});child=app.process();const page=await app.firstWindow();await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
      // Real independent SQLite engine commits while GEMS holds its own memory image.
      native=new DatabaseSync(file);const settings=JSON.parse(native.prepare('SELECT json FROM documents WHERE kind=? AND id=?').get('settings','main').json);settings.theme='light';native.prepare('UPDATE documents SET json=? WHERE kind=? AND id=?').run(JSON.stringify(settings),'settings','main');native.prepare('INSERT INTO documents VALUES(?,?,?)').run('external','committed',JSON.stringify({value:'外部实际修改'}));native.close();native=null;
      const external=fs.readFileSync(file);
      await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption('light');
      const alert=page.getByRole('alertdialog').filter({hasText:'数据库文件已被其他程序更改'});await alert.waitFor();
      const state=await page.evaluate(()=>window.gems.call('state'));assert.equal(state.data.settings.theme,'dark');assert.deepEqual(fs.readFileSync(file),external);
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/database-external-change-real.png'});
      await alert.getByRole('button',{name:'知道了',exact:true}).click();
      const exited=new Promise(resolve=>child.once('exit',resolve));await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});
      let timer;try{await Promise.race([exited,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('外部更改后正常退出被阻塞')),3000))]);}finally{clearTimeout(timer);}
      assert.deepEqual(fs.readFileSync(file),external);assert.equal(fs.existsSync(path.join(root,'notice.json')),false);
      assert.match(fs.readFileSync(path.join(root,'data/operations.jsonl'),'utf8'),/数据库未保存，仅文件日志/);
      app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data')},timeout:10000});child=app.process();const reopened=await app.firstWindow();await reopened.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
      assert.equal((await reopened.evaluate(()=>window.gems.call('state'))).data.settings.theme,'light');await app.close();
      native=new DatabaseSync(file,{readOnly:true});assert.deepEqual(JSON.parse(native.prepare('SELECT json FROM documents WHERE kind=? AND id=?').get('external','committed').json),{value:'外部实际修改'});native.close();native=null;
      results.push({mode,passed:true,realNativeCommit:true,saveRefused:true,exitPreservedExternalBytes:true,fallbackFileLog:true,actualRestart:true});
    }
  }finally{if(app)await app.close().catch(()=>{});native?.close();assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-ui-'));fs.rmSync(root,{recursive:true});}
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',scope:'Node 内置原生 SQLite 真实外部提交/WAL；GEMS 使用实际 SQL.js/IPC；启动错误通知记录代替原生框',results,gameWritten:false,systemPolicyChanged:false};fs.writeFileSync('artifacts/database-concurrency-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
