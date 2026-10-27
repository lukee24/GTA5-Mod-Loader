import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';

const results=[];
for(const scenario of ['exit','loaded-exit','user-close','timeout']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-site-lifecycle-ui-'));
  const data=path.join(root,'data'),marker=path.join(root,'load-started');let app,child;
  try{
    app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
    child=app.process();const page=await app.firstWindow();
    await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
    const mainId=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].id);
    // 仅此开发进程故障注入：真实子窗口、IPC、退出路径；不模拟网站响应或改变系统网络。
    await app.evaluate(({BrowserWindow},{marker,scenario})=>{
      const original=BrowserWindow.prototype.loadURL;
      BrowserWindow.prototype.loadURL=function(url,...args){
        if(url.startsWith('https://github.com/')){
          globalThis.__gemsTestSite=this;
          globalThis.__gemsTestSiteSession=this.webContents.session;
          return original.call(this,'about:blank').then(()=>{
            process.getBuiltinModule('node:fs').writeFileSync(marker,'started');
            return new Promise((resolve,reject)=>{globalThis.__gemsTestReleaseSite=resolve;globalThis.__gemsTestRejectSite=reject;});
          });
        }
        return original.call(this,url,...args);
      };
      if(scenario==='timeout'){
        const timeout=AbortSignal.timeout.bind(AbortSignal);
        AbortSignal.timeout=ms=>timeout(ms===45000?150:ms);
      }
    },{marker,scenario});
    const request=page.evaluate(()=>window.gems.call('browseSite',{site:'github'})).then(value=>({value}),error=>({error:String(error)}));
    const until=Date.now()+10000;
    while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
    assert.ok(fs.existsSync(marker),'未进入真实网站子窗口加载路径');
    const security=await app.evaluate(()=>{
      const site=globalThis.__gemsTestSite,preferences=site.webContents.getLastWebPreferences();
      return{nodeIntegration:preferences.nodeIntegration,contextIsolation:preferences.contextIsolation,sandbox:preferences.sandbox,preload:preferences.preload||null};
    });
    assert.deepEqual(security,{nodeIntegration:false,contextIsolation:true,sandbox:true,preload:null});
    let timer;const bounded=(promise,message)=>Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),2500);})]).finally(()=>clearTimeout(timer));
    if(scenario==='exit'||scenario==='loaded-exit'){
      if(scenario==='loaded-exit'){
        await app.evaluate(()=>globalThis.__gemsTestReleaseSite());
        assert.deepEqual((await bounded(request,'加载完成后没有释放操作锁')).value,{ok:true,data:null});
        // 已打开远程页面的 beforeunload 不应阻止整个桌面程序退出。
        await bounded(app.evaluate(async()=>globalThis.__gemsTestSite.webContents.executeJavaScript('window.onbeforeunload=()=>false; null')),'已打开测试页面未能安装 beforeunload 夹具');
      }
      const exited=new Promise(resolve=>child.once('exit',resolve));
      await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).close(),mainId).catch(()=>{});
      await bounded(exited,'网站加载阻塞导致主窗口无法退出');await request;
    }else{
      if(scenario==='user-close')await app.evaluate(()=>globalThis.__gemsTestSite.close());
      const response=await bounded(request,'网站加载取消/超时没有释放操作锁');
      if(scenario==='user-close')assert.deepEqual(response.value,{ok:true,data:{canceled:true}});
      else {assert.equal(response.value.ok,false);assert.match(response.value.error,/网站加载超时/);}
      assert.equal(await app.evaluate(()=>globalThis.__gemsTestSite.isDestroyed()),true);
      assert.equal(await app.evaluate(()=>globalThis.__gemsTestSiteSession.listenerCount('will-download')),0);
      // 通过另一个真正需要操作锁的 IPC 验证解锁，并确认迟到拒绝不会再锁住或退出。
      assert.equal((await page.evaluate(()=>window.gems.call('settings',{reduceMotion:true}))).ok,true);
      await app.evaluate(()=>globalThis.__gemsTestRejectSite(new Error('迟到的网站加载拒绝')));
      assert.equal((await page.evaluate(()=>window.gems.call('settings',{reduceMotion:false}))).ok,true);
      await app.close();
    }
    assert.ok(fs.existsSync(path.join(data,'gems.sqlite')));
    results.push({scenario,passed:true,isolatedBrowserSecurity:security,databaseRetained:true});
  }finally{
    if(app){
      if(child?.exitCode===null)await app.evaluate(()=>{globalThis.__gemsTestReleaseSite?.();globalThis.__gemsTestSite?.destroy();}).catch(()=>{});
      await app.close().catch(()=>{});
    }
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('gems-site-lifecycle-ui-'));
    fs.rmSync(root,{recursive:true});
  }
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',fault:'仅测试进程内初次 loadURL Promise 不返回；超时测试将 45 秒时钟缩短到 150 毫秒',results,automaticGameWrite:false,realWebsiteTimeoutMeasured:false};
fs.writeFileSync('artifacts/site-lifecycle-ui-current.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify(evidence,null,2));
