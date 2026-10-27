import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
const results=[];
for(const scenario of ['timeout','exit']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-http-deadline-ui-'));
  const marker=path.join(root,'connection-started');let app,child;
  try{
    app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:root},timeout:30000});
    child=app.process();const page=await app.firstWindow();page.setDefaultTimeout(10000);
    await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
    // 独立开发进程内故障注入：真实 Node ClientRequest/Agent，连接回调不返回。
    await app.evaluate((_electron,{marker,scenario})=>{
      const https=process.getBuiltinModule('node:https'),dns=process.getBuiltinModule('node:dns/promises'),fs=process.getBuiltinModule('node:fs');
      dns.lookup=()=>Promise.resolve([{address:'140.82.112.3',family:4}]);
      const agent=new https.Agent(),get=https.get;
      agent.createConnection=(_options,callback)=>{globalThis.__gemsTestConnectionCallback=callback;fs.writeFileSync(marker,'started');return undefined;};
      https.get=(target,options,callback)=>{
        const object=target instanceof URL?{...options,hostname:target.hostname,path:target.pathname+target.search}:target;
        const request=get({...object,agent},target instanceof URL?callback:options);globalThis.__gemsTestConnectionRequest=request;return request;
      };
      if(scenario==='timeout'){
        const timeout=setTimeout;globalThis.setTimeout=(fn,ms,...args)=>timeout(fn,ms===30000?150:ms,...args);
      }
    },{marker,scenario});
    await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();
    await page.getByLabel('GitHub 仓库').fill('Chiheb-Bacha/ScriptHookVDotNetEnhanced');
    await page.getByRole('button',{name:'读取发布包',exact:true}).click();
    const until=Date.now()+10000;while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,5));
    assert.ok(fs.existsSync(marker));
    if(scenario==='timeout'){
      const alert=page.getByRole('alertdialog').filter({hasText:'网站连接或响应头等待超时'});await alert.waitFor();
      const market=await page.evaluate(()=>window.gems.call('market'));assert.equal(market.ok,true);assert.equal(market.data.checked,null);assert.deepEqual(market.data.assets,[]);
      assert.equal(await app.evaluate(()=>globalThis.__gemsTestConnectionRequest.destroyed),true);
      fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/http-deadline-real.png'});
      await alert.getByRole('button',{name:'知道了',exact:true}).click();
      assert.equal((await page.evaluate(()=>window.gems.call('settings',{reduceMotion:true}))).ok,true);
      await app.evaluate(()=>globalThis.__gemsTestConnectionCallback(new Error('测试连接晚到失败')));
      assert.equal((await page.evaluate(()=>window.gems.call('settings',{reduceMotion:false}))).ok,true);
      await app.close();
    }else{
      const exited=new Promise(resolve=>child.once('exit',resolve));
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});
      let timer;try{await Promise.race([exited,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('未分配 socket 的 HTTP 请求阻止退出')),2500))]);}finally{clearTimeout(timer);}
    }
    assert.ok(fs.existsSync(path.join(root,'gems.sqlite')));results.push({scenario,passed:true,databaseRetained:true});
  }finally{
    if(app){if(child?.exitCode===null)await app.evaluate(()=>globalThis.__gemsTestConnectionCallback?.(new Error('结束测试夹具'))).catch(()=>{});await app.close().catch(()=>{});}
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-http-deadline-ui-'));fs.rmSync(root,{recursive:true});
  }
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',fault:'测试 Agent 不提供 socket；仅测试进程把 30 秒截止计时缩为 150 毫秒，未修改系统网络',results,automaticGameWrite:false,realTCPTimeoutMeasured:false};
fs.writeFileSync('artifacts/http-deadline-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
