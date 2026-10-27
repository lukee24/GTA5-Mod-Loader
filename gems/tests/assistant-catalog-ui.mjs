import {_electron as electron} from 'playwright';
import {firstElectronWindow} from './electron-window.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const artifact=path.resolve('artifacts',process.env.GEMS_TEST_ARTIFACT||`${version}-assistant-catalog-ui`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-assistant-catalog-')),data=path.join(root,'data'),game=path.join(root,'中文 game'),source=path.join(root,'车辆 source'),output=path.join(root,'导出 catalog.json');
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['tests/assistant-catalog-ui.mjs',...(process.env.GEMS_PACKAGED_EXE?[path.resolve(process.env.GEMS_PACKAGED_EXE)]:['dist/main.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)])];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(file)])),testedSha256=hashes(),checks=[],errors=[];
let app,page,passed=false;
async function call(command,args){const reply=await page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);assert.equal(reply.ok,true,reply.error);return reply.data;}
async function openAssistant(){await page.locator('nav').getByRole('button',{name:'游戏助手',exact:true}).click();await page.locator('.assistant-page').waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');}
try{
 fs.mkdirSync(path.dirname(artifact),{recursive:true});
 const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);write(path.join(game,'GTA5_Enhanced.exe'),pe);
 const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);write(path.join(game,'update/update.rpf'),rpf);
 const target='mods/GEMS-bridge/vehicles.meta',original='original user fixture';write(path.join(game,target),original);write(path.join(game,'mods/private.ini'),'unmanaged fixture');
 const baselineFiles=['GTA5_Enhanced.exe','update/update.rpf',target,'mods/private.ini'],baseline=Object.fromEntries(baselineFiles.map(file=>[file,sha(path.join(game,file))]));
 write(path.join(source,target),'<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>fixture_car</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>');
 app=await electron.launch({...(process.env.GEMS_PACKAGED_EXE?{executablePath:process.env.GEMS_PACKAGED_EXE,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
 page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();assert.equal((await call('state')).version,version);
 await app.evaluate(({dialog,shell},{game,output})=>{
  globalThis.__assistantTest={save:0,open:0,confirm:0,shell:0,cancel:true};
  dialog.showOpenDialog=async()=>{globalThis.__assistantTest.open++;return{canceled:false,filePaths:[game]};};
  dialog.showSaveDialog=async()=>{globalThis.__assistantTest.save++;return{canceled:globalThis.__assistantTest.cancel,filePath:output};};
  dialog.showMessageBox=async()=>{globalThis.__assistantTest.confirm++;return{response:1};};
  shell.openExternal=async()=>{globalThis.__assistantTest.shell++;throw new Error('Unexpected external launch');};
 },{game,output});
 await call('chooseGame');const imported=await call('import',{paths:[source]});assert.deepEqual(imported.errors,[]);const report=imported.state.imports[0];assert.deepEqual(report.spawnNames,['fixture_car']);
 const plan=await call('plan',{id:report.id});assert.deepEqual(plan.blockers,[]);assert.equal(plan.conflicts.length,1);await call('install',{id:plan.id});await call('setVehicleMeta',{id:report.id,brand:'奔驰 / 用户品牌',favorite:true});
 const beforeExport=structuredClone((await call('state')).mods);assert.equal(beforeExport[0].status,'已启用');checks.push('真实扫描/IPC安装/备份覆盖临时XML，用户品牌保存到数据库；合成PE/RPF不是游戏');
 await page.reload();await openAssistant();
 const assistant=page.locator('.assistant-page');assert.ok((await assistant.innerText()).includes('游戏内待验收'));assert.ok((await assistant.innerText()).includes('打开或关闭同一菜单'));assert.equal(await assistant.locator('.assistant-evidence-grid>.panel').count(),4);
 assert.equal(await assistant.getByRole('button',{name:'安装游戏助手 · 待实测',exact:true}).isDisabled(),true);
 const assistantText=await assistant.innerText();
 assert.ok(!assistantText.includes('DLL已生成'));assert.ok(assistantText.includes('默认键位'));assert.ok(assistantText.includes('不读取游戏中的个人映射'));
 for(const required of ['当前角色一次清除全部武器','共享弹药池与全角色弹匣','实际状态始终未知','任意组件涂装新颜色与未知原色恢复','不提供完整自动还原','75ms不代表整次菜单操作上限'])assert.ok(assistantText.includes(required),'助手页缺少当前武器能力或限制：'+required);
 checks.push('实际助手页显示本版清除/组件/无限请求及未知状态、恢复和耗时限制，默认键位与个人映射区分，安装禁用且未声称加载通过');
 const exportButton=assistant.getByRole('button',{name:'导出数据库目录（待游戏测试）',exact:true});
 await exportButton.click();await exportButton.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.assistant-page .toolbar button:last-child').disabled);assert.equal(fs.existsSync(output),false);assert.deepEqual((await call('state')).mods,beforeExport);checks.push('UI取消导出未创建文件或改变模组');
 await app.evaluate(()=>{globalThis.__assistantTest.cancel=false;});await exportButton.click();await page.waitForFunction(()=>!document.querySelector('.assistant-page .toolbar button:last-child').disabled);
 const exported=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(exported.vehicles.length,1);assert.equal(exported.vehicles[0].brand,'奔驰 / 用户品牌');assert.equal(exported.vehicles[0].spawnName,'fixture_car');assert.equal(exported.vehicles[0].enabled,false);assert.equal(exported.vehicles[0].installState,'prepared');assert.equal(exported.requiresGameRestart,true);assert.deepEqual(exported.peds,[]);assert.deepEqual(exported.properties,[]);assert.deepEqual((await call('state')).mods,beforeExport);checks.push('实际保存文件保留用户品牌与模型引用，准备/重启标记正确，未改变数据库');
 await page.screenshot({path:artifact+'-dark.png'});
 await call('settings',{theme:'light',scale:1.2});await page.reload();await openAssistant();await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(980,760);});
 await page.waitForFunction(()=>document.querySelector('.app')?.classList.contains('light'));
 await page.waitForFunction(()=>Math.abs(window.innerWidth-980/1.2)<2);
 const layout=await page.evaluate(()=>Object.fromEntries(['.app','.titlebar','main','.assistant-page'].map(selector=>{const node=document.querySelector(selector),rect=node.getBoundingClientRect();return[selector,{right:rect.right,width:rect.width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,viewport:window.innerWidth}];})));console.log(JSON.stringify({smallWindowLayout:layout}));
 for(const [selector,rect] of Object.entries(layout))assert.ok(rect.right<=rect.viewport+2,`${selector} extends past window: ${JSON.stringify(rect)}`);
 assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+2),false);assert.equal(await page.locator('.assistant-evidence-grid').evaluate(node=>getComputedStyle(node).gridTemplateColumns.split(' ').length),1);
 // Playwright's viewport screenshot uses CSS dimensions with Electron zoom and may crop the physical image. Preserve it for comparison and capture the actual window surface as visual evidence.
 await page.screenshot({path:artifact+'-light-small.png'});
 const nativeCapture=await app.evaluate(async({BrowserWindow})=>{const image=await BrowserWindow.getAllWindows()[0].capturePage();return{size:image.getSize(),bytes:Array.from(image.toPNG())};});
 assert.equal(nativeCapture.size.width,980);assert.equal(nativeCapture.size.height,760);fs.writeFileSync(artifact+'-light-small-native.png',Buffer.from(nativeCapture.bytes));
 checks.push('浅色/120%/980像素窗口整窗DOM无溢出；保存原生980×760捕获供视觉复核');
 const outputHash=sha(output);await app.evaluate(()=>{globalThis.__assistantTest.cancel=true;});await page.locator('.assistant-page').getByRole('button',{name:'导出数据库目录（待游戏测试）',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.assistant-page .toolbar button:last-child').disabled);assert.equal(sha(output),outputHash);checks.push('重复导出取消保留已有输出字节');
 await call('uninstall',{id:report.id});assert.deepEqual(Object.fromEntries(baselineFiles.map(file=>[file,sha(path.join(game,file))])),baseline);assert.equal((await call('state')).mods[0].status,'已卸载');
 const native=await app.evaluate(()=>globalThis.__assistantTest);assert.equal(native.open,1);assert.equal(native.confirm,1);assert.equal(native.save,3);assert.equal(native.shell,0);checks.push('真实IPC卸载恢复被覆盖原文并保留其他样本文件，未触发外部启动');
 await app.close();app=undefined;assert.deepEqual(errors,[]);assert.deepEqual(hashes(),testedSha256);
 const evidence={checked:new Date().toISOString(),applicationVersion:version,testedSha256,checks,native,errors,smallWindowLayout:layout,nativeCaptureSize:nativeCapture.size,substitutions:['仅原生选择/保存/覆盖确认对话框返回隔离路径和预定选择；shell只计数并拒绝外部启动'],gameplayVerified:false,realGameWritten:false};
 fs.writeFileSync(artifact+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));passed=true;
}catch(error){console.error(JSON.stringify({fixtureRetained:root,error:String(error)}));if(page)await page.screenshot({path:artifact+'-failure.png'}).catch(()=>{});throw error;
}finally{if(app)await app.close().catch(()=>{});if(passed){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-assistant-catalog-'));fs.rmSync(root,{recursive:true});}}
