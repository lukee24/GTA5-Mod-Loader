import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Observed with Electron 44 / Playwright 1.64: attaching to a window whose URL
// is still empty reports Inspector.targetCrashed. That same target subsequently
// renders normally, while ElectronApplication never reports a Page.
// Observe the actual renderer, then attach a fresh CDP connection when needed.
// This does not synthesize DOM, bypass IPC, change startup, or extend the timeout.
export async function firstElectronWindow(app,{timeout=30000}={}){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
    const known=app.windows()[0];
    if(known)return known;
    const observed=await app.evaluate(({app,BrowserWindow})=>({
      userData:app.getPath('userData'),
      windows:BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()).map(w=>({
        id:w.webContents.id,url:w.webContents.getURL(),loading:w.webContents.isLoading()
      }))
    }));
    const ready=observed.windows.find(w=>w.url.startsWith('file:')&&!w.loading);
    if(ready){
      const [portText,browserPath]=fs.readFileSync(path.join(observed.userData,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/);
      assert.match(portText,/^[0-9]{1,5}$/);
      const port=Number(portText);assert.ok(port>0&&port<=65535);
      assert.match(browserPath,/^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
      const browser=await chromium.connectOverCDP(`ws://127.0.0.1:${port}${browserPath}`,{timeout:Math.max(1,deadline-Date.now())});
      try{
        const page=browser.contexts().flatMap(context=>context.pages()).find(page=>page.url()===ready.url);
        assert.ok(page,'CDP did not expose the observed Electron renderer');
        const session=await page.context().newCDPSession(page);
        let targetId;try{targetId=(await session.send('Target.getTargetInfo')).targetInfo.targetId;}finally{await session.detach();}
        assert.equal(await app.evaluate(({webContents},{targetId,id})=>webContents.fromDevToolsTargetId(targetId)?.id===id,{targetId,id:ready.id}),true,'CDP target does not belong to this Electron window');
        app.once('close',()=>{void browser.close().catch(()=>{});});
        console.log(JSON.stringify({testTransport:'CDP reattach to same loaded Electron renderer',webContentsId:ready.id,reason:'ElectronApplication did not report the loaded window',applicationModified:false}));
        return page;
      }catch(error){await browser.close().catch(()=>{});throw error;}
    }
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error(`Electron did not expose a loaded window within ${timeout}ms`);
}
