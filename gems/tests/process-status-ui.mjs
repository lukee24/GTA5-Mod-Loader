import {_electron as electron} from 'playwright';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
const game='E:/SteamLibrary/steamapps/common/Grand Theft Auto V Enhanced',results=[];
for(const scenario of ['unknown','exit']){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-process-status-ui-'));
  const data=path.join(root,'data'),marker=path.join(root,'command-started');let app,child;
  try{
    app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});child=app.process();
    const page=await app.firstWindow();await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
    await app.evaluate(({dialog},{game,scenario,marker,node})=>{
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[game]});
      const cp=process.getBuiltinModule('node:child_process'),symbol=Symbol.for('nodejs.util.promisify.custom'),original=cp.execFile[symbol],fs=process.getBuiltinModule('node:fs');
      cp.execFile[symbol]=(file,args,options)=>{
        if(!file.toLowerCase().endsWith('tasklist.exe'))return original(file,args,options);
        if(scenario==='unknown')return Promise.reject(new Error('仅测试进程：tasklist 检测失败'));
        const pending=original(node,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],options);
        globalThis.__gemsTestCommand=pending.child;
        pending.child.stdout.once('data',()=>fs.writeFileSync(marker,String(pending.child.pid)));
        return pending;
      };
    },{game,scenario,marker,node:process.execPath});
    if(scenario==='unknown'){
      const selected=await page.evaluate(()=>window.gems.call('chooseGame'));
      assert.equal(selected.ok,true);assert.equal(selected.data.environment.valid,true);assert.equal(selected.data.environment.running,null);
      assert.ok(selected.data.environment.components.some(item=>item.name==='游戏进程'&&item.status==='未知'));
      await page.reload();await page.getByText('进程状态未知',{exact:true}).waitFor();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
      fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/process-unknown-real.png'});
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));
      await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption('light');
      await page.locator('nav').getByRole('button',{name:'首页',exact:true}).click();await page.getByText('进程状态未知',{exact:true}).waitFor();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
      assert.equal(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2),false);
      await page.screenshot({path:'artifacts/ui/process-unknown-1024-light.png'});
      const source=path.join(root,'mod/scripts');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'gems-guard-fixture.ini'),'fixture=1');
      const imported=await page.evaluate(source=>window.gems.call('import',{paths:[source]}),path.dirname(source));assert.equal(imported.ok,true);
      const planned=await page.evaluate(id=>window.gems.call('plan',{id}),imported.data.state.imports[0].id);
      assert.equal(planned.ok,false);assert.match(planned.error,/无法确认游戏进程/);
      const state=await page.evaluate(()=>window.gems.call('state'));assert.equal(state.data.transactions.length,0);assert.equal(state.data.mods.length,0);
      await app.close();
      // 无故障重启：原始 tasklist/版本读取后端，实际 E 盘只读。没有替换真实进程信息。
      app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});child=app.process();
      const reopened=await app.firstWindow();await reopened.getByText('游戏正在运行',{exact:true}).waitFor();
      const actual=await reopened.evaluate(()=>window.gems.call('state'));assert.equal(actual.data.environment.running,true);assert.equal(actual.data.environment.version,'1.0.1158.16');
      await app.close();results.push({scenario,passed:true,unknownShown:true,installPlanBlocked:true,actualReadonlyRestart:true});
    }else{
      const request=page.evaluate(()=>window.gems.call('chooseGame')).catch(()=>null);
      const until=Date.now()+10000;while(!fs.existsSync(marker)&&Date.now()<until)await new Promise(r=>setTimeout(r,5));assert.ok(fs.existsSync(marker));
      const fixturePID=Number(fs.readFileSync(marker,'utf8'));assert.ok(Number.isInteger(fixturePID)&&fixturePID>0);
      const exited=new Promise(resolve=>child.once('exit',resolve));
      await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});
      let timer;try{await Promise.race([exited,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('只读检测子进程阻塞窗口退出')),2500))]);}finally{clearTimeout(timer);}await request;
      // 确认仅测试启动的 Node 子进程已结束，绝不终止真实游戏。
      let alive=true;const untilExit=Date.now()+2500;
      while(alive&&Date.now()<untilExit){try{process.kill(fixturePID,0);await new Promise(r=>setTimeout(r,10));}catch{alive=false;}}
      assert.equal(alive,false,'退出留下检测夹具子进程');results.push({scenario,passed:true,fixtureProcessExited:true});
    }
    assert.ok(fs.existsSync(path.join(data,'gems.sqlite')));
  }finally{
    if(app){if(child?.exitCode===null)await app.evaluate(()=>globalThis.__gemsTestCommand?.kill()).catch(()=>{});await app.close().catch(()=>{});}
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-process-status-ui-'));fs.rmSync(root,{recursive:true});
  }
}
const evidence={checked:new Date().toISOString(),desktop:'actual Electron',fault:'仅测试进程内 tasklist 失败/固定只读命令路由到自有 Node 等待夹具，退出真实终止该子进程',results,gameWritten:false,gameplayTest:'not-completed'};
fs.writeFileSync('artifacts/process-status-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
