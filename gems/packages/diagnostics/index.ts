import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {Environment} from '../core/types';
import {noLinks} from '../core/security';
import {explainError} from '../core/errors';
import {inspectSteam} from './steam';
import {runtimeSupportEvidence} from './runtime-support';
import {logEvidence, type LogEvidence} from './log-evidence';
import {diagnosticLogSnapshot} from './log-snapshot';
import {parseProcessStatus} from './process-status';
import {readOnlyCommand} from './windows-command';
import {inspectRuntimeDependencies,readGameVersion} from './runtime-dependencies';
export async function gameRunning(signal?:AbortSignal){
  signal?.throwIfAborted();if(process.platform!=='win32')throw new Error('无法确认游戏进程：当前平台不支持 Windows 游戏检测');
  try{const result=await readOnlyCommand('tasklist.exe',['/FO','CSV','/NH'],signal);if(result.stderr.trim())throw new Error('进程检测返回异常信息');return parseProcessStatus(result.stdout);}
  catch(error){signal?.throwIfAborted();throw new Error('无法确认游戏进程状态，请重新检查后再修改文件',{cause:error});}
}
export async function validateGame(root:string){if(!root||!path.isAbsolute(root))throw new Error('请先选择 GTA V Enhanced 游戏目录');noLinks(root,root);const steam=inspectSteam(root);if(steam&&!steam.ready)throw new Error(steam.evidence);const exe=path.join(root,'GTA5_Enhanced.exe'),archive=path.join(root,'update','update.rpf');noLinks(root,exe);noLinks(root,archive);const b=Buffer.alloc(64);const fd=fs.openSync(exe,'r');try{if(fs.readSync(fd,b,0,64,0)!==64||b.subarray(0,2).toString()!=='MZ')throw new Error('游戏程序 DOS 头无效');const offset=b.readUInt32LE(60),pe=Buffer.alloc(6);if(offset<64||offset>fs.fstatSync(fd).size-6||fs.readSync(fd,pe,0,6,offset)!==6||pe.readUInt32LE(0)!==0x4550||pe.readUInt16LE(4)!==0x8664)throw new Error('游戏程序不是可识别的 Windows x64 PE 文件');}finally{fs.closeSync(fd);}const af=fs.openSync(archive,'r');const magic=Buffer.alloc(4);try{fs.readSync(af,magic,0,4,0);}finally{fs.closeSync(af);}if(magic.readUInt32LE(0)!==0x52504637)throw new Error('update/update.rpf 的 RPF7 文件头无效');}
export async function guardGame(root:string){await validateGame(root);if(await gameRunning())throw new Error('游戏正在运行，请退出后再修改文件');}
export async function inspectEnvironment(root:string,signal?:AbortSignal):Promise<Environment>{
  signal?.throwIfAborted();
  const result:Environment={valid:false,path:root,version:'未知',platform:'未知',running:null,integrity:'未执行游戏平台完整性验证',components:[],dlcs:[],checked:new Date().toISOString()};
  try{result.running=await gameRunning(signal);}catch(error){signal?.throwIfAborted();result.components.push({name:'游戏进程',status:'未知',evidence:explainError(error)});}
  try{const steam=root&&path.isAbsolute(root)?inspectSteam(root):null;if(steam)result.components.push({name:'Steam 下载与部署',status:steam.record==='missing'?'未知，安装记录缺失':steam.ready?'安装记录就绪':'尚未就绪',evidence:steam.evidence+(steam.total!==null?'；已记录下载 '+steam.downloaded+' / '+steam.total+' 字节':'')});await validateGame(root);if(process.platform==='win32'){const literal=path.join(root,'GTA5_Enhanced.exe').replaceAll("'","''");const v=await readOnlyCommand('WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',`(Get-Item -LiteralPath '${literal}').VersionInfo.FileVersion`],signal);result.version=v.stdout.trim()||'未知';}result.valid=true;}
  catch(e){signal?.throwIfAborted();result.components.push({name:'游戏目录',status:'无效',evidence:explainError(e)});return result;}
  if(fs.existsSync(path.join(root,'steam_api64.dll')))result.platform='Steam 文件标记（未验证账号）';else if(fs.existsSync(path.join(root,'.egstore')))result.platform='Epic 文件标记（未验证账号）';
  for(const [name,filename]of [['OpenRPF','OpenRPF.asi'],['ASI Loader','dinput8.dll'],['ScriptHookV','ScriptHookV.dll'],['ScriptHookVDotNet','ScriptHookVDotNet.asi'],['ReShade','ReShade.ini']]){const file=path.join(root,filename);noLinks(root,file);result.components.push({name,status:fs.existsSync(file)?'存在，兼容性未知':'缺失',evidence:fs.existsSync(file)?filename+' · '+fs.statSync(file).size+' 字节':'未发现 '+filename});}
  result.components.push(runtimeSupportEvidence(result.version));
  for(const name of ['NVE','LWE'])result.components.push({name,status:'未知',evidence:'缺少可信版本清单；不会依据相似目录名判断已安装'});
  const dlcs=path.join(root,'mods','update','x64','dlcpacks');if(fs.existsSync(dlcs)){noLinks(root,dlcs);for(const entry of fs.readdirSync(dlcs,{withFileTypes:true})){if(!entry.isDirectory())continue;const file=path.join(dlcs,entry.name,'dlc.rpf');noLinks(root,file);if(fs.existsSync(file))result.dlcs.push({name:entry.name,size:fs.statSync(file).size,status:'文件存在；注册及游戏加载未知'});}}
  return result;
}
export async function diagnose(root:string){
  await validateGame(root);
  const gameVersion=await readGameVersion(root);
  const runtime=inspectRuntimeDependencies(root,gameVersion.version,gameVersion.error);
  const findings:(LogEvidence & {file:string;confidence:string;advice:string})[]=[];
  const readErrors:{file:string;error:string}[]=[];
  const logs:{file:string;size:number;start:number;bytes:number;ioBytes:number;truncated:boolean;checked:string}[]=[];let missing=0;
  for(const name of ['ScriptHookV.log','ScriptHookVDotNet.log','asiloader.log','OpenRPF.log','ReShade.log']){
    const file=path.join(root,name);
    try{
      const snapshot=diagnosticLogSnapshot(root,file);if(!snapshot){missing++;continue;}
      const evidence=logEvidence(snapshot.buffer,snapshot.truncated,snapshot.startsOnLine);
      logs.push({file:name,size:snapshot.size,start:snapshot.start,bytes:snapshot.bytes,ioBytes:snapshot.ioBytes,truncated:snapshot.truncated,checked:snapshot.checked});
      for(const item of evidence){
        if(findings.length>=200)break;
        findings.push({...item,file:name,confidence:'日志线索；因果关系未确认',advice:'对照日志时间、组件版本和最近安装记录；在单机中分组验证'});
      }
    }catch(error){readErrors.push({file:name,error:explainError(error)});}
  }
  return{runtime,findings,readErrors,logs,coverage:{read:logs.length,missing,failed:readErrors.length,truncated:logs.filter(log=>log.truncated).length},summary:readErrors.length?'部分日志无法读取或解析，请先查看读取问题；已有线索不构成确定诊断':!logs.length?'未发现可读取的诊断日志，尚未进行日志内容诊断':findings.length?'发现需要核查的日志线索':'已安全读取'+logs.length+'个日志，未发现匹配错误；不代表游戏无问题'};
}
let previous=os.cpus().map(c=>c.times);
export function metrics(root:string){const current=os.cpus().map(c=>c.times);let idle=0,total=0;current.forEach((t,i)=>{const p=previous[i];if(!p)return;idle+=t.idle-p.idle;for(const k of ['user','nice','sys','idle','irq']as const)total+=t[k]-p[k];});previous=current;let free:number|null=null;try{const s=fs.statfsSync(root);free=Number(s.bavail)*Number(s.bsize);}catch{}return{cpu:total?Math.round(100*(1-idle/total)):null,memoryUsed:os.totalmem()-os.freemem(),memoryTotal:os.totalmem(),diskFree:free,gpu:null,vram:null,fps:null};}
