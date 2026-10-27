import {_electron as electron} from 'playwright';
import {firstElectronWindow} from './electron-window.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,limit=2*1024*1024;
const artifact=path.resolve('artifacts',process.env.GEMS_TEST_ARTIFACT||`${version}-bridge-catalog-boundaries-ui`),results=[],errors=[];
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['tests/bridge-catalog-boundaries-ui.mjs','tests/bridge-catalog-boundaries-seed.ts',...(process.env.GEMS_PACKAGED_EXE?[path.resolve(process.env.GEMS_PACKAGED_EXE)]:['dist/main.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)])];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(file)])),testedSha256=hashes();
fs.mkdirSync(path.dirname(artifact),{recursive:true});
for(const mode of ['long','compact','duplicate','count','bytes']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-bridge-boundaries-')),output=path.join(root,'已有目录.json'),logOutput=path.join(root,'错误日志.json');
 const seed=action=>JSON.parse(execFileSync(process.execPath,['--import','tsx','tests/bridge-catalog-boundaries-seed.ts',root,mode,action],{encoding:'utf8',windowsHide:true}));
 let app,page,passed=false;
 async function call(command,args){const r=await page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);assert.equal(r.ok,true,r.error);return r.data;}
 async function settle(){await page.waitForFunction(()=>!document.querySelector('.assistant-page .toolbar button:last-child').disabled);}
 async function counters(){return await app.evaluate(()=>globalThis.__bridgeBoundarySurfaces);}
 try{
  const seeded=seed('seed'),meta=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8'));fs.writeFileSync(output,'previous user-owned output fixture');const originalOutput=sha(output);
  app=await electron.launch({...(process.env.GEMS_PACKAGED_EXE?{executablePath:process.env.GEMS_PACKAGED_EXE,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:meta.data},timeout:30000});
  page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push({mode,message:error.message}));await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();assert.equal((await call('state')).version,version);
  await app.evaluate(({dialog,shell},{output})=>{globalThis.__bridgeBoundarySurfaces={save:0,open:0,confirm:0,shell:0,cancel:true,output};dialog.showSaveDialog=async()=>{const s=globalThis.__bridgeBoundarySurfaces;s.save++;return{canceled:s.cancel,filePath:s.output};};dialog.showOpenDialog=async()=>{globalThis.__bridgeBoundarySurfaces.open++;return{canceled:true,filePaths:[]};};dialog.showMessageBox=async()=>{globalThis.__bridgeBoundarySurfaces.confirm++;return{response:0};};shell.openExternal=async()=>{globalThis.__bridgeBoundarySurfaces.shell++;throw new Error('Unexpected external launch');};shell.openPath=async()=>{globalThis.__bridgeBoundarySurfaces.shell++;throw new Error('Unexpected external path');};},{output});
  await page.locator('nav').getByRole('button',{name:'游戏助手',exact:true}).click();await page.locator('.assistant-page').waitFor();
  const before=seed('inspect'),initialState=await call('state'),exportButton=page.getByRole('button',{name:'导出数据库目录（待游戏测试）',exact:true});
  assert.deepEqual(initialState.mods,meta.mods.toReversed());assert.equal(initialState.settings.gamePath,'');assert.deepEqual(initialState.transactions,meta.transactions.toReversed());
  const invariant=async()=>{const current=seed('inspect'),state=await call('state');assert.equal(current.modSha256,before.modSha256);assert.equal(current.nonLogSha256,before.nonLogSha256);assert.deepEqual(state.mods,initialState.mods);assert.deepEqual(state.transactions,initialState.transactions);assert.deepEqual(state.settings,initialState.settings);return current;};
  let details={};
  if(['long','compact'].includes(mode)){
   await exportButton.click();await settle();assert.equal((await counters()).save,1);assert.equal(sha(output),originalOutput);await invariant();
   await app.evaluate(()=>{globalThis.__bridgeBoundarySurfaces.cancel=false;});await exportButton.click();await settle();assert.equal((await counters()).save,2);
   const raw=fs.readFileSync(output,'utf8'),value=JSON.parse(raw),record=meta.mods[0];assert.ok(Buffer.byteLength(raw)<=limit);assert.equal(value.vehicles.length,record.report.spawnNames.length);
   for(const [index,item]of value.vehicles.entries())assert.deepEqual(item,{id:record.id+':'+record.report.spawnNames[index],name:record.report.name,brand:record.metadata.brand,spawnName:record.report.spawnNames[index],dlcName:'',enabled:false,installState:'prepared',requiresGameRestart:true});
   assert.equal(value.requiresGameRestart,true);assert.deepEqual(value.peds,[]);assert.deepEqual(value.properties,[]);
   if(mode==='compact'){assert.equal(raw,JSON.stringify(value));assert.ok(Buffer.byteLength(JSON.stringify(value,null,2))>limit);}else{assert.equal(value.vehicles[0].id.length,145);assert.equal(value.vehicles[0].name.length,300);}
   fs.copyFileSync(output,artifact+'-'+mode+'-catalog.json');const savedHash=sha(output);await invariant();
   await app.evaluate(()=>{globalThis.__bridgeBoundarySurfaces.cancel=true;});await exportButton.click();await settle();assert.equal(sha(output),savedHash);assert.equal((await counters()).save,3);assert.deepEqual((await invariant()).logs,before.logs);
   details={outputBytes:Buffer.byteLength(raw),prettyBytes:Buffer.byteLength(JSON.stringify(value,null,2)),outputSha256:savedHash,records:value.vehicles.length,cancelPreservedBeforeAndAfter:true};
  }else{
   const expected=mode==='duplicate'?/重复/:mode==='count'?/2000/:/2MiB/;
   for(let attempt=0;attempt<2;attempt++){
    await exportButton.click();const feedback=page.getByRole('alertdialog',{name:'操作反馈'});await feedback.waitFor();const message=await feedback.innerText();assert.match(message,expected);assert.equal((await counters()).save,0);assert.equal(sha(output),originalOutput);const current=await invariant();assert.equal(current.logs.length,before.logs.length+attempt+1);assert.ok(current.logs.every(log=>log.kind==='错误'&&expected.test(log.message)));
    await feedback.getByRole('button',{name:'知道了',exact:true}).click();await settle();
   }
   await app.evaluate(({},logOutput)=>{globalThis.__bridgeBoundarySurfaces.cancel=false;globalThis.__bridgeBoundarySurfaces.output=logOutput;},logOutput);
   await page.locator('nav').getByRole('button',{name:'日志与帮助',exact:true}).click();await page.getByRole('button',{name:'刷新日志',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.logs>div').length===2);await page.getByRole('button',{name:'导出日志',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent.includes('导出日志')&&!button.disabled));
   const logs=JSON.parse(fs.readFileSync(logOutput,'utf8'));assert.equal(logs.entries.length,2);assert.ok(logs.entries.every(log=>log.kind==='错误'&&expected.test(log.message)));assert.equal((await counters()).save,1);assert.equal(sha(output),originalOutput);await invariant();
   details={rejectedBeforeSaveDialog:true,repeatedRejectionCount:2,diagnosticLogsAdded:2,nonLogRecordsUnchanged:true,followingLogExportSucceeded:true,existingOutputSha256:originalOutput};
  }
  const native=await counters();assert.equal(native.open,0);assert.equal(native.confirm,0);assert.equal(native.shell,0);await page.screenshot({path:artifact+'-'+mode+'.png'});
  const beforeClose=seed('inspect');await app.close();app=undefined;const afterClose=seed('inspect');assert.deepEqual(afterClose,beforeClose);results.push({mode,seeded,native:{save:native.save,open:native.open,confirm:native.confirm,shell:native.shell},...details});passed=true;
 }catch(error){console.error(JSON.stringify({mode,fixtureRetained:root,error:String(error)}));if(page)await page.screenshot({path:artifact+'-'+mode+'-failure.png'}).catch(()=>{});throw error;}
 finally{if(app)await app.close().catch(()=>{});if(passed){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-bridge-boundaries-'));fs.rmSync(root,{recursive:true});}}
}
assert.deepEqual(errors,[]);assert.deepEqual(hashes(),testedSha256);const evidence={checked:new Date().toISOString(),applicationVersion:version,testedSha256,results,errors,substitutions:['有效ModRecord及通过schema/ownership校验的匹配合成事务直接播种隔离SQLite；没有执行安装、创建受管文件或绑定游戏路径','仅保存/选择/确认对话框与shell替换为隔离路径、计数及阻止外部启动；未替换产品导出校验/序列化/IPC/数据库'],gameplayVerified:false,realGameWritten:false,databaseScope:'模组及其他非log记录保持不变；拒绝操作允许新增明确错误日志；关闭允许保存窗口位置'};fs.writeFileSync(artifact+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
