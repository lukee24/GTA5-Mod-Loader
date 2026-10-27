import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

// Real reviewed 7-Zip, archive bytes, scanner, IPC, SQLite and Electron UI.
// Only native file-picker answers are substituted. Nothing is installed or run from a package.
const repository=process.cwd(),backendDirectory=path.resolve('tools/7zip-26.05');
const hashes={'7z.exe':'94205cfc054dd3bbeb978905bc619a65b3f04e9e73bb2717841110b6f46d962e','7z.dll':'78bf6b668d75801e3aa180b4ccb16e6d8395fba80dec8a065055bb6f8dfabb82'};
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-archive-ui-')),data=path.join(root,'data'),input=path.join(root,'中文 源文件');
const archive=path.join(root,'中文 路径测试.7z'),damaged=path.join(root,'损坏 包.7z');
const contents=new Map([['scripts/中文 目录/测试 配置.ini','[Fixture]\n中文值=保留 空格\n'],['说明 文件.txt','仅用于导入验证，不安装到游戏。\n']]);
const sample=process.env.GEMS_ARCHIVE_SAMPLE?path.resolve(process.env.GEMS_ARCHIVE_SAMPLE):null;
const packaged=!!process.env.GEMS_PACKAGED_EXE,errors=[];let app;

function fileHash(file){
 const fd=fs.openSync(file,'r'),hash=crypto.createHash('sha256'),buffer=Buffer.alloc(64*1024);
 try{for(;;){const read=fs.readSync(fd,buffer,0,buffer.length,null);if(!read)break;hash.update(buffer.subarray(0,read));}return hash.digest('hex');}finally{fs.closeSync(fd);}
}
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
function assertNoInstallation(state){assert.equal(state.settings.gamePath,'');assert.deepEqual(state.mods,[]);assert.deepEqual(state.transactions,[]);}
function verifyReport(report){
 assert.equal(report.files.length,contents.size);assert.equal(report.original,archive);
 for(const [relative,value]of contents){
  const entry=report.files.find(file=>file.path===relative);assert.ok(entry,relative);
  assert.equal(fs.readFileSync(entry.source,'utf8'),value);assert.equal(entry.hash,crypto.createHash('sha256').update(value).digest('hex'));
  const within=path.relative(data,entry.source);assert.ok(within&&!within.startsWith('..')&&!path.isAbsolute(within));
 }
 assert.match(report.compatibility,/尚未进行游戏加载验证/);
 assert.equal(fileHash(path.join(data,'imports',report.id,'original.7z')),fileHash(archive));
}

