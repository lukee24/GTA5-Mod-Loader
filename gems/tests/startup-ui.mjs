import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const results=[];
for(const mode of ['environment','document-reject','document-resolve','real-failure']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-startup-ui-'));let app,child;
  try{
    execFileSync(process.execPath,['--import','tsx','tests/startup-seed.ts',root,mode],{windowsHide:true});
    app=await electron.launch({args:['-r',path.resolve('tests/startup-fault.cjs'),'.'],env:{...process.env,GEMS_TEST_DATA:path.join(root,'data'),GEMS_STARTUP_FIXTURE_ROOT:root,GEMS_STARTUP_FIXTURE_MODE:mode,GEMS_STARTUP_FIXTURE_NODE:process.execPath},timeout:15000});
    child=app.process();const until=Date.now()+5000;
    while(!fs.existsSync(path.join(root,'started'))&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,5));
    assert.ok(fs.existsSync(path.join(root,'started')),'没有进入真正的启动阶段');
    const exited=child.exitCode!==null?Promise.resolve():new Promise(resolve=>child.once('exit',resolve));
    if(mode!=='real-failure')await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});
    let timer;try{await Promise.race([exited,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('启动期间关闭未能完成退出')),3000))]);}finally{clearTimeout(timer);}
    const shown=fs.existsSync(path.join(root,'error-box.json'));
    if(shown!==(mode==='real-failure'))fs.writeFileSync('artifacts/startup-ui-initial-error.json',JSON.stringify({mode,notification:shown?JSON.parse(fs.readFileSync(path.join(root,'error-box.json'),'utf8')):null},null,2));
    assert.equal(shown,mode==='real-failure',mode+'：主动退出错误触发了启动失败通知，或真正的失败通知被隐藏');
    if(mode==='real-failure')assert.match(JSON.parse(fs.readFileSync(path.join(root,'error-box.json'),'utf8')).message,/ERR_FILE_NOT_FOUND/);
    if(mode==='environment'){
      const pid=Number(fs.readFileSync(path.join(root,'started'),'utf8'));let alive=true;const untilExit=Date.now()+2500;
      while(alive&&Date.now()<untilExit){try{process.kill(pid,0);await new Promise(resolve=>setTimeout(resolve,10));}catch{alive=false;}}
      assert.equal(alive,false,'启动检测留下了自有夹具子进程');
    }
    assert.ok(fs.existsSync(path.join(root,'data/gems.sqlite')));
    execFileSync(process.execPath,['--import','tsx','tests/startup-seed.ts',root,mode,'verify'],{windowsHide:true});
    results.push({mode,passed:true,startupFailureNotified:shown,databaseRetained:true,databaseReopenedAndVerified:true});
  }finally{
    if(app){if(child?.exitCode===null)await app.evaluate(()=>globalThis.__gemsStartupChild?.kill()).catch(()=>{});await app.close().catch(()=>{});}
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-startup-ui-'));fs.rmSync(root,{recursive:true});
  }
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',fault:'显式测试引导：启动 tasklist 路由到自有 Node；实际 renderer 的启动 Promise 延迟、拒绝或晚到成功；非退出失败由真实 Chromium 读取不存在文件产生 ERR_FILE_NOT_FOUND；启动失败通知记录代替阻塞原生错误框',results,gameWritten:false,systemPolicyChanged:false};
fs.writeFileSync('artifacts/startup-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
