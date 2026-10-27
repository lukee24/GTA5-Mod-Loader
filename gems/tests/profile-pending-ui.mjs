import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {firstElectronWindow} from './electron-window.mjs';

const artifact=path.resolve('artifacts/0.1.79-profile-pending-ui'),checks=[],results=[],errors=[];
const testedFiles=['tests/profile-pending-ui-seed.ts','tests/profile-pending-ui.mjs',...(process.env.GEMS_PACKAGED_EXE?[path.resolve(process.env.GEMS_PACKAGED_EXE)]:['dist/main.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)])];
const hashes=()=>Object.fromEntries(testedFiles.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')])),testedSha256=hashes();
fs.mkdirSync(path.dirname(artifact),{recursive:true});let version;
for(const mode of ['automatic','blocked']){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-profile-pending-ui-'));let app,page,passed=false;
 const seed=action=>execFileSync(process.execPath,['--import','tsx','tests/profile-pending-ui-seed.ts',root,mode,...(action?[action]:[])],{encoding:'utf8',windowsHide:true});
 const reply=(command,args)=>page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);
 async function call(command,args){const r=await reply(command,args);assert.equal(r.ok,true,r.error);return r.data;}
 const read=(game,target)=>fs.readFileSync(path.join(game,target),'utf8');
 try{
  console.log(seed());const meta=JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8'));
  async function boot(){
   app=await electron.launch({...(process.env.GEMS_PACKAGED_EXE?{executablePath:process.env.GEMS_PACKAGED_EXE,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:meta.data},timeout:30000});
   page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
   // Count/cancel only native external surfaces; no product validation or guard
   // is replaced. A failed gate cannot open a chooser or dispatch Steam.
   await app.evaluate(({dialog,shell})=>{globalThis.__profilePendingSurfaces={open:0,save:0,confirm:0,shell:0};dialog.showOpenDialog=async()=>{globalThis.__profilePendingSurfaces.open++;return{canceled:true,filePaths:[]};};dialog.showSaveDialog=async()=>{globalThis.__profilePendingSurfaces.save++;return{canceled:true};};dialog.showMessageBox=async()=>{globalThis.__profilePendingSurfaces.confirm++;return{response:0};};shell.openExternal=async()=>{globalThis.__profilePendingSurfaces.shell++;};});
   const state=await call('state');version=state.version;assert.equal(state.environment.valid,true);assert.equal(state.environment.running,false,'The actual host game process guard must be clear');assert.equal(state.settings.gamePath,meta.game);
  }
  function filesRestored(){assert.equal(read(meta.game,'mods/a.ini'),'managed a');assert.equal(read(meta.game,'mods/shared.ini'),'managed shared');assert.equal(read(meta.game,'mods/private.ini'),'user unowned');assert.equal(read(meta.otherGame,'mods/probe.ini'),'second original');}
  async function stateRestored(){const state=await call('state');assert.deepEqual(state.recovery,[]);assert.equal(state.transactions.find(tx=>tx.id===meta.otherTransactionId).state,'已回滚');assert.deepEqual(state.mods.find(mod=>mod.id===meta.modId),meta.mod);assert.deepEqual((await call('profiles')).pending,[]);filesRestored();await page.getByText('存在未完成的恢复事务，请在备份与恢复中检查。',{exact:true}).waitFor({state:'hidden'});}
  await boot();
  if(mode==='automatic'){
   await stateRestored();checks.push('启动先恢复方案账本，再恢复其他游戏目录普通事务；若反序会改变方案捕获的目录摘要');
   await page.locator('nav').getByRole('button',{name:'配置方案',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'方案恢复待处理'}).count(),0);
   await page.screenshot({path:artifact+'-automatic.png'});
  }else{
   const state=await call('state'),profile=(await call('profiles')).pending;
   assert.equal(profile.length,1);assert.equal(profile[0].state,'recovery-required');assert.match(profile[0].error,/外部修改/);assert.ok(state.recovery.some(message=>message.includes('未完成切换')));
   await page.getByText('存在未完成的恢复事务，请在备份与恢复中检查。',{exact:true}).waitFor();await page.screenshot({path:artifact+'-pending-home.png'});checks.push('首页显示未完成配置方案提醒；全部恢复及再次启动后提醒消失');
   assert.equal(state.transactions.find(tx=>tx.id===meta.otherTransactionId).state,'执行中');assert.equal(read(meta.otherGame,'mods/probe.ini'),'interrupted other');assert.equal(read(meta.game,'mods/a.ini'),'external user edit');
   checks.push('外部改动导致方案启动恢复保留待处理，普通恢复未提前执行，用户改动未覆盖');
   const before={mods:state.mods,transactions:state.transactions,settings:state.settings},blocked=[];
   for(const [command,args]of [['disable',{id:meta.modId}],['uninstall',{id:meta.modId}],['plan',{id:meta.reportId}],['planEnable',{id:meta.modId}],['planUpdate',{id:meta.modId,reportId:meta.reportId}],['install',{id:'invalid-plan'}],['updateMod',{id:'invalid-plan'}],['chooseGame'],['launchSteam'],['snapshot'],['restoreSnapshot',{id:'missing-snapshot'}]]){
    const result=await reply(command,args);assert.equal(result.ok,false,command+' unexpectedly passed');assert.match(result.error,/配置方案存在未完成切换/,command+' did not fail at the profile gate');blocked.push({command,error:result.error});
   }
   const after=await call('state');assert.deepEqual({mods:after.mods,transactions:after.transactions,settings:after.settings},before);assert.equal(read(meta.game,'mods/a.ini'),'external user edit');assert.equal(read(meta.otherGame,'mods/probe.ini'),'interrupted other');
   assert.deepEqual(await app.evaluate(()=>globalThis.__profilePendingSurfaces),{open:0,save:0,confirm:0,shell:0});
   checks.push('11个真实旧IPC写入/预览/目录/启动入口均先拒绝，原生选择器、确认框、外部shell调用为0');
   await page.locator('nav').getByRole('button',{name:'配置方案',exact:true}).click();await page.getByRole('heading',{name:'方案恢复待处理'}).waitFor();await page.getByText(/方案目标已被外部修改/).waitFor();await page.screenshot({path:artifact+'-blocked.png'});
   await page.getByRole('button',{name:'重试方案恢复',exact:true}).click();await page.getByRole('status').filter({hasText:'方案恢复待处理'}).waitFor();assert.equal((await call('profiles')).pending.length,1);assert.equal(read(meta.game,'mods/a.ini'),'external user edit');assert.equal(read(meta.otherGame,'mods/probe.ini'),'interrupted other');checks.push('外部修改未解决时点击恢复仍明确待处理，两个目录保持原现场');
   // Repair only this test's explicitly captured known output. No real game,
   // unrelated file, mod directory or database record is edited by the harness.
   assert.equal(meta.repairTarget,'mods/a.ini');assert.equal(meta.knownOutput,null);const target=path.resolve(meta.game,meta.repairTarget);assert.equal(path.dirname(target),path.join(meta.game,'mods'));assert.ok(target.startsWith(root+path.sep));fs.unlinkSync(target);
   await page.getByRole('button',{name:'重试方案恢复',exact:true}).click();await page.getByRole('status').filter({hasText:'已恢复整次方案切换前'}).waitFor();assert.deepEqual((await call('profiles')).pending,[]);assert.equal(read(meta.game,'mods/a.ini'),'managed a');assert.equal(read(meta.otherGame,'mods/probe.ini'),'interrupted other');
   checks.push('修复已知输出后真实方案恢复按钮完成方案回滚，未擅自恢复另一事务');
   await page.locator('nav').getByRole('button',{name:'备份与恢复',exact:true}).click();await page.getByRole('button',{name:'检查中断事务',exact:true}).click();const feedback=page.getByRole('alertdialog',{name:'操作反馈'});await feedback.getByText('第二目录启动顺序探针：已回滚',{exact:true}).waitFor();await feedback.getByRole('button',{name:'知道了',exact:true}).click();await stateRestored();await page.screenshot({path:artifact+'-recovered.png'});
   assert.deepEqual(await app.evaluate(()=>globalThis.__profilePendingSurfaces),{open:0,save:0,confirm:0,shell:0});results.push({mode,blockedCommands:blocked,nativeSurfaceCalls:{open:0,save:0,confirm:0,shell:0}});
  }
  await app.close();app=undefined;console.log(seed('verify'));await boot();await stateRestored();await app.close();app=undefined;console.log(seed('verify'));
  checks.push(mode+'：实际退出/重启及独立SQLite重开均确认所有权、受管文件、未受管配置和账本一致');if(mode==='automatic')results.push({mode,profileAndOrdinaryRecovered:true});passed=true;
 }catch(error){console.error(JSON.stringify({failedMode:mode,fixtureRetained:root,error:String(error)}));if(page)await page.screenshot({path:artifact+'-'+mode+'-failure.png'}).catch(()=>{});throw error;
 }finally{if(app)await app.close().catch(()=>{});if(passed){assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-profile-pending-ui-'));fs.rmSync(root,{recursive:true});}}
}
assert.deepEqual(errors,[]);assert.deepEqual(hashes(),testedSha256,'Tested scripts or application artifacts changed during the run');const evidence={checked:new Date().toISOString(),applicationVersion:version,testedSha256,scope:'Windows真实Electron渲染器/IPC/SQLite/备份恢复；合成PE/RPF及INI夹具',substitutions:['seeder在首个方案文件变更后模拟running以保存真实pending账本','首页出现后安装原生文件选择/保存/确认框与外部shell计数并取消；零调用仅覆盖之后11个IPC探针和恢复按钮区间，不涵盖启动阶段'],productionGuardUnchanged:true,startupOrderProbe:'独立game2普通pending事务纳入profile catalogue；先执行普通恢复将使profile摘要不匹配',checks,results,errors,gameplayVerified:false,realGameWritten:false};fs.writeFileSync(artifact+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
