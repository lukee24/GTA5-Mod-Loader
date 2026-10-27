import {chromium} from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';

// NSIS 便携包装器不转发 Electron 调试 stderr；直接连接本次测试的本机临时端口。
const version=JSON.parse(fs.readFileSync('package.json','utf8')).version;
const executable=path.resolve(`release/GEMS-${version}-x64-portable.exe`);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'gems-portable-smoke-'));
const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));
const child=spawn(executable,[`--remote-debugging-port=${port}`,'--remote-debugging-address=127.0.0.1'],{env:{...process.env,GEMS_TEST_DATA:data},windowsHide:true});
const ended=new Promise(resolve=>child.once('exit',code=>resolve(code)));let browser;
try{
 let ready=false;
 for(let n=0;n<40&&!ready;n++){
  if(child.exitCode!==null)throw new Error('便携包装器在准备前退出：'+child.exitCode);
  try{const response=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(500)});ready=response.ok;}catch{}
  if(!ready)await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready)throw new Error('便携程序没有启动渲染进程');
 browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
 const page=browser.contexts()[0].pages()[0];
 await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 const result=await page.evaluate(async()=>({reply:await window.gems.call('state'),isolated:typeof window.require==='undefined'}));
 if(!result.reply.ok||result.reply.data.mods.length||result.reply.data.dataPath!==data||!result.isolated)throw new Error('便携版真实 IPC / SQLite / 隔离检查失败');
 await page.evaluate(()=>{void window.gems.call('window','close');});
 const timeout=setTimeout(()=>{if(child.exitCode===null)child.kill();},15000);const exit=await ended;clearTimeout(timeout);
 if(exit!==0)throw new Error('便携包装器未正确关闭：'+exit);
 console.log('通过：实际便携 EXE 解包启动、中文首页、SQLite 空库、IPC、渲染隔离及正常关闭。测试临时调试端口随程序关闭。');
}finally{
 if(browser)await browser.close().catch(()=>{});
 if(child.exitCode===null&&child.pid)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F']);
}
