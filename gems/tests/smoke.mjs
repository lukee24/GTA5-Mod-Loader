import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const executablePath=process.env.GEMS_SMOKE_EXE;
if(!executablePath||!fs.existsSync(executablePath))throw new Error('请提供真实已构建程序 GEMS_SMOKE_EXE');
const data=fs.mkdtempSync(path.join(os.tmpdir(),'gems-packaged-smoke-'));
const app=await electron.launch({executablePath,args:[],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
try{
 const page=await app.firstWindow();
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 const packaged=await app.evaluate(({app})=>app.isPackaged);
 const state=await page.evaluate(()=>window.gems.call('state'));
 if(!packaged||!state.ok||state.data.mods.length||state.data.dataPath!==data)throw new Error('已打包程序运行状态与独立空数据库不符');
 const isolation=await page.evaluate(()=>typeof window.require==='undefined');
 if(!isolation)throw new Error('渲染隔离失败');
 if(process.env.GEMS_SMOKE_SCALE==='1.2'){
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));
  await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('界面缩放').selectOption('1.2');await page.waitForFunction(()=>document.querySelector('.app').style.getPropertyValue('--ui-scale')==='1.2');
  await page.locator('nav').getByRole('button',{name:'首页',exact:true}).click();await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  const captured=await app.evaluate(async({BrowserWindow})=>{const native=await BrowserWindow.getAllWindows()[0].capturePage();return{data:native.toPNG().toString('base64'),size:native.getSize()};});
  fs.mkdirSync('artifacts/ui',{recursive:true});fs.writeFileSync('artifacts/ui/native-120percent.png',Buffer.from(captured.data,'base64'));console.log('已保存实际窗口原生截图：',captured.size);
 }
 console.log('通过：已打包 Windows 程序启动、实际 SQLite 空库、中文首页与渲染隔离。',path.basename(executablePath));
}finally{await app.close();}
