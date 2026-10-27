import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {_electron as electron} from 'playwright';import {firstElectronWindow} from './electron-window.mjs';
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const artifact=path.resolve('artifacts',process.env.GEMS_TEST_ARTIFACT||`${version}-ped-thumbnail-ui`);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-ped-thumbnail-')),data=path.join(root,'data'),source=path.join(root,'人物 image source');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const files=['tests/ped-thumbnail-ui.mjs','desktop/main.ts','desktop/renderer/ped-catalog.tsx','desktop/renderer/ped-catalog.css','packages/peds/thumbnail.ts','packages/peds/meta.ts','packages/peds/types.ts',...(process.env.GEMS_PACKAGED_EXE?[path.resolve(process.env.GEMS_PACKAGED_EXE),path.join(path.dirname(process.env.GEMS_PACKAGED_EXE),'resources/app.asar')]:['dist/main.cjs','dist/preload.cjs','dist/renderer/index.html',...fs.readdirSync('dist/renderer/assets').sort().map(name=>'dist/renderer/assets/'+name)])];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(file)])),before=hashes(),checks=[],errors=[];
const write=(file,bytes)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);};
let app,page,passed=false;
async function call(command,args){const reply=await page.evaluate(([command,args])=>window.gems.call(command,args),[command,args]);assert.equal(reply.ok,true,reply.error);return reply.data;}
async function settle(){await page.waitForFunction(()=>[...document.querySelectorAll('.ped-catalog button')].some(button=>button.textContent.includes('刷新记录')&&!button.disabled));}
async function openPeds(){await page.locator('nav').getByRole('button',{name:'人物中心',exact:true}).click();await page.locator('.ped-catalog').waitFor();await settle();}
const card=name=>page.locator('.ped-reference').filter({has:page.getByRole('button',{name:'收藏人物 '+name,exact:true})});
try{
 fs.mkdirSync(path.dirname(artifact),{recursive:true});
 app=await electron.launch({...(process.env.GEMS_PACKAGED_EXE?{executablePath:process.env.GEMS_PACKAGED_EXE,args:[]}:{args:['.']}),env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
 page=await firstElectronWindow(app);page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();assert.equal((await call('state')).version,version);
 await app.evaluate(({shell})=>{shell.openExternal=async()=>{throw new Error('Unexpected external launch');};shell.openPath=async()=>{throw new Error('Unexpected external path');};});
 // Own synthetic pixel fixtures from the actual Chromium encoder; no third-party image is used.
 const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=40;canvas.height=30;const ctx=canvas.getContext('2d');const gradient=ctx.createLinearGradient(0,0,40,30);gradient.addColorStop(0,'#355ee8');gradient.addColorStop(1,'#edcc54');ctx.fillStyle=gradient;ctx.fillRect(0,0,40,30);return{png:canvas.toDataURL('image/png').split(',')[1],jpeg:canvas.toDataURL('image/jpeg',.8).split(',')[1]};});
 const png=Buffer.from(encoded.png,'base64'),jpeg=Buffer.from(encoded.jpeg,'base64');
 const invalidJpeg=Buffer.from([255,216,255,192,0,17,8,0,30,0,40,3,1,17,0,2,17,0,3,17,0,255,218,0,12,3,1,0,2,17,3,17,0,63,0,0,255,217]);
 write(path.join(source,'images/portrait.png'),png);write(path.join(source,'images/portrait.jpg'),jpeg);write(path.join(source,'images/not-decodable.jpg'),invalidJpeg);
 const declarations=[{modelName:'GEMS_THUMB_PNG',thumbnail:'images/portrait.png'},{modelName:'GEMS_THUMB_JPEG',thumbnail:'images/portrait.jpg'},{modelName:'GEMS_THUMB_REJECT',thumbnail:'images/not-decodable.jpg'},{modelName:'GEMS_THUMB_NONE'}];
 write(path.join(source,'peds.meta'),'<CPedModelInfo__InitDataList><InitDatas>'+declarations.map(item=>`<Item><Name>${item.modelName}</Name><Pedtype>CIVMALE</Pedtype></Item>`).join('')+'</InitDatas></CPedModelInfo__InitDataList>');
 write(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name:'Synthetic own thumbnail fixtures',files:[{source:'peds.meta',target:'mods/GEMS-thumbnail/peds.meta'}],pedReferences:{schemaVersion:1,entries:declarations.map(item=>({...item,kind:'addon',sourceFiles:['peds.meta']}))}}));
 const originals=Object.fromEntries(['peds.meta','gems.mod.json','images/portrait.png','images/portrait.jpg','images/not-decodable.jpg'].map(file=>[file,sha(path.join(source,file))]));
 const imported=await call('import',{paths:[source]});assert.deepEqual(imported.errors,[]);const report=imported.state.imports.find(item=>item.original===source);assert.ok(report);
 await page.reload();await openPeds();await page.getByLabel('选择人物来源').selectOption('import:'+report.id);await page.locator('.ped-catalog').getByRole('button',{name:'解析此来源',exact:true}).click();await settle();
 const view=(await call('pedIndexes')).find(item=>item.source.kind==='import'&&item.source.id===report.id);assert.equal(view.status,'current');assert.equal(view.analysis.references.length,4);
 for(const [name,mime]of [['GEMS_THUMB_PNG','image/png'],['GEMS_THUMB_JPEG','image/jpeg']]){
  const img=card(name).getByRole('img');await img.scrollIntoViewIfNeeded();await img.evaluate(node=>node.decode());
  assert.deepEqual(await img.evaluate(node=>({width:node.naturalWidth,height:node.naturalHeight,source:node.src.split(';')[0]})),{width:40,height:30,source:'data:'+mime});
  const ref=view.analysis.references.find(item=>item.modelName===name);assert.equal(ref.thumbnail.mime,mime);await card(name).getByText('图片来源',{exact:true}).click();assert.ok((await card(name).innerText()).includes(ref.thumbnail.sourceSha256));
 }
 assert.equal(await card('GEMS_THUMB_NONE').getByRole('img').count(),0);assert.ok((await card('GEMS_THUMB_NONE').innerText()).includes('暂无模型图'));
 checks.push('真实扫描/明确清单索引绑定PNG及JPEG来源；Electron nativeImage与Chromium实际解码40×30图片，来源SHA可见；无声明不猜图');
 assert.equal(await card('GEMS_THUMB_REJECT').getByRole('img').count(),0);assert.match(await card('GEMS_THUMB_REJECT').locator('.ped-thumbnail-issue').innerText(),/JPEG.*解码/);
 checks.push('只有合法JPEG尺寸和扫描头但无可解码像素的夹具被真实Electron解码器拒绝，其它人物和图片继续可用');
 const identity={source:{kind:'import',id:report.id},referenceId:view.analysis.references.find(item=>item.modelName==='GEMS_THUMB_PNG').referenceId};
 const retainedIndex=JSON.stringify(view.analysis),copiedPng=report.files.find(item=>item.path==='images/portrait.png').source;
 const altered=Buffer.from(png);altered[altered.length-5]^=1;write(copiedPng,altered);
 await page.locator('.ped-catalog').getByRole('button',{name:'刷新记录',exact:true}).click();await settle();assert.equal(await card('GEMS_THUMB_PNG').getByRole('img').count(),0);assert.match(await card('GEMS_THUMB_PNG').locator('.ped-thumbnail-issue').innerText(),/摘要|变化|一致/);
 assert.equal(JSON.stringify((await call('pedIndexes')).find(item=>item.source.kind==='import'&&item.source.id===report.id).analysis),retainedIndex);
 write(copiedPng,png);await page.locator('.ped-catalog').getByRole('button',{name:'刷新记录',exact:true}).click();await settle();await card('GEMS_THUMB_PNG').getByRole('img').scrollIntoViewIfNeeded();await card('GEMS_THUMB_PNG').getByRole('img').evaluate(node=>node.decode());
 checks.push('来源图像修改后刷新拒绝读取且旧索引保留；恢复原字节后图片重新可读');
 const noImage={source:{kind:'import',id:report.id},referenceId:view.analysis.references.find(item=>item.modelName==='GEMS_THUMB_NONE').referenceId};assert.equal((await call('pedThumbnails',{identities:[noImage]}))[0].image,null);
 const bad=await call('pedThumbnails',{identities:[{...identity,path:'C:/outside.png'}]});assert.equal(bad[0].image,null);assert.ok(bad[0].error);
 const oversized=await page.evaluate(identity=>window.gems.call('pedThumbnails',{identities:Array(21).fill(identity)}),identity);assert.equal(oversized.ok,false);assert.match(oversized.error,/20/);
 checks.push('无图片返回null；渲染端任意路径和超过20项批量请求拒绝，无外部读取或启动');
 await call('settings',{theme:'light',scale:1.2});await page.reload();await openPeds();await page.getByLabel('选择人物来源').selectOption('import:'+report.id);await settle();
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(980,760));await card('GEMS_THUMB_JPEG').scrollIntoViewIfNeeded();await card('GEMS_THUMB_JPEG').getByRole('img').evaluate(node=>node.decode());
 assert.equal(await page.locator('main').evaluate(node=>node.scrollWidth>node.clientWidth+2),false);
 const capture=await app.evaluate(async({BrowserWindow})=>Array.from((await BrowserWindow.getAllWindows()[0].capturePage()).toPNG()));fs.writeFileSync(artifact+'-light-small-native.png',Buffer.from(capture));
 assert.deepEqual(Object.fromEntries(Object.keys(originals).map(file=>[file,sha(path.join(source,file))])),originals);assert.deepEqual((await call('state')).mods,[]);assert.deepEqual(errors,[]);assert.deepEqual(hashes(),before);
 await app.close();app=undefined;assert.deepEqual(hashes(),before);
 const result={checked:new Date().toISOString(),applicationVersion:version,testedSha256:before,checks,errors,sourceUnchanged:true,substitutions:['Own synthetic gradient PNG/JPEG encoded by actual Chromium; not real ped art or game captures','A fake JPEG has bounded valid headers but no valid decoded pixels; actual nativeImage must reject it','Private real import/SQLite/IPC/renderer; no native dialog or game launch'],gameplayVerified:false,realGameWritten:false};fs.writeFileSync(artifact+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));passed=true;
}finally{if(app)await app.close().catch(()=>{});if(passed){assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-ped-thumbnail-'));fs.rmSync(root,{recursive:true});}else console.error(JSON.stringify({retainedFixture:root}));}
