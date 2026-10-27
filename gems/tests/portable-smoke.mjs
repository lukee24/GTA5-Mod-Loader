// NSIS portable launchers do not forward Playwright's Electron inspector pipe.
// Attach to the actual renderer over a local debugging port for this wrapper test.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const executable=path.resolve(`release/GEMS-${version}-x64-portable.exe`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-portable-smoke-'));
const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
const child=spawn(executable,[`--remote-debugging-port=${port}`],{windowsHide:true,env:{...process.env,GEMS_TEST_DATA:path.join(root,'data')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page,exit;
const ended=new Promise(resolve=>{child.once('exit',(code,signal)=>{exit={code,signal};resolve(exit);});});
child.stdout.on('data',chunk=>{logs=(logs+chunk).slice(-8192);});child.stderr.on('data',chunk=>{logs=(logs+chunk).slice(-8192);});child.on('error',error=>{logs+=error.message;});
try{
  let ready=false;
  for(let i=0;i<120;i++){
    if(exit)throw new Error('便携启动器提前结束：'+JSON.stringify(exit)+' '+logs);
    try{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(ready,'未发现便携程序实际渲染进程：'+logs);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context=browser.contexts()[0];page=context.pages()[0]||await context.waitForEvent('page');page.setDefaultTimeout(15000);
  await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const initial=await page.evaluate(()=>window.gems.call('state'));assert.equal(initial.ok,true);assert.equal(initial.data.version,version);assert.equal(initial.data.settings.gamePath,'');
  for(const name of ['导入模组','模组中心','武器中心','RPF 浏览器','备份与恢复','游戏助手','启动游戏','性能与诊断','设置']){await page.locator('nav').getByRole('button',{name,exact:true}).click();await page.locator('h1').waitFor();}
  await page.getByLabel('界面主题').selectOption('light');
  const source=path.join(root,'中文样本');fs.mkdirSync(path.join(source,'mods'),{recursive:true});fs.writeFileSync(path.join(source,'mods/config.ini'),'portable=true');
  const weaponXml='<CWeaponInfoBlob><Infos><Item><Infos><Item type="CWeaponInfo"><Name>WEAPON_GEMS_PORTABLE_FIXTURE</Name><Model>w_portable_fixture</Model></Item></Infos></Item></Infos></CWeaponInfoBlob>';
  fs.writeFileSync(path.join(source,'mods/weapons.meta'),weaponXml);
  const imported=await page.evaluate(source=>window.gems.call('import',{paths:[source]}),source);assert.equal(imported.ok,true);assert.deepEqual(imported.data.errors,[]);assert.equal(imported.data.state.imports.length,1);
  await page.reload();await page.locator('nav').getByRole('button',{name:'导入模组',exact:true}).click();await page.getByText('中文样本',{exact:true}).first().waitFor();
  fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/portable-import.png'});
  await page.locator('nav').getByRole('button',{name:'武器中心',exact:true}).click();
  await page.getByLabel('选择武器来源').selectOption('import:'+imported.data.state.imports[0].id);
  await page.getByRole('button',{name:'解析此来源',exact:true}).click();
  await page.locator('.weapon-reference').getByText('WEAPON_GEMS_PORTABLE_FIXTURE',{exact:true}).waitFor();
  await page.reload();await page.locator('nav').getByRole('button',{name:'武器中心',exact:true}).click();
  await page.getByLabel('搜索武器引用').fill('PORTABLE_FIXTURE');
  await page.locator('.weapon-reference').getByText('WEAPON_GEMS_PORTABLE_FIXTURE',{exact:true}).waitFor();
  assert.equal(await page.locator('.weapon-reference').count(),1);
  assert.equal(await page.getByRole('button',{name:'核验并导出目录',exact:true}).isDisabled(),true);
  const weaponIndexes=await page.evaluate(()=>window.gems.call('weaponIndexes'));
  assert.equal(weaponIndexes.ok,true);assert.equal(weaponIndexes.data.length,1);assert.equal(weaponIndexes.data[0].status,'current');
  assert.equal(weaponIndexes.data[0].analysis.references[0].evidence[0].sourceSha256,crypto.createHash('sha256').update(weaponXml).digest('hex'));
  await page.screenshot({path:'artifacts/ui/portable-weapon.png'});
  await page.locator('nav').getByRole('button',{name:'游戏助手',exact:true}).click();
  const assistant=page.locator('.assistant-page');await assistant.waitFor();
  assert.equal(await assistant.getByRole('button',{name:'安装游戏助手 · 待实测',exact:true}).isDisabled(),true);
  const assistantText=await assistant.innerText();
  for(const required of ['当前角色一次清除全部武器','实际状态始终未知','任意组件涂装新颜色与未知原色恢复','75ms不代表整次菜单操作上限'])assert.ok(assistantText.includes(required),'便携助手缺少本版能力/限制：'+required);
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  await page.screenshot({path:'artifacts/ui/portable-assistant.png'});
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.gems.call('window','close')).catch(()=>{});
  const result=await Promise.race([ended,new Promise((_,reject)=>setTimeout(()=>reject(new Error('便携程序未正常结束')),15000))]);assert.equal(result.code,0);
  await browser.close();browser=undefined;
  const evidence={checked:new Date().toISOString(),version,executable:path.basename(executable),sha256:crypto.createHash('sha256').update(fs.readFileSync(executable)).digest('hex'),testSha256:crypto.createHash('sha256').update(fs.readFileSync('tests/portable-smoke.mjs')).digest('hex'),scope:'实际便携EXE启动、临时解包、真实渲染界面/IPC、9页导航、主题设置、中文目录导入、合成武器XML解析/来源摘要/重载搜索保持、未绑定游戏拒绝导出、本版助手能力/未知状态/限制与禁用安装、正常退出；本地CDP仅为本次测试开启',portableStarted:true,importVerified:true,weaponIndexVerified:true,assistantScopeVerified:true,normalExit:true,realGameWritten:false,gameplayVerified:false,errors};
  fs.writeFileSync('artifacts/portable-smoke-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
  if(!exit){try{await page?.evaluate(()=>window.gems.call('window','close'));await Promise.race([ended,new Promise(resolve=>setTimeout(resolve,1500))]);}catch{}}
  if(!exit){execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await ended;}
  await browser?.close().catch(()=>{});
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-portable-smoke-'));fs.rmSync(root,{recursive:true,force:true});
}