try{
 for(const [name,hash]of Object.entries(hashes))assert.equal(fileHash(path.join(backendDirectory,name)),hash,'fixture generator must use the reviewed backend');
 for(const [relative,value]of contents)write(path.join(input,relative),value);
 const made=spawnSync(path.join(backendDirectory,'7z.exe'),['a','-t7z','-mx=1','-mmt=1','-bd','-bsp0','-sccUTF-8','--',archive,'scripts','说明 文件.txt'],{cwd:input,shell:false,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.equal(made.status,0,made.error?.message||made.stderr||made.stdout);
 const originalHash=fileHash(archive);write(damaged,fs.readFileSync(archive).subarray(0,18));const damagedHash=fileHash(damaged);
 const env={...process.env,GEMS_TEST_DATA:data};
 // A packaged run must find its own resources/tools directory, never a developer override.
 if(packaged)delete env.GEMS_7ZIP_DIRECTORY;else env.GEMS_7ZIP_DIRECTORY=backendDirectory;
 const launch=()=>electron.launch({...packaged?{executablePath:path.resolve(process.env.GEMS_PACKAGED_EXE),args:[]}:{args:['.']},env,timeout:30000});
 app=await launch();let page=await app.firstWindow();page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 const runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged,resources:process.resourcesPath,backendOverride:process.env.GEMS_7ZIP_DIRECTORY||null,appPath:app.getAppPath()}));
 assert.equal(runtime.packaged,packaged);
 const selectedBackend=packaged?path.join(runtime.resources,'tools','7zip-26.05'):runtime.backendOverride;
 for(const [name,hash]of Object.entries(hashes))assert.equal(fileHash(path.join(selectedBackend,name)),hash,'actual runtime backend must be present and match');
 if(packaged)assert.equal(runtime.backendOverride,null);
 await app.evaluate(({dialog})=>{globalThis.__archiveChoice={canceled:true,filePaths:[]};dialog.showOpenDialog=async()=>globalThis.__archiveChoice;});
 const state=async()=>{const reply=await page.evaluate(()=>window.gems.call('state'));assert.equal(reply.ok,true,reply.error);return reply.data;};
 const choose=async files=>app.evaluate((_,files)=>{globalThis.__archiveChoice=files?{canceled:false,filePaths:files}:{canceled:true,filePaths:[]};},files);
 const importUi=async files=>{
  await choose(files);await page.locator('.page-heading').getByRole('button',{name:'导入模组',exact:true}).click();
  await page.waitForFunction(()=>{const button=document.querySelector('.page-heading button');return button&&!button.disabled;},{},{timeout:120000});
 };
 assert.equal((await state()).imports.length,0);

 await importUi([archive]);let current=await state();assert.equal(current.imports.length,1);verifyReport(current.imports[0]);assertNoInstallation(current);
 await page.locator('.import-detail').getByText('游戏加载与外观测试：未执行',{exact:true}).waitFor();
 await page.getByRole('button',{name:'查看文件',exact:true}).click();const files=page.getByRole('dialog',{name:'文件清单'});await files.waitFor();
 for(const relative of contents.keys())await files.getByText(relative,{exact:true}).waitFor();
 for(const entry of current.imports[0].files)await files.getByText(entry.hash,{exact:true}).waitFor();
 fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/archive-files-dark.png'});await files.getByRole('button',{name:'关闭对话框'}).click();

 await importUi([archive]);current=await state();assert.equal(current.imports.length,2);current.imports.forEach(verifyReport);
 assert.equal(new Set(current.imports.map(report=>report.id)).size,2);assert.equal(new Set(current.imports.flatMap(report=>report.files.map(file=>file.source))).size,4);
 const beforeCancel=structuredClone(current.imports);await importUi(null);assert.deepEqual((await state()).imports,beforeCancel);

 await importUi([damaged]);const alert=page.getByRole('alertdialog');await alert.waitFor();const failureText=await alert.innerText();assert.match(failureText,/损坏 包\.7z/);assert.match(failureText,/损坏|拒绝|文件头/);
 current=await state();assert.deepEqual(current.imports,beforeCancel);assertNoInstallation(current);
 const failed=fs.readdirSync(path.join(data,'imports')).map(id=>path.join(data,'imports',id)).filter(directory=>fs.existsSync(path.join(directory,'failure.txt')));
 assert.equal(failed.length,1);assert.deepEqual(fs.readdirSync(path.join(failed[0],'contents')),[]);assert.equal(fileHash(path.join(failed[0],'original.7z')),damagedHash);
 await page.screenshot({path:'artifacts/ui/archive-corrupt-error-dark.png'});await alert.getByRole('button',{name:'知道了'}).click();
 await importUi([archive]);current=await state();assert.equal(current.imports.length,3);current.imports.forEach(verifyReport);assert.equal(fileHash(archive),originalHash);assert.equal(fileHash(damaged),damagedHash);assertNoInstallation(current);

 await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption('light');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));await page.locator('nav').getByRole('button',{name:'导入模组',exact:true}).click();
 await page.getByRole('button',{name:'查看文件',exact:true}).click();await files.waitFor();assert.equal(await files.evaluate(element=>element.scrollWidth>element.clientWidth+2),false);
 await page.screenshot({path:'artifacts/ui/archive-files-light-1024.png'});await files.getByRole('button',{name:'关闭对话框'}).click();

 let sampleEvidence=null;
 if(sample){
  assert.match(sample,/\.(rar|7z)$/iu);const before=fs.statSync(sample),hash=fileHash(sample),prior=current.imports.length;
  await importUi([sample]);current=await state();assert.equal(current.imports.length,prior+1,'optional sample import must succeed; see product alert for failure');
  const report=current.imports.find(item=>item.original===sample);assert.ok(report);assert.ok(report.files.length>0);assert.match(report.compatibility,/尚未进行游戏加载验证/);assertNoInstallation(current);
  await page.getByRole('button',{name:'查看文件',exact:true}).click();await files.waitFor();assert.equal(await files.locator('.file-table>div').count(),report.files.length);await files.getByRole('button',{name:'关闭对话框'}).click();
  assert.equal(fileHash(sample),hash);assert.equal(fs.statSync(sample).size,before.size);assert.equal(fs.statSync(sample).mtimeMs,before.mtimeMs);
  const preserved=path.join(data,'imports',report.id,'original'+path.extname(sample));assert.equal(fileHash(preserved),hash);
  sampleEvidence={checked:new Date().toISOString(),applicationVersion:runtime.version,packaged,sample:path.basename(sample),bytes:before.size,sha256:hash,files:report.files.length,blockers:report.blockers.length,warnings:report.warnings.length,sourceAndPreservedCopyHashesMatch:true,originalSizeAndMtimeUnchanged:true,fileListViewed:true,installed:false,gameplayVerified:false,resourceContentIncluded:false};
 }

 const expectedImports=current.imports.length;await app.close();app=undefined;app=await launch();page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 current=await state();assert.equal(current.imports.length,expectedImports);assertNoInstallation(current);assert.deepEqual(errors,[]);await app.close();app=undefined;
 const evidence={checked:new Date().toISOString(),applicationVersion:runtime.version,packaged,applicationBundleSha256:fileHash(packaged?runtime.appPath:path.join(repository,'dist/main.cjs')),scope:'实际 Windows Electron / 原 IPC / SQLite / 固定 7-Zip 26.05 后端；只导入不安装',substitutions:['原生文件选择器返回临时夹具或明确指定样本路径'],backend:{version:'26.05',selection:packaged?'bundled resources/tools/7zip-26.05':'development GEMS_7ZIP_DIRECTORY',hashes},generated7z:{name:path.basename(archive),sha256:originalHash,files:contents.size},normalImportAndActualPayloads:true,chineseAndSpacePaths:true,fileListAndHashesVisible:true,duplicateImportsIsolated:true,cancelKeepsRecords:true,corruptedArchiveRejected:true,failedWorkspaceRetainedAndEmpty:true,retryAfterFailureSucceeded:true,restartRecordsPreserved:true,darkAndLight1024Verified:true,optionalSample:sample?path.basename(sample):'not-requested',installed:false,gameplayVerified:false,realGameWritten:false,errors};
 const mode=packaged?'packaged':'development';
 for(const label of ['current',mode]){fs.writeFileSync('artifacts/archive-ui-'+label+'.json',JSON.stringify(evidence,null,2));if(sampleEvidence)fs.writeFileSync('artifacts/archive-ui-sample-'+label+'.json',JSON.stringify(sampleEvidence,null,2));}
 console.log(JSON.stringify({evidence,sampleEvidence},null,2));
}finally{
 if(app)await app.close().catch(()=>{});assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-archive-ui-'));fs.rmSync(root,{recursive:true});
}
