import {_electron as electron} from 'playwright';
import {firstElectronWindow} from './electron-window.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';

const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const artifact=path.resolve('artifacts',process.env.GEMS_TEST_ARTIFACT||`${version}-ped-catalog-ui`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-ped-ui-')),data=path.join(root,'data'),game=path.join(root,'中文 game'),source=path.join(root,'人物 source'),output=path.join(root,'人物 catalog.json');
const target='mods/GEMS-ped/peds.meta',file=path.join(game,target);
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const entries=Array.from({length:23},(_,index)=>`<Item><Name>PED_GEMS_FIXTURE_${index}</Name><Pedtype>CIVMALE</Pedtype><ClipDictionaryName>move_m@generic</ClipDictionaryName></Item>`).join('');
const xml=`<?xml version="1.0" encoding="UTF-8"?><CPedModelInfo__InitDataList><InitDatas>${entries}</InitDatas></CPedModelInfo__InitDataList>`;
const files=['tests/ped-catalog-ui.mjs',...(process.env.GEMS_PACKAGED_EXE?[path.resolve(process.env.GEMS_PACKAGED_EXE)]:['dist/main.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)])];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(file)])),testedSha256=hashes(),checks=[],errors=[];
let app,page,passed=false;
async function call(command,args){const reply=await page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);assert.equal(reply.ok,true,reply.error);return reply.data;}
async function openPeds(){await page.locator('nav').getByRole('button',{name:'人物中心',exact:true}).click();await page.locator('.ped-catalog').waitFor();await settle();await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');}
async function settle(){await page.waitForFunction(()=>{const refresh=[...document.querySelectorAll('.ped-catalog button')].find(button=>button.textContent.includes('刷新记录'));return refresh&&!refresh.disabled;});}
async function chooseSource(kind,id){await page.getByLabel('选择人物来源').selectOption(kind+':'+id);}
async function analyze(){await page.locator('.ped-catalog').getByRole('button',{name:'解析此来源',exact:true}).click();await settle();}
async function exportViaUi(){await page.locator('.ped-catalog').getByRole('button',{name:'核验并导出目录',exact:true}).click();await settle();}
try{
 fs.mkdirSync(path.dirname(artifact),{recursive:true});
 const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);write(path.join(game,'GTA5_Enhanced.exe'),pe);
 const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);write(path.join(game,'update/update.rpf'),rpf);
 write(file,'original user ped configuration');write(path.join(game,'mods/private.ini'),'unmanaged fixture');write(path.join(source,target),xml);write(output,'previous user output');
 const baselineFiles=['GTA5_Enhanced.exe','update/update.rpf',target,'mods/private.ini'],baseline=Object.fromEntries(baselineFiles.map(file=>[file,sha(path.join(game,file))]));
 const originalOutput=sha(output),sourceHash=sha(path.join(source,target));
 app=await electron.launch({...(process.env.GEMS_PACKAGED_EXE?{executablePath:process.env.GEMS_PACKAGED_EXE,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
 page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();assert.equal((await call('state')).version,version);
 await app.evaluate(({dialog,shell},{game,output})=>{
  globalThis.__pedTest={save:0,open:0,confirm:0,shell:0,cancel:true,hold:false,output,release:null};
  dialog.showOpenDialog=async()=>{globalThis.__pedTest.open++;return{canceled:false,filePaths:[game]};};
  dialog.showSaveDialog=async()=>{const s=globalThis.__pedTest;s.save++;if(s.hold)await new Promise(resolve=>{s.release=resolve;});return{canceled:s.cancel,filePath:s.output};};
  dialog.showMessageBox=async()=>{globalThis.__pedTest.confirm++;return{response:1};};
  shell.openExternal=async()=>{globalThis.__pedTest.shell++;throw new Error('Unexpected external launch');};
  shell.openPath=async()=>{globalThis.__pedTest.shell++;throw new Error('Unexpected external path');};
 },{game,output});
 await openPeds();assert.ok((await page.locator('.ped-catalog').innerText()).includes('尚无来源记录'));assert.equal(await page.locator('.ped-catalog').getByRole('button',{name:'解析此来源',exact:true}).isDisabled(),true);
 await call('chooseGame');const imported=await call('import',{paths:[source]});assert.deepEqual(imported.errors,[]);const report=imported.state.imports[0];assert.deepEqual(report.spawnNames,[]);assert.ok(report.categories.includes('人物'));assert.equal(report.files.length,1);
 await page.reload();await openPeds();await chooseSource('import',report.id);await analyze();
 let view=(await call('pedIndexes')).find(row=>row.source.id===report.id);assert.equal(view.status,'current');assert.equal(view.analysis.references.length,23);assert.equal(view.analysis.status,'parsed');assert.equal(view.analysis.references[0].kind,'unknown');
 assert.equal(await page.locator('.ped-reference').count(),20);await page.getByRole('button',{name:'下一页',exact:true}).click();assert.equal(await page.locator('.ped-reference').count(),3);
 await page.getByLabel('搜索人物引用').fill('PED_GEMS_FIXTURE_22');assert.equal(await page.locator('.ped-reference').count(),1);assert.ok((await page.locator('.ped-reference').innerText()).includes('PED_GEMS_FIXTURE_22'));
 await page.locator('.ped-reference summary').click();assert.ok((await page.locator('.ped-reference').innerText()).includes(report.files[0].hash));await page.getByLabel('搜索人物引用').fill('');
 let preferences=await call('pedUserStates',{source:{kind:'import',id:report.id}});assert.equal(preferences.length,23);assert.ok(preferences.every(item=>item.updatedAt===null&&!item.favorite&&item.tags.length===0));
 await page.getByRole('button',{name:'收藏人物 PED_GEMS_FIXTURE_0',exact:true}).click();await settle();
 await page.getByLabel('PED_GEMS_FIXTURE_0 分类 军事',{exact:true}).check();await settle();await page.getByLabel('PED_GEMS_FIXTURE_0 分类 警察',{exact:true}).check();await settle();
 preferences=await call('pedUserStates',{source:{kind:'import',id:report.id}});let selectedPreference=preferences.find(item=>item.referenceId===view.analysis.references[0].referenceId);assert.equal(selectedPreference.favorite,true);assert.deepEqual(selectedPreference.tags,['military','police']);assert.ok(selectedPreference.updatedAt);
 await page.getByLabel('筛选人物自定义分类').selectOption('police');await page.locator('.ped-reference-search').getByRole('button',{name:'仅收藏',exact:true}).click();assert.equal(await page.locator('.ped-reference').count(),1);
 await page.reload();await openPeds();await chooseSource('import',report.id);await settle();assert.equal(await page.getByRole('button',{name:'收藏人物 PED_GEMS_FIXTURE_0',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await page.getByLabel('PED_GEMS_FIXTURE_0 分类 军事',{exact:true}).isChecked(),true);
 checks.push('独立偏好初始未保存；UI收藏及军警多分类真实持久化，搜索筛选和重载保持，不修改配置声明');
 const initialAnalysis=structuredClone(view.analysis);checks.push('真实扫描与独立索引；23个明确XML人物节点，来源SHA显示、20条分页和查询生效，无车辆生成名伪装');
 // Changing an import target changes the report fingerprint; the previous derived document is retained visibly.
 await call('setTargets',{id:report.id,targets:[{path:report.files[0].path,target:'mods/GEMS-ped/alternate.meta'}]});
 await page.locator('.ped-catalog').getByRole('button',{name:'刷新记录',exact:true}).click();await settle();assert.ok((await page.locator('.ped-source-status').innerText()).includes('来源报告已变化'));
 view=(await call('pedIndexes')).find(row=>row.source.id===report.id);assert.deepEqual(view.analysis,initialAnalysis);assert.equal(view.status,'stale');
 await call('setTargets',{id:report.id,targets:[{path:report.files[0].path,target}]});await analyze();assert.equal((await call('pedIndexes')).find(row=>row.source.kind==='import'&&row.source.id===report.id).status,'current');
 const plan=await call('plan',{id:report.id});assert.deepEqual(plan.blockers,[]);assert.equal(plan.conflicts.length,1);await call('install',{id:plan.id});assert.equal(fs.readFileSync(file,'utf8'),xml);
 await page.reload();await openPeds();await chooseSource('mod',report.id);assert.ok((await page.locator('.ped-source-status').innerText()).includes('尚未解析'));await analyze();assert.equal((await call('pedIndexes')).filter(row=>row.source.id===report.id).length,2);
 const modPreferences=await call('pedUserStates',{source:{kind:'mod',id:report.id}});assert.ok(modPreferences.every(item=>item.updatedAt===null&&!item.favorite));assert.equal((await call('pedUserStates',{source:{kind:'import',id:report.id}})).find(item=>item.referenceId===selectedPreference.referenceId).favorite,true);
 await page.getByRole('button',{name:'收藏人物 PED_GEMS_FIXTURE_0',exact:true}).click();await settle();await page.getByLabel('PED_GEMS_FIXTURE_0 分类 平民',{exact:true}).check();await settle();
 checks.push('安装记录与导入记录偏好明确分域，旧收藏保留而未自动迁移；模组收藏和分类可独立保存');checks.push('导入目标修改使旧索引显式失效；真实IPC安装覆盖/备份后模组索引单独解析，导入索引不假冒安装证明');
 const beforeExport=await call('state');await exportViaUi();assert.equal(sha(output),originalOutput);assert.ok((await page.locator('.ped-catalog [role=status]').innerText()).includes('取消'));
 await app.evaluate(()=>{globalThis.__pedTest.cancel=false;});await exportViaUi();const good=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(good.protocol,'gems.ped-catalog.v1');assert.equal(good.peds.length,23);assert.ok(good.peds.every(ref=>ref.fileState==='verified'&&ref.registration==='unknown'&&ref.dependencies==='unknown'));assert.equal(good.gameRoot,fs.realpathSync.native(game));assert.equal(good.gameRootId,crypto.createHash('sha256').update(good.gameRoot).digest('hex'));assert.equal(good.requiresGameRestart,true);assert.equal(good.peds.find(item=>item.modelName==='PED_GEMS_FIXTURE_0').desktopFavorite,true);assert.deepEqual(good.peds.find(item=>item.modelName==='PED_GEMS_FIXTURE_0').userTags,['civilian']);assert.equal(good.peds[0].parsedPedType,'CIVMALE');assert.equal(good.peds[0].dependencyRefs[0].identifier,'move_m@generic');const goodHash=sha(output);fs.copyFileSync(output,artifact+'-verified-catalog.json');
 assert.deepEqual((await call('state')).mods,beforeExport.mods);assert.deepEqual((await call('state')).transactions,beforeExport.transactions);checks.push('UI取消保留已有文件；实际磁盘核验导出23项，游戏根SHA绑定，注册/依赖未知与文件已核验分开，未变更模组/事务');
 // A target can change while a native save dialog is open. Verify again after it closes.
 await app.evaluate(()=>{globalThis.__pedTest.hold=true;});
 await page.locator('.ped-catalog').getByRole('button',{name:'核验并导出目录',exact:true}).click();
 for(let attempts=0;attempts<100;attempts++){if(await app.evaluate(()=>!!globalThis.__pedTest.release))break;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(await app.evaluate(()=>!!globalThis.__pedTest.release),true);assert.equal(await page.locator('.ped-catalog').getByRole('button',{name:'解析此来源',exact:true}).isDisabled(),true);
 write(file,xml+'<!-- external change during save -->');await app.evaluate(()=>{const s=globalThis.__pedTest;s.hold=false;s.release();s.release=null;});await settle();assert.equal(sha(output),goodHash);assert.match(await page.locator('.ped-catalog [role=alert]').innerText(),/保存前安装文件.*变化/);
 await exportViaUi();const changed=JSON.parse(fs.readFileSync(output,'utf8'));assert.ok(changed.peds.every(ref=>ref.fileState==='changed'));assert.notEqual(changed.revision,good.revision);checks.push('保存对话框期间修改安装文件导致原快照拒绝且旧输出保留；重新核验仅导出changed状态');
 write(file,xml);await exportViaUi();assert.ok(JSON.parse(fs.readFileSync(output,'utf8')).peds.every(ref=>ref.fileState==='verified'));
 const savedIndex=structuredClone((await call('pedIndexes')).find(row=>row.source.kind==='mod'&&row.source.id===report.id).analysis);write(report.files[0].source,xml+'<!-- source changed -->');await analyze();assert.match(await page.locator('.ped-catalog [role=alert]').innerText(),/扫描摘要不一致/);assert.deepEqual((await call('pedIndexes')).find(row=>row.source.kind==='mod'&&row.source.id===report.id).analysis,savedIndex);write(report.files[0].source,xml);await analyze();checks.push('保存来源被修改时拒绝重新分析并保留旧派生文档；恢复原来源后再次解析成功');
 const cancelHash=sha(output);await app.evaluate(()=>{globalThis.__pedTest.cancel=true;});await exportViaUi();assert.equal(sha(output),cancelHash);
 await page.screenshot({path:artifact+'-dark.png'});await call('settings',{theme:'light',scale:1.2});await page.reload();await openPeds();await app.evaluate(({BrowserWindow})=>{BrowserWindow.getAllWindows()[0].setSize(980,760);});await page.waitForFunction(()=>Math.abs(window.innerWidth-980/1.2)<2);
 const layout=await page.evaluate(()=>Object.fromEntries(['.app','main','.ped-catalog','.ped-reference'].map(selector=>{const node=document.querySelector(selector),rect=node.getBoundingClientRect();return[selector,{right:rect.right,width:rect.width,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,viewport:window.innerWidth}];})));
 for(const [selector,rect]of Object.entries(layout))assert.ok(rect.right<=rect.viewport+2,selector+' overflows');assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+2),false);
 const capture=await app.evaluate(async({BrowserWindow})=>{const image=await BrowserWindow.getAllWindows()[0].capturePage();return{size:image.getSize(),bytes:Array.from(image.toPNG())};});fs.writeFileSync(artifact+'-light-small-native.png',Buffer.from(capture.bytes));assert.deepEqual(capture.size,{width:980,height:760});checks.push('实际深浅色页面、980×760/120%无横向溢出；原生截图待目视复核');
 // Invalid or unsupported sources remain visible without inventing references.
 const malformed=path.join(root,'坏 source','peds.meta'),unsupported=path.join(root,'未知 source','peds.meta');write(malformed,'<CPedModelInfo__InitDataList><InitDatas>');write(unsupported,'<Unknown><Name>PED_FAKE</Name></Unknown>');
 const next=await call('import',{paths:[malformed,unsupported]});assert.deepEqual(next.errors,[]);const bad=next.state.imports.find(r=>r.original===malformed),unknown=next.state.imports.find(r=>r.original===unsupported);assert.ok(bad&&unknown);
 await page.reload();await openPeds();await chooseSource('import',bad.id);await analyze();assert.ok(await page.locator('.ped-catalog [role=alert]').isVisible());assert.equal((await call('pedIndexes')).find(r=>r.source.id===bad.id).analysis,null);
 await chooseSource('import',unknown.id);await analyze();const unknownIndex=(await call('pedIndexes')).find(r=>r.source.id===unknown.id);assert.equal(unknownIndex.analysis.status,'unsupported');assert.deepEqual(unknownIndex.analysis.references,[]);checks.push('损坏XML拒绝且无成功索引；未知结构含Name也不猜测人物，不把格式不支持记为成功');
 await call('uninstall',{id:report.id});assert.deepEqual(Object.fromEntries(baselineFiles.map(file=>[file,sha(path.join(game,file))])),baseline);
 await page.reload();await openPeds();await chooseSource('mod',report.id);await app.evaluate(()=>{globalThis.__pedTest.cancel=false;});await exportViaUi();assert.ok(JSON.parse(fs.readFileSync(output,'utf8')).peds.every(ref=>ref.fileState==='uninstalled'));assert.equal(sha(path.join(source,target)),sourceHash);checks.push('真实卸载恢复原配置、保留未受管文件和用户原始来源；导出记录为uninstalled，重载保留索引');
 const partialSource=path.join(root,'部分安装 ped'),supportTarget='mods/GEMS-unmapped/support.ini';
 write(path.join(partialSource,'peds.meta'),'<CPedModelInfo__InitDataList><InitDatas><Item><Name>PED_GEMS_UNMAPPED</Name></Item></InitDatas></CPedModelInfo__InitDataList>');write(path.join(partialSource,supportTarget),'support-only=1');
 const partialImport=await call('import',{paths:[partialSource]});assert.deepEqual(partialImport.errors,[]);const partialReport=partialImport.state.imports.find(item=>item.original===partialSource);assert.ok(partialReport);const partialPlan=await call('plan',{id:partialReport.id});assert.deepEqual(partialPlan.blockers,[]);assert.equal(partialPlan.files.length,1);assert.equal(partialPlan.files[0].target,supportTarget);await call('install',{id:partialPlan.id});
 await page.reload();await openPeds();await chooseSource('mod',partialReport.id);await analyze();await exportViaUi();const partialCatalog=JSON.parse(fs.readFileSync(output,'utf8'));assert.equal(partialCatalog.peds.find(item=>item.modelName==='PED_GEMS_UNMAPPED').fileState,'unverified');assert.equal(fs.readFileSync(path.join(game,supportTarget),'utf8'),'support-only=1');
 await call('uninstall',{id:partialReport.id});assert.equal(fs.existsSync(path.join(game,supportTarget)),false);assert.deepEqual(Object.fromEntries(baselineFiles.map(file=>[file,sha(path.join(game,file))])),baseline);checks.push('真实只安装辅助INI而不映射人物meta时，目录保留该声明但拒绝将其标为文件已核验；辅助文件卸载清除，原配置仍保持');
 const native=await app.evaluate(()=>{const {release,...value}=globalThis.__pedTest;return value;});assert.equal(native.open,1);assert.equal(native.confirm,1);assert.equal(native.shell,0);
 await app.close();app=undefined;assert.deepEqual(errors,[]);assert.deepEqual(hashes(),testedSha256);
 const evidence={checked:new Date().toISOString(),applicationVersion:version,testedSha256,checks,native,errors,layout,nativeCaptureSize:capture.size,substitutions:['原生目录/保存/覆盖确认对话框返回预定选择和隔离路径；保存时可手动挂起，以修改实际夹具文件；shell拒绝外部启动','Enhanced PE/RPF标记、XML人物声明为本地合成夹具，不是真实游戏或可加载模组'],gameplayVerified:false,realGameWritten:false};fs.writeFileSync(artifact+'.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));passed=true;
}catch(error){console.error(JSON.stringify({fixtureRetained:root,error:String(error)}));if(page)await page.screenshot({path:artifact+'-failure.png'}).catch(()=>{});throw error;}
finally{if(app)await app.close().catch(()=>{});if(passed){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-ped-ui-'));fs.rmSync(root,{recursive:true});}}
