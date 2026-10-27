import {BrowserWindow,Menu,dialog,session} from 'electron';
import {downloadUrl} from '../packages/marketplace/network';
import {sites,officialUrl} from '../packages/marketplace/providers';
import type {SiteId} from '../packages/marketplace/types';
import type {Downloads} from '../packages/marketplace/downloads';
import {awaitAbort} from '../packages/core/await-abort';
// 远程网站位于独立沙箱窗口，无 preload、无 GEMS IPC、无本地文件权限。
export async function browseSite(owner:BrowserWindow,downloads:Downloads,id:SiteId,category?:string,brand?:string,vehicleType?:string,lifecycle?:AbortSignal){
  lifecycle?.throwIfAborted();
  const site=sites.find(s=>s.id===id);if(!site)throw new Error('未知模组网站');
  const initial=officialUrl(id,category,brand,vehicleType);
  const host=new URL(initial).hostname;
  const partition='gems-site-'+crypto.randomUUID();const isolated=session.fromPartition(partition);
  isolated.setPermissionRequestHandler((_,__,callback)=>callback(false));isolated.setPermissionCheckHandler(()=>false);
  const browser=new BrowserWindow({parent:owner,width:1120,height:850,minWidth:800,minHeight:600,title:'GEMS · '+site.name+' 官方网站（网站原文）',webPreferences:{partition,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false}});
  const closed=new AbortController();
  // 退出时销毁本函数创建的远程窗口，远程 beforeunload 不得阻止桌面事务安全收尾。
  const destroy=()=>{if(!browser.isDestroyed())browser.destroy();};
  lifecycle?.addEventListener('abort',destroy,{once:true});
  const navigationHosts=new Set([host,host.replace(/^www\./,''),...(id==='gta5mods'?['files.gta5-mods.com']:id==='github'?['release-assets.githubusercontent.com','objects.githubusercontent.com']:[])]);
  const allowed=(value:string)=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.port&&!u.username&&!u.password&&navigationHosts.has(u.hostname);}catch{return false;}};
  browser.webContents.on('page-title-updated',event=>event.preventDefault());
  browser.webContents.setWindowOpenHandler(({url})=>{if(allowed(url))void browser.loadURL(url).catch(()=>{});return{action:'deny'};});
  browser.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault();});
  browser.webContents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault();});
  browser.setMenu(Menu.buildFromTemplate([{label:'浏览',submenu:[{label:'返回',click:()=>{if(browser.webContents.navigationHistory.canGoBack())browser.webContents.navigationHistory.goBack();}},{label:'前进',click:()=>{if(browser.webContents.navigationHistory.canGoForward())browser.webContents.navigationHistory.goForward();}},{label:'刷新',click:()=>browser.webContents.reload()},{label:'关闭',click:()=>browser.close()}]}]));
  const notify=(options:Electron.MessageBoxOptions)=>{
    if(!browser.isDestroyed())void dialog.showMessageBox(browser,options).catch(()=>{});
  };
  const receiveDownload=(event:Electron.Event,item:Electron.DownloadItem)=>{
    // 拦截网站下载后交给受限下载器；不执行网站提供的文件，也不传递账户 Cookie。
    const remoteUrl=item.getURL(),filename=item.getFilename(),size=item.getTotalBytes();event.preventDefault();
    try{
      if(id==='nexus')throw new Error('Nexus 授权下载尚未接入。请用官方浏览器完成下载，再将安装包拖入 GEMS。');
      const url=downloadUrl(remoteUrl);
      if(id==='gta5mods'&&!['files.gta5-mods.com','www.gta5-mods.com','gta5-mods.com'].includes(url.hostname))throw new Error('此下载由外部网站提供，请在官方浏览器完成下载后导入。');
      if(id==='github'&&url.hostname!=='github.com'&&url.hostname!=='release-assets.githubusercontent.com')throw new Error('此文件不是 GitHub 发布包');
      downloads.add({name:filename,pageUrl:browser.webContents.getURL(),downloadUrl:url.href,size:Math.max(0,size),digest:null});
      notify({type:'info',title:'GEMS 下载队列',message:'已加入下载队列',detail:'下载后自动分析。请回到 GEMS 的“下载与更新”查看进度与安装检查。'});
    }catch(error){notify({type:'warning',title:'GEMS 无法接收此下载',message:(error as Error).message});}
  };
  isolated.on('will-download',receiveDownload);
  browser.once('closed',()=>{
    closed.abort(new Error('已关闭网站窗口'));
    lifecycle?.removeEventListener('abort',destroy);
    isolated.removeListener('will-download',receiveDownload);
    void isolated.clearStorageData().catch(()=>{});
  });
  const deadline=AbortSignal.timeout(45000);
  const loading=AbortSignal.any([closed.signal,deadline,...(lifecycle?[lifecycle]:[])]);
  try{
    // 原始 loadURL 的晚到拒绝被消费；关闭或超时不会一直占住桌面操作锁。
    await awaitAbort(()=>browser.loadURL(initial),loading);
    return null;
  }catch(error){
    if(lifecycle?.aborted){destroy();throw lifecycle.reason;}
    if(closed.signal.aborted)return{canceled:true};
    destroy();
    throw new Error(deadline.aborted?'官方网站加载超时，请检查网络连接后重试':'官方网站打开失败，请检查网络连接',{cause:error});
  }
}
