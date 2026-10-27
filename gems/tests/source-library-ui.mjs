import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const data=fs.mkdtempSync(path.join(os.tmpdir(),'gems-sources-ui-'));
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'gems-sources-ui-import-'));
fs.mkdirSync(path.join(fixture,'mods'));fs.writeFileSync(path.join(fixture,'mods','来源保留测试.ini'),'value=1');
let app;const errors=[];
async function launch(){app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});const page=await app.firstWindow();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();await page.getByLabel('GitHub 仓库').waitFor();return page;}
async function call(page,command,args){const result=await page.evaluate(({command,args})=>window.gems.call(command,args),{command,args});assert.ok(result.ok,result.error);return result.data;}
try{
 let page=await launch();const repo='Chiheb-Bacha/ScriptHookVDotNetEnhanced';
 await page.getByLabel('GitHub 仓库').fill(repo);await page.getByLabel('来源收藏名称').fill('中文脚本发布来源');await page.getByRole('button',{name:'保存来源',exact:true}).click();
 await page.getByLabel('已保存的模组来源').getByRole('option',{name:'中文脚本发布来源 · '+repo,exact:true}).waitFor({state:'attached'});
 let saved=await call(page,'market');assert.equal(saved.sources.length,1);assert.equal(saved.sources[0].lastChecked,null);
 await page.getByRole('button',{name:'读取发布包',exact:true}).click();await page.locator('.market-card').first().waitFor();
 const read=await call(page,'market');assert.ok(read.assets.length>0);assert.equal(read.sources[0].lastAssetCount,read.assets.length);assert.equal(read.sources[0].lastChecked,read.checked);const assetId=read.assets[0].id;
 const imported=await call(page,'import',{paths:[fixture]});assert.equal(imported.errors.length,0);const reportId=imported.state.imports[0].id;const sourceFile=imported.state.imports[0].files[0].source;
 await app.close();app=undefined;page=await launch();
 await page.waitForFunction(repo=>document.querySelector('[aria-label="GitHub 仓库"]').value===repo,repo);
 const restored=await call(page,'market');assert.equal(restored.repository,repo);assert.deepEqual(restored.assets,[]);assert.equal(restored.checked,null);assert.equal(restored.sources[0].lastChecked,read.checked);assert.equal(restored.sources[0].label,'中文脚本发布来源');
 const stale=await page.evaluate(id=>window.gems.call('downloadStart',{id}),assetId);assert.equal(stale.ok,false);assert.match(stale.error,/过期/);
 await page.getByLabel('来源收藏名称').fill('收藏名'.repeat(26));await page.getByRole('button',{name:'保存来源',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('[aria-label="已保存的模组来源"]').selectedOptions[0].textContent.startsWith('收藏名收藏名'));
 for(const theme of ['dark','light']){
  await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption(theme);await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();
  await page.getByRole('button',{name:'保存来源',exact:true}).scrollIntoViewIfNeeded();await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  assert.equal(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2),false,'来源收藏横向溢出 '+theme);
  fs.mkdirSync('artifacts/ui',{recursive:true});await page.screenshot({path:'artifacts/ui/sources-1024-'+theme+'.png'});
 }
 // 读取真实目录后切换收藏必须清除旧列表；切回来仍需重新读取。
 await call(page,'marketRefresh',{repository:repo});await call(page,'marketSave',{repository:'octocat/Hello-World',label:'另一个公开来源'});
 let switched=await call(page,'market');assert.equal(switched.assets.length,0);assert.equal(switched.checked,null);
 await page.reload();await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();await page.getByLabel('已保存的模组来源').selectOption(repo.toLowerCase());
 await page.waitForFunction(repo=>document.querySelector('[aria-label="GitHub 仓库"]').value===repo,repo);
 switched=await call(page,'market');assert.equal(switched.assets.length,0);assert.equal(switched.checked,null);
 await page.getByRole('button',{name:'移除来源收藏',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="GitHub 仓库"]').value==='');
 assert.equal((await call(page,'market')).sources.length,1);const state=await call(page,'state');assert.ok(state.imports.some(r=>r.id===reportId));assert.ok(fs.existsSync(sourceFile));assert.equal(state.mods.length,0);assert.equal(state.transactions.length,0);assert.equal((await call(page,'market')).downloads.length,0);
 assert.deepEqual(errors,[]);
 const evidence={checked:new Date().toISOString(),version:state.version,sourceUI:'passed',realElectronRestart:'passed',sqlitePersistence:'passed',actualPublicAPIRead:'passed',publicationFiles:read.assets.length,staleDownloadRejected:true,selectionClearsCatalogue:true,renaming:'passed',removalPreservesActualImport:true,themes:['dark','light'],resolution:'1024x768',automaticGameWrite:false,gameCompatibility:'not-tested'};
 fs.writeFileSync('artifacts/source-library-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{
 if(app)await app.close();for(const root of [data,fixture]){assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-sources-ui-'));fs.rmSync(root,{recursive:true});}
}
