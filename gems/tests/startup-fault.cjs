// Only loaded explicitly by startup-ui.mjs into its isolated development Electron process.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {BrowserWindow,dialog}=require('electron');
const root=path.resolve(process.env.GEMS_STARTUP_FIXTURE_ROOT||'');
const mode=process.env.GEMS_STARTUP_FIXTURE_MODE;
if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-startup-ui-')||!['environment','document-reject','document-resolve','real-failure'].includes(mode))throw Error('启动故障夹具范围无效');
const marker=path.join(root,'started');
dialog.showErrorBox=(title,message)=>fs.writeFileSync(path.join(root,'error-box.json'),JSON.stringify({title,message}));
if(mode==='environment'){
  const cp=require('node:child_process'),symbol=Symbol.for('nodejs.util.promisify.custom'),original=cp.execFile[symbol];
  cp.execFile[symbol]=(file,args,options)=>{
    if(!file.toLowerCase().endsWith('tasklist.exe'))return original(file,args,options);
    const pending=original(process.env.GEMS_STARTUP_FIXTURE_NODE,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],options);
    globalThis.__gemsStartupChild=pending.child;
    pending.child.stdout.once('data',()=>fs.writeFileSync(marker,String(pending.child.pid)));return pending;
  };
}else{
  const original=BrowserWindow.prototype.loadURL;
  BrowserWindow.prototype.loadURL=function(url,...args){
    if(!url.startsWith('file:')||!url.endsWith('/renderer/index.html'))return original.call(this,url,...args);
    fs.writeFileSync(marker,'document');
    // Actual window and renderer. Hold only the startup promise to exercise close-time races.
    const loaded=original.call(this,url,...args);loaded.catch(()=>{});
    return new Promise((resolve,reject)=>{
      if(mode==='real-failure')setTimeout(()=>{
        // Real Chromium missing-file failure, delayed only so the test can observe startup.
        const missing=require('node:url').pathToFileURL(path.join(root,'missing-renderer.html')).href;
        original.call(this,missing).then(resolve,reject);
      },1500);
      else this.once('closed',()=>mode==='document-resolve'?resolve():reject(Error('测试夹具：窗口关闭后启动文档拒绝')));
    });
  };
}
