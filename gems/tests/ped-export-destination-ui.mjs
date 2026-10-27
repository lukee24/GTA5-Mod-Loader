import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';
import {firstElectronWindow} from './electron-window.mjs';

const project=path.resolve('.'),version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const artifact=path.resolve('artifacts',process.env.GEMS_TEST_ARTIFACT||`${version}-ped-export-destination-ui`);
const run=fs.mkdtempSync(path.join(path.resolve(os.tmpdir()),'gems-ped-export-destination-'));
const data=path.join(run,'data'),game=path.join(run,'synthetic-game'),source=path.join(run,'source');
const target='mods/independent-ped/peds.meta';
const installed=path.join(game,target),output=path.join(run,'user-output.json');
const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const packaged=process.env.GEMS_PACKAGED_EXE?path.resolve(process.env.GEMS_PACKAGED_EXE):null;
const appFiles=packaged?[packaged,...[path.join(path.dirname(packaged),'resources/app.asar')].filter(file=>fs.existsSync(file))]:['dist/main.cjs','dist/preload.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)];
const sourceNames=['tests/ped-export-destination-ui.mjs','desktop/main.ts','desktop/renderer/ped-catalog.tsx','desktop/renderer/ped-catalog.css','desktop/renderer/src.tsx','desktop/preload.ts','packages/peds/index.ts','packages/peds/meta.ts','packages/peds/catalog.ts','packages/peds/validation.ts','packages/peds/types.ts','packages/peds/user-state.ts','packages/bridge/ped-catalog.ts','packages/core/atomic-write.ts','packages/core/commit-target.ts',...appFiles];
const hashes=()=>Object.fromEntries(sourceNames.map(name=>[name,sha(path.resolve(project,name))]));
const before=hashes(),observations=[],pageErrors=[];
let app,page,passed=false;
const evidence=artifact+'.json';
async function call(command,args){return page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);}
async function ok(command,args){const reply=await call(command,args);assert.equal(reply.ok,true,reply.error);return reply.data;}
try{
 fs.mkdirSync(path.dirname(artifact),{recursive:true});
 const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);write(path.join(game,'GTA5_Enhanced.exe'),pe);
 const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);write(path.join(game,'update/update.rpf'),rpf);
 const xml='<CPedModelInfo__InitDataList><InitDatas><Item><Name>PED_INDEPENDENT_RACE</Name></Item></InitDatas></CPedModelInfo__InitDataList>';
 write(path.join(source,target),xml);
 app=await electron.launch({...(packaged?{executablePath:packaged,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:data,TEMP:run,TMP:run},timeout:30000});
 page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',e=>pageErrors.push(e.message));
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 assert.equal((await ok('state')).version,version);
 await app.evaluate(({dialog,shell},{game,output,installed,run})=>{
  globalThis.__independentRace={phase:'idle',mode:'existing',cancel:false,injected:false,saveCount:0,output,installed,shell:0};
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[game]});
  dialog.showMessageBox=async()=>({response:1});
  dialog.showSaveDialog=async()=>{const s=globalThis.__independentRace;s.saveCount++;s.phase='verify-after-dialog';return{canceled:s.cancel,filePath:s.output};};
  shell.openExternal=async()=>{globalThis.__independentRace.shell++;throw new Error('No external launch allowed');};
  shell.openPath=async()=>{globalThis.__independentRace.shell++;throw new Error('No external path allowed');};
  const fs=process.getBuiltinModule('node:fs');globalThis.__independentRead=fs.read;globalThis.__independentOpen=fs.openSync;
  // The open observer identifies the actual installed-file FD; it does not alter bytes.
  fs.openSync=(file,...args)=>{const fd=globalThis.__independentOpen(file,...args);if(String(file)===installed)globalThis.__independentTargetFd=fd;return fd;};
  // Only this fs.read callback triggers the foreign mutation, after the dialog returns.
  // Production snapshot checks, writes, IPC replies, and UI remain unchanged.
  fs.read=(fd,...args)=>{const s=globalThis.__independentRace;if(s.phase==='verify-after-dialog'&&s.mode!=='none'&&!s.injected&&fd===globalThis.__independentTargetFd){
    s.injected=true;s.bytesBeforeMutation=fs.existsSync(s.output)?fs.readFileSync(s.output,'utf8'):null;
    if(s.mode==='directory'){
     const path=process.getBuiltinModule('node:path'),parent=path.dirname(path.resolve(s.output));
     if(!parent.startsWith(path.resolve(run)+path.sep))throw new Error('Fixture directory escaped private run');
     fs.renameSync(parent,parent+'.old-'+s.saveCount);fs.mkdirSync(parent);
    }else if(fs.existsSync(s.output))fs.renameSync(s.output,s.output+'.old-'+s.saveCount);
    fs.writeFileSync(s.output,'FOREIGN USER OUTPUT '+s.saveCount);s.foreignBytes=fs.readFileSync(s.output,'utf8');
  }return globalThis.__independentRead(fd,...args);};
 },{game,output,installed,run});
 await ok('chooseGame');const imported=await ok('import',{paths:[source]});assert.deepEqual(imported.errors,[]);const report=imported.state.imports.find(row=>row.original===source);assert.ok(report);
 const plan=await ok('plan',{id:report.id});assert.deepEqual(plan.blockers,[]);await ok('install',{id:plan.id});
 await ok('pedAnalyze',{source:{kind:'mod',id:report.id}});
 await page.reload();await page.locator('nav').getByRole('button',{name:'人物中心',exact:true}).click();await page.locator('.ped-catalog').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('.ped-catalog button')].some(b=>b.textContent.includes('刷新记录')&&!b.disabled));
 const exportUi=async()=>{
  await page.locator('.ped-catalog').getByRole('button',{name:'核验并导出目录',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('.ped-catalog button')].some(b=>b.textContent.includes('刷新记录')&&!b.disabled));
 };
 for(const initial of ['existing','absent','directory']){
  const destination=path.join(run,initial+'-destination','catalog.json');fs.mkdirSync(path.dirname(destination));if(initial!=='absent')write(destination,'ORIGINAL USER OUTPUT');
  await app.evaluate((_,options)=>{const s=globalThis.__independentRace;Object.assign(s,options,{phase:'idle',injected:false,cancel:false});},{output:destination,mode:initial});
  await exportUi();
  const state=await app.evaluate(()=>globalThis.__independentRace),actual=fs.readFileSync(destination,'utf8');
  const alert=await page.locator('.ped-catalog [role=alert]').allTextContents(),status=await page.locator('.ped-catalog [role=status]').allTextContents();
  assert.equal(state.injected,true,'Mutation must occur during target rehash after save dialog returns');
  assert.equal(actual,state.foreignBytes,'Foreign destination must be preserved');assert.ok(alert.some(text=>text.includes('提交前目标发生变化')));assert.deepEqual(status,[]);
  observations.push({case:initial,mutation:'replace/create destination after save returns, during actual async target hash',injected:state.injected,foreignBytes:state.foreignBytes,foreignPreserved:actual===state.foreignBytes,outputIsPedCatalog:actual.includes('gems.ped-catalog.v1'),alert,status,destination});
  await app.evaluate(()=>{Object.assign(globalThis.__independentRace,{mode:'none',phase:'idle',injected:false});});
  await exportUi();const retry=JSON.parse(fs.readFileSync(destination,'utf8'));assert.equal(retry.protocol,'gems.ped-catalog.v1');assert.equal(retry.peds[0].fileState,'verified');assert.deepEqual(await page.locator('.ped-catalog [role=alert]').allTextContents(),[]);observations.push({case:initial+' normal retry',verified:retry.peds[0].fileState,staleErrorCleared:true});
 }
 const canceled=path.join(run,'cancel.json');write(canceled,'USER CANCEL BASELINE');
 await app.evaluate((_,output)=>{Object.assign(globalThis.__independentRace,{output,cancel:true,mode:'existing',phase:'idle',injected:false});},canceled);
 await exportUi();assert.equal(fs.readFileSync(canceled,'utf8'),'USER CANCEL BASELINE');assert.equal(await app.evaluate(()=>globalThis.__independentRace.injected),false);assert.ok((await page.locator('.ped-catalog [role=status]').innerText()).includes('取消'));observations.push({case:'cancel',foreignPreserved:true,injected:false});
 for(const [label,destination]of [['original-source',path.join(source,target)],['bound-game',installed],['private-database',path.join(data,'gems.sqlite')]]){
  const baseline=sha(destination);
  await app.evaluate((_,output)=>{Object.assign(globalThis.__independentRace,{output,cancel:false,mode:'none',phase:'idle',injected:false});},destination);
  await exportUi();assert.ok((await page.locator('.ped-catalog [role=alert]').innerText()).includes('受保护数据目录'));if(label!=='private-database')assert.equal(sha(destination),baseline);else assert.notEqual(fs.readFileSync(destination, 'utf8').slice(0,1),'{');
  observations.push({case:'protected '+label,rejected:true,sourceOrGameUnchanged:label!=='private-database',databaseNote:label==='private-database'?'Allowed error log commit; SQLite stays usable':'not applicable'});
 }
 assert.equal((await ok('state')).mods[0].id,report.id);
 const normal=path.join(run,'last-normal.json');await app.evaluate((_,output)=>{Object.assign(globalThis.__independentRace,{output,mode:'none',cancel:false,phase:'idle',injected:false});},normal);await exportUi();assert.equal(JSON.parse(fs.readFileSync(normal,'utf8')).peds[0].fileState,'verified');observations.push({case:'normal after cancellation and protected rejections',verified:true});
 assert.equal(fs.readFileSync(installed,'utf8'),xml);assert.equal(fs.readFileSync(path.join(source,target),'utf8'),xml);
 await app.evaluate(()=>{const fs=process.getBuiltinModule('node:fs');fs.read=globalThis.__independentRead;fs.openSync=globalThis.__independentOpen;});
 assert.deepEqual(hashes(),before);assert.deepEqual(pageErrors,[]);
 assert.equal(await app.evaluate(()=>globalThis.__independentRace.shell),0);
 await app.close();app=undefined;assert.deepEqual(hashes(),before);assert.deepEqual(pageErrors,[]);
 const result={checked:new Date().toISOString(),applicationVersion:version,testedSha256:before,sourceUnchanged:true,observations,errors:pageErrors,substitutions:['native selection/save/confirmation dialogs return isolated paths','fs.openSync only observes target FD; only the fs.read wrapper triggers an actual foreign output mutation during actual post-dialog target hash; original IO delegates unchanged','synthetic Enhanced PE/RPF/XML, actual IPC/import/install/index/export and renderer'],fixtureBoundary:{root:run,gameIsSynthetic:true,privateData:true,externalLaunchCount:0},gameplayVerified:false,realGameWritten:false};
 fs.writeFileSync(evidence,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));passed=true;
}finally{
 if(app){await app.evaluate(()=>{const fs=process.getBuiltinModule('node:fs');if(globalThis.__independentRead)fs.read=globalThis.__independentRead;if(globalThis.__independentOpen)fs.openSync=globalThis.__independentOpen;}).catch(()=>{});await app.close();}
 if(passed){assert.equal(path.dirname(path.resolve(run)),path.resolve(os.tmpdir()));assert.ok(path.basename(run).startsWith('gems-ped-export-destination-'));fs.rmSync(run,{recursive:true});}
 else console.error(JSON.stringify({retainedFixture:run,evidence}));
}
