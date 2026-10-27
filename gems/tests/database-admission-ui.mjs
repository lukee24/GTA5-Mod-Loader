import {_electron as electron} from 'playwright';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const results=[];
for(const mode of ['ambiguous','missing','normal']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-ui-'));let app,child;
  try{
    execFileSync(process.execPath,['--import','tsx','tests/database-ui-seed.ts',root,mode],{windowsHide:true});
    const file=path.join(root,'data/gems.sqlite'),before=fs.readFileSync(file);let launchError=null;
    try{app=await electron.launch({args:['-r',path.resolve('tests/database-error-capture.cjs'),'.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data'),GEMS_DB_FIXTURE_ROOT:root},timeout:10000});child=app.process();}catch(error){launchError=String(error);}
    if(mode==='normal'){
      assert.ok(app,launchError||'正常数据库无法启动');const page=await app.firstWindow();await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
      await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption('light');await app.close();app=null;
      app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data')},timeout:10000});child=app.process();
      const reopened=await app.firstWindow();await reopened.getByRole('heading',{name:'你的模组工作空间'}).waitFor();const state=await reopened.evaluate(()=>window.gems.call('state'));
      assert.equal(state.ok,true);assert.equal(state.data.settings.theme,'light');assert.equal(state.data.mods.length,0);assert.equal(fs.existsSync(path.join(root,'notice.json')),false);await app.close();
      results.push({mode,passed:true,actualSettingsRestart:true});
    }else{
      const until=Date.now()+5000;while(!fs.existsSync(path.join(root,'notice.json'))&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
      assert.ok(fs.existsSync(path.join(root,'notice.json')),'启动拒绝缺少中文错误通知');const notice=JSON.parse(fs.readFileSync(path.join(root,'notice.json'),'utf8'));assert.match(notice.message,/数据库.*保留原文件/);
      if(app&&child.exitCode===null){let timer;try{await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('数据库拒绝后进程未退出')),3000))]);}finally{clearTimeout(timer);}}
      assert.deepEqual(fs.readFileSync(file),before);results.push({mode,passed:true,startupRejected:true,originalBytesUnchanged:true,notificationCalled:true});
    }
  }finally{if(app)await app.close().catch(()=>{});assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-ui-'));fs.rmSync(root,{recursive:true});}
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',scope:'真实 SQLite 文件；异常启动通知调用由测试记录器观察，未验收原生错误框视觉',results,gameWritten:false,systemPolicyChanged:false};
fs.writeFileSync('artifacts/database-admission-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
