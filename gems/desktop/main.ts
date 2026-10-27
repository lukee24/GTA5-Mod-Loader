import {readSnapshots,readSnapshot,saveSnapshot,assertSnapshotCapacity} from '../packages/backup/snapshot-records';
import {snapshotReport} from '../packages/backup/snapshot-report';
import {readImports,readImport,saveImport} from '../packages/scanner/import-records';
import {readMods,readMod,assertModWrite} from '../packages/installer/mod-records';
import {readTransactions,readTransaction} from '../packages/installer/recovery-records';
import {saveManualTargets} from '../packages/installer/manual-targets';
import {readSettings,readWindowSettings,updateSettings,bindGameSettings,saveWindowSettings} from '../packages/core/settings';
import {app,BrowserWindow,dialog,ipcMain,shell,session,screen,clipboard,nativeImage} from 'electron';
import fs from 'node:fs';
import {explainError} from '../packages/core/errors';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer,validateTarget} from '../packages/installer';
import {scan,walk} from '../packages/scanner';
import {guardGame,inspectEnvironment,diagnose,metrics} from '../packages/diagnostics';
import {catalogText} from '../packages/bridge';
import {listWeaponReferenceIndexes,analyzeWeaponReferences,prepareWeaponCatalog,verifyWeaponCatalogSnapshot} from '../packages/weapons';
import {listPedReferenceIndexes,analyzePedReferences,listPedUserStates,setPedUserState,preparePedCatalog,verifyPedCatalogSnapshot,readPedThumbnail} from '../packages/peds';
import {atomicWrite,inside,noLinks,hashFile,sameGamePath} from '../packages/core/security';
import {captureCommitTarget,assertCommitTarget} from '../packages/core/commit-target';
import type {Settings,State,ImportReport,InstallPlan,ModRecord,Transaction,Environment,ModUpdatePlan} from '../packages/core/types';
import {RpfArchive} from '../packages/rpf-engine';
import {RpfCopySession} from '../packages/rpf-engine/copy-session';
import {analyzeResourceFile} from '../packages/converter';
import {Downloads} from '../packages/marketplace/downloads';
import {repositoryName,parseReleases,officialUrl} from '../packages/marketplace/providers';
import {releasesJson} from '../packages/marketplace/network';
import type {MarketAsset,MarketView,DownloadRecord} from '../packages/marketplace/types';
import {browseSite} from './site-browser';
import {SourceLibrary} from '../packages/marketplace/sources';
import {OperationGate} from '../packages/core/operation-gate';
import {operationLogs} from '../packages/diagnostics/operation-logs';
import {scriptHookSupport} from '../packages/diagnostics/runtime-support';
import {OperationLogger} from '../packages/core/operation-logger';
import {ModCatalog} from '../packages/marketplace/catalog';
import {ReadTaskGroup} from '../packages/core/read-task-group';
import {HandlingDocuments} from '../packages/vehicles/handling-documents';
import {HandlingHistory} from '../packages/vehicles/handling-history';
import {refreshedRetryAsset} from '../packages/marketplace/download-retry';
import {SteamLauncher} from '../packages/launcher';
import {Profiles,MAX_PROFILE_IMPORT_BYTES} from '../packages/profiles';
import type {ProfileSwitchPlan} from '../packages/profiles/types';
import {readProfileFile} from './profile-file';
app.setPath('userData',path.join(app.getPath('appData'),'GEMS','Studio'));
const development=process.env.GEMS_TEST_DATA; if(development)app.setPath('userData',path.resolve(development));
if(!app.requestSingleInstanceLock()){app.quit();}else{void start().catch(e=>{dialog.showErrorBox('GEMS 无法启动','本地数据库或运行时无法打开。已有数据不会自动删除。\n\n'+explainError(e));app.quit();});}
async function start(){await app.whenReady();const data=app.getPath('userData'),wasm=app.isPackaged?path.join(process.resourcesPath,'sql-wasm.wasm'):path.join(app.getAppPath(),'node_modules/sql.js/dist/sql-wasm.wasm');const store=await Store.open(data,wasm),backup=new Backup(path.join(data,'backup'));let window:BrowserWindow;let environment:Environment|null=null;const settings=()=>readSettings(store);settings();const saved=readWindowSettings(store);const progress=(message:string,current?:number,total?:number)=>{if(window&&!window.isDestroyed())window.webContents.send('gems:progress',{phase:'执行中',message,current,total});};const launcher=new SteamLauncher(store,uri=>shell.openExternal(uri));const baseGameGuard=async(game:string)=>{launcher.assertWritable();await guardGame(game);launcher.assertWritable();};const guardedGame=async(game:string)=>{profiles.assertWritable();await baseGameGuard(game);profiles.assertWritable();};const installer=new Installer(store,backup,guardedGame,progress);const profiles=new Profiles(installer,()=>settings().gamePath,baseGameGuard);let profileStartupIssue:string|null=null;try{await profiles.recover();profiles.assertWritable();}catch(error){profileStartupIssue=explainError(error);}if(!profileStartupIssue)await installer.recover();
  const desktopLogger=new OperationLogger(store),recordLog=(kind:string,message:string)=>desktopLogger.record(kind,message);
  session.defaultSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
  let shutdown=false;const operations=new OperationGate();const networkLifecycle=new AbortController();
  function shutdownWarning(message:string){try{store.logFailure('退出',message);}catch{}console.warn(message);}
  const visible=saved&&screen.getAllDisplays().some(d=>saved.x<d.workArea.x+d.workArea.width&&saved.y<d.workArea.y+d.workArea.height&&saved.x+saved.width>d.workArea.x&&saved.y+saved.height>d.workArea.y);
  window=new BrowserWindow({width:saved?.width||1440,height:saved?.height||940,...(visible?{x:saved.x,y:saved.y}:{}),minWidth:980,minHeight:700,title:'GEMS · GTA5 增强版智能模组中心',backgroundColor:'#0B0E14',frame:false,backgroundMaterial:'mica',webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  const entry=pathToFileURL(path.join(__dirname,'renderer/index.html')).href;window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(e,url)=>{if(url!==entry)e.preventDefault();});window.on('close',event=>{if(!shutdown){event.preventDefault();app.quit();return;}try{saveWindowSettings(store,{...window.getNormalBounds(),maximized:window.isMaximized()});}catch(error){shutdownWarning('窗口位置未保存：'+explainError(error));}});if(saved?.maximized)window.maximize();
  const modCatalog=new ModCatalog(),catalogReads=new ReadTaskGroup();
  const handlingDocuments=new HandlingDocuments(data);
  const handlingHistory=new HandlingHistory(data);
  const plans=new Map<string,{plan:InstallPlan;report:ImportReport}>();let openedRpf:RpfArchive|null=null;let openedRpfSource='';const rpfParents:RpfArchive[]=[];
  const updatePlans=new Map<string,{plan:ModUpdatePlan;report:ImportReport}>();
  const profilePlans=new Map<string,ProfileSwitchPlan>();
  function profileRecovery(){try{return [...(profileStartupIssue?[profileStartupIssue]:[]),...profiles.pending().map(item=>'配置方案 '+item.name+'：'+item.state+(item.error?'，'+item.error:''))];}catch(error){return ['配置方案记录需要核对：'+explainError(error)];}}
  let rpfCopySession:RpfCopySession|null=null;
  let knownDownloadReports='';
  const downloads=new Downloads(store,data,()=>{const ids=downloads.reportIds();if(ids!==knownDownloadReports){knownDownloadReports=ids;if(window&&!window.isDestroyed())window.webContents.send('gems:data-changed');}});knownDownloadReports=downloads.reportIds();const sourceLibrary=new SourceLibrary(store);let marketAssets:MarketAsset[]=[];let marketRepository=sourceLibrary.view().repository;let marketChecked:string|null=null;
  const operationWarnings=()=>[installer.logIssue,desktopLogger.issue,downloads.logIssue].filter((issue):issue is string=>issue!==null);
  const marketView=():MarketView=>{const library=sourceLibrary.view();return{assets:marketAssets,repository:marketRepository,checked:marketChecked,downloads:downloads.list(),sources:library.sources,sourceIssues:library.issues,downloadIssue:downloads.issue,downloadLogIssue:downloads.logIssue};};
  function selectMarket(repository:string){if(repository.toLowerCase()!==marketRepository.toLowerCase()){marketAssets=[];marketChecked=null;}marketRepository=repository;}
  function rememberPlan(plan:InstallPlan,report:ImportReport){if(plans.size>=32)plans.delete(plans.keys().next().value!);plans.set(plan.id,{plan:structuredClone(plan),report:structuredClone(report)});return plan;}
  const rpfView=()=>openedRpf?{name:path.basename(openedRpf.sourceName),entries:openedRpf.list(),nested:openedRpf.inspectNested(),canBack:rpfParents.length>0}:null;
  function launchView(){try{return{launch:launcher.status(),launchIssue:null};}catch(error){return{launch:null,launchIssue:explainError(error)};}}
  function state():State{const transactions=readTransactions(store),{entries:logs,...logInfo}=operationLogs(store);return{...launchView(),version:app.getVersion(),settings:settings(),mods:readMods(store),imports:readImports(store),transactions,logs,logInfo,operationWarnings:operationWarnings(),dataPath:data,environment,recovery:[...profileRecovery(),...transactions.filter(tx=>['准备中','执行中','恢复待处理'].includes(tx.state)).map(tx=>tx.name+'：'+tx.state+(tx.error?'，'+tx.error:''))]};}
  async function confirm(message:string,detail:string){return(await dialog.showMessageBox(window,{type:'warning',title:'GEMS 安全确认',message,detail,buttons:['取消','确认并创建恢复记录'],defaultId:0,cancelId:0,noLink:true})).response===1;}
  function exportDestination(file:string){noLinks(path.parse(file).root,file);for(const root of [app.getAppPath(),path.dirname(app.getPath('exe')),data,settings().gamePath,openedRpfSource,...readImports(store).map(r=>r.original)].filter(Boolean)){const rel=path.relative(root,file);if(!rel||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)))throw new Error('导出不能覆盖游戏、软件、原包或受保护数据目录，请选择独立文件夹');}}
  function rpfCopyDestination(file:string){exportDestination(file);let directory=path.dirname(path.resolve(file));for(;;){if(['GTA5.exe','GTA5_Enhanced.exe'].some(name=>fs.existsSync(path.join(directory,name))))throw new Error('RPF 独立副本不能导出到 GTA V 游戏目录，请选择游戏之外的位置');const parent=path.dirname(directory);if(parent===directory)break;directory=parent;}}
  async function saveJsonText(defaultName:string,text:string){const result=await dialog.showSaveDialog(window,{title:'导出文件',defaultPath:defaultName,filters:[{name:'JSON 文件',extensions:['json']}]});if(result.canceled||!result.filePath)return null;exportDestination(result.filePath);atomicWrite(result.filePath,text);return result.filePath;}
  async function saveJson(defaultName:string,value:unknown){return saveJsonText(defaultName,JSON.stringify(value,null,2));}
  ipcMain.handle('gems:call',async(event,command,args)=>{
    if(event.sender!==window.webContents||event.senderFrame?.url!==entry)return{ok:false,error:'请求来源不受信任'};
    try{
      if(operations.closing)throw new Error('应用正在完成任务并退出，请等待');
      if(command==='window'){if(args==='minimize')window.minimize();else if(args==='maximize')window.isMaximized()?window.unmaximize():window.maximize();else if(args==='close')window.close();return{ok:true,data:null};}
      if(command==='state')return{ok:true,data:state()};
      if(command==='metrics')return{ok:true,data:metrics(settings().gamePath||data)};
      if(command==='snapshots')return{ok:true,data:readSnapshots(store)};
      if(command==='market')return{ok:true,data:marketView(),operationWarnings:operationWarnings()};
      if(command==='downloadCancel'){downloads.cancel(args?.id);return{ok:true,data:marketView()};}
      if(command==='downloadStart'){const asset=marketAssets.find(a=>a.id===args?.id);if(!asset)throw new Error('发布包已过期，请刷新仓库列表');downloads.add(asset);return{ok:true,data:marketView()};}
      if(command==='catalogRead'||command==='catalogThumbnail'){
        const finish=catalogReads.enter();
        try{const signal=AbortSignal.any([networkLifecycle.signal,AbortSignal.timeout(command==='catalogRead'?30000:15000)]);return{ok:true,data:command==='catalogRead'?await modCatalog.read(args,signal):await modCatalog.thumbnail(args?.id,signal)};}finally{finish();}
      }
      operations.enter();
      try{let result:any;
        if(['chooseGame','launchSteam','plan','planEnable','install','planUpdate','updateMod','disable','uninstall','snapshot','restoreSnapshot'].includes(command))profiles.assertWritable();
        switch(command){
          case 'profiles':result=profiles.state();break;
          case 'profileCreate':result=profiles.create({name:args?.name,modIds:args?.modIds,gamePath:settings().gamePath});recordLog('配置方案','创建方案：'+result.name);break;
          case 'profileCopy':result=profiles.copy(args?.id);recordLog('配置方案','复制方案：'+result.name);break;
          case 'profileRename':result=profiles.rename(args?.id,args?.name);recordLog('配置方案','重命名方案：'+result.name);break;
          case 'profileSelection':result=profiles.updateSelection(args?.id,args?.modIds);recordLog('配置方案','保存模组选择：'+result.name+'；'+result.mods.length+' 个引用');break;
          case 'profileImport':{const choice=await dialog.showOpenDialog(window,{title:'导入 GEMS 配置方案',properties:['openFile'],filters:[{name:'GEMS 方案 JSON',extensions:['json']}]});if(choice.canceled||choice.filePaths.length!==1){result=null;break;}result=profiles.importProfile(readProfileFile(choice.filePaths[0],MAX_PROFILE_IMPORT_BYTES),settings().gamePath);recordLog('配置方案','导入方案引用：'+result.name);break;}
          case 'profileExport':result=await saveJsonText('gems-profile.json',profiles.exportProfile(args?.id));break;
          case 'profilePlan':{result=await profiles.planSwitch(args?.id);if(profilePlans.size>=32)profilePlans.delete(profilePlans.keys().next().value!);profilePlans.set(result.id,structuredClone(result));break;}
          case 'profileExecute':{const plan=profilePlans.get(args?.id);if(!plan)throw new Error('方案计划已失效，请重新预览');if(plan.blockers.length)throw new Error(plan.blockers.join('；'));if(!sameGamePath(plan.gamePath,settings().gamePath))throw new Error('游戏目录已变化，请重新预览');const overlaps=plan.overlaps.map(item=>item.target+'：'+item.order.map(layer=>layer.name).join(' → ')+'；最终 '+(item.order.find(layer=>layer.modId===item.winner)?.name||item.winner)).join('\n');if(!await confirm('切换整组受管模组：'+plan.name,'请核对预览中的启用、停用和文件变化。空方案将停用全部受管模组。\n'+(overlaps?'共享目标按下列顺序覆盖：\n'+overlaps:'没有共享目标覆盖。'))){result={canceled:true};break;}if(plan.highRisk&&!await confirm('方案包含脚本、插件或根目录配置','其中的代码可能在游戏加载时运行。请确认模组来源及文件顺序；此确认不代表已完成兼容性或游戏内测试。')){result={canceled:true};break;}result=await profiles.execute(plan.id,{confirmed:true,binary:true});profilePlans.delete(plan.id);recordLog('配置方案',result.message);break;}
          case 'profileRecover':result=await profiles.recover();profileStartupIssue=null;recordLog('配置方案','已尝试恢复中断方案；'+result.length+' 个事务');break;
          case 'handlingHistory':result=handlingHistory.list();break;
          case 'handlingVerify':result=handlingHistory.verify(args?.id);recordLog('车辆配置','核验本地副本：'+result.model+'；哈希与修改清单一致，未执行游戏测试');break;
          case 'downloadRetry':{if(typeof args?.id!=='string'||args.id.length>80)throw new Error('下载记录标识无效');const view=downloads.list().find(item=>item.id===args.id);if(downloads.issue)throw new Error(downloads.issue);const record=view;if(!record)throw new Error('下载记录不存在');if(!view||view.retryIssue)throw new Error(view?.retryIssue||'下载记录不在当前可见范围，请在来源重新选择');if(downloads.issue)throw new Error(downloads.issue);const asset=await refreshedRetryAsset(record,AbortSignal.any([networkLifecycle.signal,AbortSignal.timeout(45000)]));const next=downloads.retry(record.id,asset);recordLog('下载','用户重新核对公开发布后排队：'+next.name+'；原记录 '+record.id+' 保留');result=marketView();break;}
          case 'handlingOpen':{const choice=await dialog.showOpenDialog(window,{title:'选择车辆 handling 配置（只读）',properties:['openFile'],filters:[{name:'车辆配置文件',extensions:['meta','xml']}]});if(choice.canceled||choice.filePaths.length!==1){result=null;break;}result=handlingDocuments.open(choice.filePaths[0]);recordLog('车辆配置','只读载入配置快照：'+result.filename+'；'+result.models.length+' 个实际模型');break;}
          case 'handlingSave':{result=handlingDocuments.save(args?.id,args?.model,args?.changes);recordLog('车辆配置','保存独立配置副本：'+result.model+'；'+result.changes.length+' 项改动；未安装到游戏');break;}
          case 'catalogSource':await shell.openExternal(modCatalog.item(args?.id).pageUrl);result=null;break;
          case 'marketRefresh':{const repository=repositoryName(args?.repository);const json=await releasesJson(repository,AbortSignal.any([networkLifecycle.signal,AbortSignal.timeout(45000)]));const assets=parseReleases(repository,json);const checked=new Date().toISOString();sourceLibrary.recordRead(repository,assets.length,checked);marketAssets=assets;marketRepository=repository;marketChecked=checked;recordLog('模组商店','读取公开发布包：'+repository+'；'+assets.length+' 个 ZIP / OIV');result=marketView();break;}
          case 'marketSave':{const source=sourceLibrary.save(args?.repository,args?.label);selectMarket(source.repository);recordLog('模组商店','保存来源收藏：'+source.repository);result=marketView();break;}
          case 'marketSelect':selectMarket(sourceLibrary.select(args?.repository));result=marketView();break;
          case 'marketRemove':{const removed=sourceLibrary.remove(args?.repository);if(marketRepository.toLowerCase()===removed){marketRepository='';marketAssets=[];marketChecked=null;}recordLog('模组商店','移除来源收藏；安装包与模组记录保留');result=marketView();break;}
          case 'browseSite':result=await browseSite(window,downloads,args?.site,args?.category,args?.brand,args?.vehicleType,networkLifecycle.signal);break;
          case 'openSiteExternal':await shell.openExternal(officialUrl(args?.site,args?.category,args?.brand,args?.vehicleType));result=null;break;
          case 'openMarketSource':{const asset=marketAssets.find(a=>a.id===args?.id);if(!asset)throw new Error('发布记录已过期，请重新读取');await shell.openExternal(asset.pageUrl);result=null;break;}
          case 'settings':{const next=updateSettings(store,args);window.webContents.setZoomFactor(next.scale);result=state();break;}
          case 'chooseGame':{launcher.assertWritable();const choice=await dialog.showOpenDialog(window,{title:'选择 GTA V Enhanced 游戏目录',properties:['openDirectory']});if(!choice.canceled){const root=choice.filePaths[0];environment=await inspectEnvironment(root,networkLifecycle.signal);if(environment.valid){bindGameSettings(store,root);recordLog('环境','选择游戏目录并完成文件检查');}else recordLog('环境','游戏目录未就绪：'+environment.components.map(c=>c.evidence).join('；'));}result=state();break;}
          case 'environment':environment=await inspectEnvironment(settings().gamePath,networkLifecycle.signal);recordLog('环境','已完成文件存在性检查；版本兼容性和游戏平台完整性未验证');result=state();break;
          case 'import':{let sources:string[]=args?.paths;if(!sources){const choice=await dialog.showOpenDialog(window,{title:'选择模组安装包',properties:['openFile','multiSelections'],filters:[{name:'模组文件',extensions:['zip','oiv','oivs','rar','7z','rpf','yft','ytd','ydr','ydd','ymap','ytyp','asi','dll','cs','lua','xml','meta','ini','json']}]});sources=choice.canceled?[]:choice.filePaths;}if(!Array.isArray(sources)||sources.length>100||sources.some(s=>typeof s!=='string'||!path.isAbsolute(s)))throw new Error('导入路径列表无效');const errors=[];for(const [i,source]of sources.entries()){try{const report=await scan(source,data,m=>progress(m,i+1,sources.length));saveImport(store,report);recordLog('扫描',report.name+'：'+report.files.length+' 个文件');}catch(e){const error=path.basename(source)+'：'+explainError(e);errors.push(error);recordLog('错误',error);}}result={state:state(),errors};break;}
          case 'importFolder':{const choice=await dialog.showOpenDialog(window,{title:'选择模组文件夹',properties:['openDirectory']});if(!choice.canceled){const report=await scan(choice.filePaths[0],data,progress);saveImport(store,report);recordLog('扫描',report.name);}result=state();break;}
          case 'plan':{const report=readImport(store,args?.id);if(!report)throw new Error('导入记录不存在');if(readMod(store,report.id)?.status==='已启用')throw new Error('此导入已经安装，请先停用或卸载');result=rememberPlan(await installer.plan(report,settings().gamePath),report);break;}
          case 'setTargets':{const report=saveManualTargets(store,args?.id,args?.targets);recordLog('安装计划','用户指定目标：'+report.name);result=report;break;}
          case 'planUpdate':{const report=readImport(store,args?.reportId),mod=readMod(store,args?.id),tx=mod&&readTransaction(store,mod.transactionId);if(!report||!tx||!sameGamePath(tx.gamePath,settings().gamePath))throw new Error('请先选择已导入的新版本，并绑定旧版所属的游戏目录');const plan=await installer.planUpdate(mod!.id,report);if(updatePlans.size>=32)updatePlans.delete(updatePlans.keys().next().value!);updatePlans.set(plan.id,{plan:structuredClone(plan),report:structuredClone(report)});result=plan;break;}
          case 'updateMod':{const cached=updatePlans.get(args?.id);if(!cached)throw new Error('更新计划已失效，请重新预览');const {plan,report}=cached;if(!sameGamePath(plan.gamePath,settings().gamePath))throw new Error('绑定的游戏目录已变化，请重新预览');if(plan.blockers.length)throw new Error(plan.blockers.join('；'));if(!await confirm('确认用所选安装包更新此模组',plan.previousName+' → '+report.name+'\n写入 '+plan.files.length+' 个文件，恢复或移除 '+plan.removals.length+' 个旧版独有文件。请确认这是同一模组的新版本。\n'+(plan.highRisk?'包含脚本或二进制，游戏加载时可能执行代码。\n':'')+'操作前核验备份；更新失败将尝试恢复旧版，外部修改会保留为恢复待处理。')){result={canceled:true};break;}await installer.update(plan,report,{overwrite:true,binary:true});updatePlans.delete(plan.id);result=state();break;}
          case 'install':{const cached=plans.get(args?.id);if(!cached)throw new Error('安装计划已失效，请重新预览');const {plan,report}=cached;if(!sameGamePath(plan.gamePath,settings().gamePath))throw new Error('绑定的游戏目录已变化，请重新预览');if(plan.blockers.length)throw new Error(plan.blockers.join('；'));if(plan.conflicts.length&&!await confirm('此操作将覆盖现有模组文件',plan.conflicts.map(f=>f.target+' · '+(f.owner||'现有用户文件')).join('\n')+'\n可能涉及 NVE、LWE 或其他现有模组；先保留备份。')){result={canceled:true};break;}if(plan.highRisk&&!await confirm('安装涉及脚本目录、插件或根目录配置', '请核对写入计划并确认来源可信。GEMS 不执行包内程序；其中的脚本或插件可能在游戏加载时执行代码。')){result={canceled:true};break;}await installer.install(plan,report,{overwrite:true,binary:true});plans.delete(plan.id);result=state();break;}
          case 'disable':case 'uninstall':{const mod=readMod(store,args?.id),tx=mod&&readTransaction(store,mod.transactionId);if(!tx||!sameGamePath(tx.gamePath,settings().gamePath))throw new Error('该记录属于另一游戏目录，请先绑定原目录再操作');await installer.disable(args?.id,command==='uninstall');result=state();break;}
          case 'planEnable':{const mod=readMod(store,args?.id),tx=mod&&readTransaction(store,mod.transactionId);if(!mod||!tx||!sameGamePath(tx.gamePath,settings().gamePath))throw new Error('请先绑定此模组原来的游戏目录');result=rememberPlan(await installer.planEnable(mod.id),mod.report);break;}
          case 'setVehicleMeta':{const mod=readMod(store,args?.id);if(!mod||!mod.report.categories.includes('车辆'))throw new Error('车辆记录不存在');const metadata={...mod.metadata};if(typeof args.brand==='string'&&args.brand.length<=80&&!/[\x00-\x1f]/.test(args.brand))metadata.brand=args.brand;if(typeof args.favorite==='boolean')metadata.favorite=args.favorite;mod.metadata=metadata;assertModWrite(store,mod);store.put('mod',mod.id,mod);result=state();break;}
          case 'copySpawn':{const mod=readMod(store,args?.id);if(!mod||!mod.report.spawnNames.includes(args?.name))throw new Error('生成名称不属于该记录');clipboard.writeText(args.name);result=null;break;}
          case 'recover':{const recovered=await profiles.recover();profileStartupIssue=null;profiles.assertWritable();result={messages:[...recovered.map(item=>item.message),...await installer.recover()],state:state()};break;}
          case 'snapshot':{readSnapshots(store);await guardedGame(settings().gamePath);const files=[];for(const dir of ['mods','scripts']){const root=path.join(settings().gamePath,dir);if(fs.existsSync(root))for(const file of await walk(root))files.push({absolute:file.file,relative:dir+'/'+file.relative});}for(const file of fs.readdirSync(settings().gamePath)){if(/\.(asi|ini|dll)$/i.test(file)){const absolute=path.join(settings().gamePath,file);noLinks(settings().gamePath,absolute);if(fs.statSync(absolute).isFile())files.push({absolute,relative:file});}}const snapshot=await backup.snapshot(files,settings().gamePath,plan=>assertSnapshotCapacity(store,plan));saveSnapshot(store,snapshot);recordLog('备份','环境快照：'+snapshot.entries.length+' 个文件');result=state();break;}
          case 'snapshots':result=readSnapshots(store);break;
          case 'restoreSnapshot':{const snap=readSnapshot(store,args?.id);if(!snap)throw new Error('快照不存在');const report=await snapshotReport(snap,backup,data,settings().gamePath);const plan=await installer.plan(report,snap.gamePath,true);saveImport(store,report);result=rememberPlan(plan,report);break;}
          case 'openRpf':{const choice=await dialog.showOpenDialog(window,{title:'选择未加密 RPF7 归档',properties:['openFile'],filters:[{name:'RPF 归档',extensions:['rpf']}]});if(choice.canceled){result=null;break;}noLinks(path.parse(choice.filePaths[0]).root,choice.filePaths[0]);const next=await RpfCopySession.open(choice.filePaths[0]);rpfCopySession=next;openedRpf=next.archive;openedRpfSource=next.sourcePath;rpfParents.length=0;result=rpfView();recordLog('RPF','读取未加密 RPF 目录：'+result.name);break;}
          case 'openNestedRpf':{if(!openedRpf||rpfParents.length>=4||!Number.isSafeInteger(args?.id))throw new Error('请先打开归档；交互嵌套浏览最多 4 层');const entry=openedRpf.list().find(e=>e.id===args.id);if(!entry||entry.type!=='binary'||!entry.path.toLowerCase().endsWith('.rpf'))throw new Error('所选条目不是嵌套 RPF');const bytes=openedRpf.extractBinary(entry.id);if(bytes.length>64*1024**2)throw new Error('嵌套浏览限制为 64 MiB；请先提取后独立打开');const next=RpfArchive.parse(bytes,entry.path);rpfParents.push(openedRpf);openedRpf=next;result=rpfView();break;}
          case 'rpfBack':if(!rpfParents.length)throw new Error('当前已在根归档');openedRpf=rpfParents.pop()!;result=rpfView();break;
          case 'planRpfReplacement':{if(!rpfCopySession||openedRpf!==rpfCopySession.archive||rpfParents.length)throw new Error('请独立打开要修改的 RPF；嵌套浏览不能自动重写父归档');const entry=openedRpf.list().find(entry=>entry.id===args?.id);if(!entry||entry.type!=='binary'||entry.encrypted)throw new Error('仅支持未加密的普通二进制条目替换');const choice=await dialog.showOpenDialog(window,{title:'选择 '+entry.path+' 的新内容（只读）',properties:['openFile']});if(choice.canceled||choice.filePaths.length!==1){result=null;break;}result=await rpfCopySession.preview(entry.id,choice.filePaths[0]);break;}
          case 'exportRpfReplacement':{if(!rpfCopySession||openedRpf!==rpfCopySession.archive||rpfParents.length)throw new Error('RPF 会话已变化，请重新预览');const choice=await dialog.showSaveDialog(window,{title:'导出新的独立 RPF 副本（不覆盖已有文件）',defaultPath:path.basename(openedRpfSource,'.rpf')+'-GEMS-copy.rpf',filters:[{name:'RPF 副本',extensions:['rpf']}]});if(choice.canceled||!choice.filePath){result=null;break;}result=await rpfCopySession.export(args?.id,choice.filePath,rpfCopyDestination);recordLog('RPF','导出独立普通条目替换副本：'+result.entryPath+'；完整副本哈希与条目回读一致，游戏加载待实测');break;}
          case 'extractRpf':{if(!openedRpf||!Number.isSafeInteger(args?.id))throw new Error('请先打开归档并选择文件');const entry=openedRpf.list().find(e=>e.id===args.id);if(!entry||entry.type==='directory')throw new Error('条目不是可提取文件');const choice=await dialog.showSaveDialog(window,{title:'提取独立资源副本',defaultPath:entry.name});if(choice.canceled||!choice.filePath){result=null;break;}exportDestination(choice.filePath);const bytes=entry.type==='binary'?openedRpf.extractBinary(entry.id):openedRpf.extractResource(entry.id);atomicWrite(choice.filePath,bytes);recordLog('RPF','提取独立副本：'+entry.path);result=choice.filePath;break;}
          case 'analyzeResource':{if(!['quick','standard','deep'].includes(args?.mode))throw new Error('检测模式无效');const choice=await dialog.showOpenDialog(window,{title:'选择资源进行只读静态检测',properties:['openFile'],filters:[{name:'游戏资源',extensions:['yft','ytd','ydr','ydd','ymap','ytyp']}]});if(choice.canceled){result=null;break;}noLinks(path.parse(choice.filePaths[0]).root,choice.filePaths[0]);result=await analyzeResourceFile(choice.filePaths[0],args.mode);recordLog('兼容检测','资源头与封装检测：'+path.basename(choice.filePaths[0])+'；游戏内待测试');break;}
          case 'exportLogs':result=await saveJson('GEMS-本地日志.json',{schemaVersion:1,...operationLogs(store),operationWarnings:operationWarnings()});break;
          case 'exportCatalog':result=await saveJsonText('catalog.json',catalogText(readMods(store)));break;
          case 'pedIndexes':result=listPedReferenceIndexes(store);break;
          case 'pedAnalyze':result=analyzePedReferences(store,args?.source);recordLog('人物目录','分析已保存来源：'+result.name+'；解析声明不证明游戏加载');break;
          case 'pedUserStates':result=listPedUserStates(store,args?.source);break;
          case 'pedThumbnails':{
            if(!args||typeof args!=='object'||Object.keys(args).length!==1||!Array.isArray(args.identities)||args.identities.length>20)throw new Error('缩略图读取每次最多20个明确引用');
            result=args.identities.map((identity:unknown)=>{
              const referenceId=typeof (identity as any)?.referenceId==='string'?(identity as any).referenceId:'';
              try{
                const image=readPedThumbnail(store,identity as any,bytes=>{const decoded=nativeImage.createFromBuffer(bytes);return decoded.isEmpty()?null:decoded.getSize();});
                if(image?.mime==='image/png'){
                  const decoded=nativeImage.createFromBuffer(Buffer.from(image.dataUrl.slice('data:image/png;base64,'.length),'base64')),size=decoded.getSize();
                  if(decoded.isEmpty()||size.width!==image.width||size.height!==image.height)throw new Error('PNG实际图像解码失败或尺寸不符');
                }
                return{referenceId,image,error:null};
              }catch(error){return{referenceId,image:null,error:explainError(error)};}
            });break;
          }
          case 'pedSetUserState':result=setPedUserState(store,args?.identity,args?.patch);recordLog('人物偏好','保存此来源版本的分类与收藏；未改变安装状态');break;
          case 'exportPedCatalog':{
            profiles.assertWritable();
            const prepared=await preparePedCatalog(store,settings().gamePath);
            const choice=await dialog.showSaveDialog(window,{title:'导出人物目录（含本机游戏目录）',defaultPath:'ped-catalog-v1.json',filters:[{name:'GEMS 人物目录 JSON',extensions:['json']}]});
            if(choice.canceled||!choice.filePath){result=null;break;}
            exportDestination(choice.filePath);
            const destination=captureCommitTarget(choice.filePath);
            await verifyPedCatalogSnapshot(store,prepared);
            exportDestination(choice.filePath);
            assertCommitTarget(destination);
            atomicWrite(choice.filePath,prepared.text,()=>assertCommitTarget(destination));
            recordLog('人物目录','已核验并导出 '+prepared.catalog.peds.length+' 个人物引用；未注册DLC、未进行游戏验证');
            const fileStates:Record<string,number>={};for(const item of prepared.catalog.peds)fileStates[item.fileState]=(fileStates[item.fileState]||0)+1;
            result={file:choice.filePath,revision:prepared.catalog.revision,references:prepared.catalog.peds.length,fileStates,issues:prepared.catalog.issues};break;
          }
          case 'weaponIndexes':result=listWeaponReferenceIndexes(store);break;
          case 'weaponAnalyze':result=analyzeWeaponReferences(store,args?.source);recordLog('武器目录','分析已保存来源：'+result.name+'；解析结果不代表游戏加载');break;
          case 'exportWeaponCatalog':{
            profiles.assertWritable();
            const prepared=await prepareWeaponCatalog(store,settings().gamePath);
            const choice=await dialog.showSaveDialog(window,{title:'导出武器目录（含本机游戏目录）',defaultPath:'weapon-catalog-v1.json',filters:[{name:'GEMS 武器目录 JSON',extensions:['json']}]});
            if(choice.canceled||!choice.filePath){result=null;break;}
            exportDestination(choice.filePath);
            const destination=captureCommitTarget(choice.filePath);
            await verifyWeaponCatalogSnapshot(store,prepared);
            exportDestination(choice.filePath);
            assertCommitTarget(destination);
            atomicWrite(choice.filePath,prepared.text,()=>assertCommitTarget(destination));
            recordLog('武器目录','已核验并导出 '+prepared.catalog.weapons.length+' 个武器引用；未注册DLC、未进行游戏验证');
            const fileStates:Record<string,number>={};for(const item of prepared.catalog.weapons)fileStates[item.fileState]=(fileStates[item.fileState]||0)+1;
            result={file:choice.filePath,revision:prepared.catalog.revision,references:prepared.catalog.weapons.length,fileStates,issues:prepared.catalog.issues};break;
          }
          case 'diagnose':{const gamePath=settings().gamePath;result={...await diagnose(gamePath),gamePath};recordLog('诊断',result.summary+'；'+result.runtime.summary);break;}
          case 'openRuntimeSource':if(args?.id!=='scripthookv')throw new Error('此依赖尚无已核对的作者支持页面');await shell.openExternal(scriptHookSupport.source);result=null;break;
          case 'launchStatus':result=launcher.status();break;
          case 'launchSteam':{if(readTransactions(store).some(tx=>['准备中','执行中','恢复待处理'].includes(tx.state)))throw new Error('存在未完成的文件事务，请先在备份与恢复中处理，未发送启动请求');result=await launcher.request(settings().gamePath);recordLog('启动',result.message);break;}
          case 'launchRefresh':result=await launcher.refresh();break;
          case 'launchAcknowledge':{const choice=await dialog.showMessageBox(window,{type:'warning',title:'确认平台启动已结束',message:'请先在 Steam / Rockstar 中取消或退出本次启动',detail:'只有已关闭或取消平台启动，才能结束文件保护等待。当前没有游戏进程不能排除平台稍后启动游戏。此确认不会证明故事模式或模组已加载。',buttons:['继续等待','我已取消或退出启动'],defaultId:0,cancelId:0,noLink:true});if(choice.response!==1){result={canceled:true};break;}result=await launcher.acknowledgeStopped();recordLog('启动',result?.message||'没有待确认的启动记录');break;}
          case 'openData':await shell.openPath(data);result=null;break;
          case 'openSource':{const report=readImport(store,args?.id)||readMod(store,args?.id)?.report;if(!report)throw new Error('记录不存在');result=await shell.openPath(path.dirname(report.original));break;}
          default:throw new Error('此操作尚未支持');
        }
        return{ok:true,data:result,operationWarnings:operationWarnings()};
      }finally{operations.leave();if(!window.isDestroyed())window.webContents.send('gems:progress',{phase:'完成',message:''});}
    }catch(e){const message=explainError(e);recordLog('错误',message);return{ok:false,error:message,operationWarnings:operationWarnings()};}
  });
  app.on('before-quit',event=>{if(!shutdown){event.preventDefault();networkLifecycle.abort(new Error('应用退出，读取任务已取消'));void Promise.all([operations.close(),catalogReads.close(),downloads.close()]).then(()=>{shutdown=true;app.quit();});}});
  app.on('second-instance',()=>{window.show();window.focus();});app.on('window-all-closed',()=>app.quit());app.on('will-quit',()=>{try{store.close();}catch(error){shutdownWarning('数据库退出保存被拒绝：'+explainError(error));}});
  // 首次 state 查询前完成已有绑定的检测，避免重启后首页一直显示“未检测”。
  if(settings().gamePath){operations.enter();try{environment=await inspectEnvironment(settings().gamePath,networkLifecycle.signal);}catch(error){if(!operations.closing)recordLog('环境','启动环境检查失败：'+explainError(error));}finally{operations.leave();}}
  if(operations.closing)return;
  try{
    await window.loadURL(entry);
    // loadURL can settle after close; do not access a destroyed window or closed database.
    if(operations.closing||window.isDestroyed())return;
    window.webContents.setZoomFactor(settings().scale);
  }catch(error){if(!operations.closing)throw error;}
}
