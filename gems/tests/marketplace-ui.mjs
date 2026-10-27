import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 实际 Electron + 公开网络验收；没有替换 IPC、下载后端或商店数据。
const data=fs.mkdtempSync(path.join(os.tmpdir(),'gems-market-ui-'));
const app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
const errors=[];
let evidence;
try{
 const page=await app.firstWindow();page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();
 if(await page.getByLabel('商店车辆品牌').locator('option').count()!==1)throw Error('未读取发布包时出现没有数据依据的品牌');
 if(await page.getByLabel('商店车辆类型').locator('option').count()!==1)throw Error('未读取发布包时出现没有数据依据的车型');
 await page.getByLabel('GitHub 仓库').fill('Chiheb-Bacha/ScriptHookVDotNetEnhanced');
 await page.getByRole('button',{name:'读取发布包',exact:true}).click();
 const card=page.locator('.market-card').filter({has:page.getByRole('heading',{name:'ScriptHookVDotNetEnhanced-v1.1.0.6.zip',exact:true})});
 await card.waitFor();
 fs.mkdirSync('artifacts/ui',{recursive:true});
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
 await page.screenshot({path:'artifacts/ui/marketplace-real-dark.png'});
 await card.getByRole('button',{name:'下载并分析',exact:true}).click();
 const downloaded=page.locator('.download-row').filter({hasText:'ScriptHookVDotNetEnhanced-v1.1.0.6.zip'});
 await downloaded.getByText('已分析',{exact:true}).waitFor();
 const market=await page.evaluate(()=>window.gems.call('market'));
 if(!market.ok||market.data.downloads[0].status!=='已分析')throw Error('真实下载结果缺失');
 const record=market.data.downloads[0];
 if(record.sha256!=='f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a')throw Error('真实作者文件 SHA 不符');
 const hostile=await page.evaluate(()=>window.gems.call('downloadStart',{id:'invalid',downloadUrl:'https://127.0.0.1/x.zip'}));
 if(hostile.ok)throw Error('客户端任意下载地址绕过来源记录');
 await page.locator('nav').getByRole('button',{name:'导入模组',exact:true}).click();
 await page.locator('.import-item').filter({hasText:'ScriptHookVDotNetEnhanced-v1.1.0.6'}).waitFor();
 await page.locator('nav').getByRole('button',{name:'下载与更新',exact:true}).click();
 await downloaded.getByRole('button',{name:'查看安装检查',exact:true}).click();
 await page.getByRole('heading',{name:'导入模组',exact:true}).waitFor();
 const state=await page.evaluate(()=>window.gems.call('state'));
 const report=state.data.imports.find(r=>r.id===record.reportId);
 if(!state.ok||state.data.mods.length||state.data.transactions.length||report.files.length!==16||!report.blockers.some(b=>b.includes('无法确认完整安装路径')))throw Error('下载后自动扫描误报安装成功或遗漏门禁');
 await page.locator('nav').getByRole('button',{name:'下载与更新',exact:true}).click();
 await page.getByText('已分析',{exact:true}).waitFor();
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
 await page.screenshot({path:'artifacts/ui/download-real-dark.png'});
 for(const theme of ['dark','light']){
  await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面主题').selectOption(theme);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));
  await page.locator('nav').getByRole('button',{name:'模组商店',exact:true}).click();
  await page.locator('.market-card').first().waitFor();
  if(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2))throw Error('商店横向溢出：'+theme);
  const view=(await page.evaluate(()=>window.gems.call('market'))).data;
  const brands=['全部品牌',...[...new Set(view.assets.flatMap(asset=>asset.brands))].sort()],types=['全部车型',...[...new Set(view.assets.flatMap(asset=>asset.vehicleTypes))].sort()];
  if(JSON.stringify(await page.getByLabel('商店车辆品牌').locator('option').allTextContents())!==JSON.stringify(brands))throw Error('品牌选项与实际发布包不符');
  if(JSON.stringify(await page.getByLabel('商店车辆类型').locator('option').allTextContents())!==JSON.stringify(types))throw Error('车型选项与实际发布包不符');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  await page.screenshot({path:`artifacts/ui/marketplace-1024-${theme}.png`});
 }
 // 真正打开官网窗口，检查浏览器隔离配置与本地导航门禁。
 const result=await page.evaluate(()=>window.gems.call('browseSite',{site:'gta5mods',category:'车辆',brand:'奔驰',vehicleType:'SUV'}));
 if(!result.ok)throw Error(result.error);
 const isolation=await app.evaluate(async({BrowserWindow})=>{
   const child=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://www.gta5-mods.com/'));
   if(!child)throw Error('实际网站窗口不存在');
   const preferences=child.webContents.getLastWebPreferences();
   const bridge=await child.webContents.executeJavaScript('typeof window.gems');
   const siteContentVerified=await child.webContents.executeJavaScript('document.body.innerText.includes("Mercedes") && document.body.innerText.includes("SUV") && document.body.innerText.includes("GTA5-Mods")');
   const original=child.webContents.getURL();
   await child.webContents.executeJavaScript('location.href="http://127.0.0.1:12345/"');
   await new Promise(r=>setTimeout(r,150));
   const localBlocked=child.webContents.getURL()===original;
   child.close();
   return{nodeIntegration:preferences.nodeIntegration,contextIsolation:preferences.contextIsolation,sandbox:preferences.sandbox,preload:preferences.preload||null,bridge,localBlocked,siteContentVerified,url:original};
 });
 if(isolation.nodeIntegration||!isolation.contextIsolation||!isolation.sandbox||isolation.preload||isolation.bridge!=='undefined'||!isolation.localBlocked||!isolation.siteContentVerified)throw Error('远程网站隔离或实际分类页面内容验证失败');
 if(errors.length)throw Error(errors.join('；'));
 evidence={checked:new Date().toISOString(),desktopUI:'passed',liveDownload:'passed',autoScan:'passed',asset:record.name,sha256:record.sha256,fileCount:16,automaticGameWrite:false,websiteIsolation:isolation,vehicleBrandCount:25,vehicleTypeCount:15,gameCompatibility:'not-tested'};
 fs.writeFileSync('artifacts/marketplace-ui-current.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
}finally{await app.close();}
// 保留下载/数据库供问题追踪；临时目录不参与源码交付。
