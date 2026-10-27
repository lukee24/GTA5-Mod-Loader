import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 真实 Chromium DownloadItem -> GEMS 下载队列；不伪造下载事件或结果。
const data=fs.mkdtempSync(path.join(os.tmpdir(),'gems-site-download-'));
const app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
try{
 const page=await app.firstWindow();await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 // 仅自动应答产品“加入队列”的信息通知；不涉及覆盖、脚本、安全或登录确认。
 await app.evaluate(({dialog})=>{globalThis.gemsSiteNotice='';const original=dialog.showMessageBox;dialog.showMessageBox=async(...args)=>{const options=args.length===2?args[1]:args[0];if(['GEMS 下载队列','GEMS 无法接收此下载'].includes(options.title)){globalThis.gemsSiteNotice=options.message;return{response:0,checkboxChecked:false};}return original(...args);};});
 const opened=await page.evaluate(()=>window.gems.call('browseSite',{site:'github'}));if(!opened.ok)throw Error(opened.error);
 const sourceUrl='https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/tag/v1.1.0.6';
 await app.evaluate(async({BrowserWindow},url)=>{const child=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://github.com/'));if(!child)throw Error('GitHub 网站窗口缺失');await child.loadURL(url);},sourceUrl);
 await app.evaluate(async({BrowserWindow})=>{const child=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('https://github.com/'));try{await child.webContents.executeJavaScript('location.href="https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/releases/download/v1.1.0.6/ScriptHookVDotNetEnhanced-v1.1.0.6.zip"');}catch{}});
 let record;const deadline=Date.now()+60000;
 while(Date.now()<deadline){const reply=await page.evaluate(()=>window.gems.call('market'));if(!reply.ok)throw Error(reply.error);record=reply.data.downloads[0];if(record&&['已分析','失败'].includes(record.status))break;const notice=await app.evaluate(()=>globalThis.gemsSiteNotice);if(notice&&notice!=='已加入下载队列')throw Error('网站交接：'+notice);await new Promise(r=>setTimeout(r,200));}
 if(!record)throw Error('真实网站窗口未产生下载事件');
 if(record.status!=='已分析'||record.sha256!=='f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a'||record.sourceUrl!==sourceUrl)throw Error('实际网站下载交接失败：'+record.error);
 const state=await page.evaluate(()=>window.gems.call('state'));if(state.data.mods.length||state.data.transactions.length)throw Error('浏览下载写入了游戏');
 const evidence={checked:new Date().toISOString(),scope:'实际 GitHub 网站窗口下载事件、受限下载器、自动扫描，未测试 GTA5-Mods 下载',sourceUrl,asset:record.name,bytes:record.received,sha256:record.sha256,result:'passed',gameWritten:false};
 fs.writeFileSync('artifacts/site-download-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{await app.close();}
