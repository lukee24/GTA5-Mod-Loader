import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {noLinks,relativeSafe} from '../core/security';
import {explainError} from '../core/errors';
import {OperationLogger} from '../core/operation-logger';
import {scan} from '../scanner';
import {assertImportWrite} from '../scanner/import-records';
import {validateImportReport} from '../core/import-report';
import type {Store} from '../database';
import type {ImportReport} from '../core/types';
import type {DownloadRecord} from './types';
import {downloadUrl,trustedResponse,type Transport} from './network';
import {retryReceipt,retryStates,type DownloadAsset} from './download-retry';
import {readDownloadRecords} from './download-records';

export const DOWNLOAD_LIMIT=1024**3;
const activeStates=['排队中','下载中','正在扫描'];
interface Task {record:DownloadRecord;url:string;expectedHash:string|null;controller:AbortController;timedOut?:boolean}
export class Downloads {
  issue:string|null=null;
  private logger:OperationLogger;
  get logIssue(){return this.logger.issue;}
  private queue:Task[]=[];private active:Task|null=null;private closed=false;
  constructor(private store:Store,private root:string,private notify:()=>void=()=>{},private transport:Transport=trustedResponse,private scanner:typeof scan=scan){
    this.logger=new OperationLogger(store);
    try{const records=this.records();if(this.issue)return;const pending=records.filter(record=>activeStates.includes(record.status));
      if(pending.length>30)throw new Error('未完成下载超过30项，未自动改写记录');
      if(pending.length)store.writeBatch(pending.map(record=>({operation:'put' as const,kind:'download',id:record.id,value:{...record,status:'已中断',error:'应用在下载或扫描完成前退出，请重新下载；不会使用未完成文件'}})));
    }catch(error){this.halt(error,'下载记录中断整理失败，已停止下载与重试：');}
  }
  private records(){try{const result=readDownloadRecords(this.store);if(result.issues.length)this.halt(new Error(result.issues.join('；')),'下载记录无法完整核对，已停止下载与重试：');return result.records;}catch(error){this.halt(error,'下载记录读取失败，已停止下载与重试：');return[];}}
  list(){const records=this.records();return records.slice(0,200).map(record=>({...record,retryIssue:this.retryIssue(record,records)}));}
  reportIds(){return this.records().map(record=>record.reportId||'').join(',');}
  private retryIssue(record:DownloadRecord,records:DownloadRecord[]){
    if(!retryStates.includes(record.status))return '只允许重新下载失败、取消或中断的记录';
    if(!record.retryAsset)return '此记录未保存公开发布标识，请在来源重新选择';
    const root=records.find(item=>item.id===(record.retryRoot||record.id));
    if(!root||root.retryOf||root.retryAsset?.id!==record.retryAsset.id)return '重试关联记录缺失或不匹配，请在来源重新选择';
    if(records.some(item=>item.retryRoot===root.id&&activeStates.includes(item.status)))return '同一下载已有重试任务进行中';
    if(records.some(item=>item.retryRoot===root.id&&item.status==='已分析'))return '重试已完成，请查看新的下载记录';
    return null;
  }
  retry(id:unknown,asset:DownloadAsset){
    if(typeof id!=='string'||id.length>80)throw new Error('下载记录标识无效');
    const records=this.records();if(this.issue)throw new Error(this.issue);const record=records.find(record=>record.id===id);if(!record)throw new Error('下载记录不存在');
    const issue=this.retryIssue(record,records);if(issue)throw new Error(issue);
    const verified=retryReceipt(asset),saved=record.retryAsset!;
    if(!verified||verified.id!==saved.id||verified.version!==saved.version||verified.size!==saved.size||verified.digest!==(saved.digest?.toLowerCase()??null)||asset.name!==record.name||asset.pageUrl!==record.sourceUrl)throw new Error('重试发布信息与原记录不匹配');
    return this.enqueue(asset,{retryOf:record.id,retryRoot:record.retryRoot||record.id});
  }
  add(asset:DownloadAsset){return this.enqueue(asset);}
  private enqueue(asset:DownloadAsset,retry?:{retryOf:string;retryRoot:string}){
    this.records();
    if(this.issue)throw new Error(this.issue);if(this.closed)throw new Error('下载服务已关闭');
    if(this.queue.length+(this.active?1:0)>=30)throw new Error('下载队列最多 30 项，请等待已有任务完成');
    const url=downloadUrl(asset.downloadUrl);
    const name=relativeSafe(asset.name);
    if(name.includes('/')||name.length>180||! /\.(zip|oiv|oivs)$/i.test(name))throw new Error('自动下载与扫描仅支持普通 ZIP / OIV 文件名');
    if(!Number.isSafeInteger(asset.size)||asset.size<0||asset.size>DOWNLOAD_LIMIT)throw new Error('单个下载包限制为 1 GiB，请从网站下载后手动导入大型包');
    if(asset.digest!==null&&(typeof asset.digest!=='string'||!/^[a-f0-9]{64}$/i.test(asset.digest)))throw new Error('网站提供的文件校验值格式无效');
    const page=new URL(asset.pageUrl);if(page.protocol!=='https:'||page.username||page.password||page.port||page.href.length>2000)throw new Error('下载来源无效');page.search='';page.hash='';
    const retryAsset=retryReceipt(asset);
    const record:DownloadRecord={id:crypto.randomUUID(),name,sourceUrl:page.href,created:new Date().toISOString(),status:'排队中',received:0,size:asset.size||null,...(retryAsset?{retryAsset}:{}),...retry};
    this.store.put('download',record.id,record);this.queue.push({record,url:url.href,expectedHash:asset.digest?.toLowerCase()??null,controller:new AbortController()});this.publish();if(this.issue)throw new Error(this.issue);void this.pump();return record;
  }
  cancel(id:unknown){
    const task=this.active?.record.id===id?this.active:this.queue.find(t=>t.record.id===id);
    if(!task)throw new Error('此下载已结束或不存在');
    if(task.timedOut)throw new Error('下载已经超时，正在结束和清理，请等待结果');
    if(task.record.status==='正在扫描')throw new Error('下载已完成，扫描正在保护原包并分析文件，请等待扫描结束');
    const cancelled:DownloadRecord={...task.record,status:'已取消'};
    try{this.store.put('download',task.record.id,cancelled);}
    catch(error){this.halt(error);this.publish();throw error;}
    Object.assign(task.record,cancelled);task.controller.abort();this.queue=this.queue.filter(t=>t!==task);this.publish();
  }
  async close(){this.closed=true;this.active?.controller.abort();for(const task of this.queue)task.controller.abort();this.queue=[];while(this.active)await new Promise(resolve=>setTimeout(resolve,50));}
  private halt(error:unknown,prefix='下载服务保存记录或通知界面时发生错误，已停止接收新任务：'){if(!this.issue)this.issue=prefix+explainError(error).slice(0,300)+'；排队项目请在修复数据目录后重启并重新下载';this.closed=true;this.active?.controller.abort();for(const task of this.queue)task.controller.abort();this.queue=[];}
  private publish(){try{this.notify();}catch(error){this.halt(error);}}
  private async pump(){
    if(this.active||this.closed)return;
    const task=this.queue.shift();if(!task)return;this.active=task;
    try{await this.run(task);}catch(e){
      task.record.status=task.controller.signal.aborted&&!task.timedOut?'已取消':'失败';
      let message=explainError(e);
      if(task.timedOut){
        const reason=task.controller.signal.reason;message=explainError(reason);
        // Generic abort errors add no information; cleanup/socket failures must remain visible.
        if(e!==reason&&(e as {code?:unknown}|null)?.code!=='ABORT_ERR')message+='；结束下载时发生附加错误：'+explainError(e);
      }
      task.record.error=message.slice(0,500);
      try{this.store.put('download',task.record.id,task.record);}catch(recordError){this.halt(recordError);}
      if(!this.issue)this.logger.record('下载',task.record.name+'：'+task.record.status+'；'+task.record.error);
    }
    finally{this.active=null;this.publish();if(!this.closed)void this.pump();}
  }
  private async run(task:Task){
    const {record,controller}=task;const base=path.join(this.root,'downloads');noLinks(this.root,base);fs.mkdirSync(base,{recursive:true});
    const folder=path.join(base,record.id);fs.mkdirSync(folder);noLinks(base,folder);
    const file=path.join(folder,record.name),part=file+'.partial';
    const disk=fs.statfsSync(base),needed=2*(record.size||DOWNLOAD_LIMIT)+64*1024**2;
    if(Number(disk.bavail)*Number(disk.bsize)<needed)throw new Error('下载目录剩余磁盘空间不足');
    record.status='下载中';this.store.put('download',record.id,record);this.publish();
    // 总时限与连接空闲时限分别限制，不自动重试被拒绝的访问。
    const deadline=setTimeout(()=>{if(!controller.signal.aborted){task.timedOut=true;controller.abort(new Error('下载超过 30 分钟，请重试'));}},30*60*1000);
    let fd:number|undefined;let response:Awaited<ReturnType<Transport>>|undefined;
    try{
      response=await this.transport(task.url,controller.signal);
      const header=response.headers['content-length'];
      if(header!==undefined){const size=Number(header);if(!/^\d+$/.test(String(header))||!Number.isSafeInteger(size)||size<1||size>DOWNLOAD_LIMIT||record.size!==null&&size!==record.size)throw new Error('网站声明的文件大小无效、超限或与发布列表不符');record.size=size;}
      fd=fs.openSync(part,'wx+');const sha=crypto.createHash('sha256');let last=0;
      for await(const chunk of response){controller.signal.throwIfAborted();const bytes=Buffer.from(chunk);record.received+=bytes.length;if(record.received>DOWNLOAD_LIMIT||record.size!==null&&record.received>record.size)throw new Error('下载内容超过允许大小');fs.writeFileSync(fd,bytes);sha.update(bytes);if(Date.now()-last>500){last=Date.now();this.store.put('download',record.id,record);this.publish();}}
      controller.signal.throwIfAborted();
      if(!record.received||record.size!==null&&record.received!==record.size)throw new Error('下载未完整结束；不会导入截断文件');
      record.sha256=sha.digest('hex');if(task.expectedHash&&task.expectedHash!==record.sha256)throw new Error('SHA-256 与作者发布值不一致；已阻止导入');
      const magic=Buffer.alloc(4);fs.readSync(fd,magic,0,4,0);
      if(![0x04034b50,0x06054b50].includes(magic.readUInt32LE()))throw new Error('下载内容不是 ZIP / OIV 归档，可能是登录页或错误页面');
      fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;noLinks(base,file);
      fs.linkSync(part,file);fs.unlinkSync(part);record.file=file;record.checksum=task.expectedHash?'已与作者 SHA-256 比对':'已计算本地 SHA-256；作者未提供校验值';
    }finally{clearTimeout(deadline);response?.destroy();if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(part))fs.unlinkSync(part);}
    record.status='正在扫描';this.store.put('download',record.id,record);this.publish();
    const report:ImportReport=await this.scanner(file,this.root);
    validateImportReport(report?.id,report);
    report.sourceUrl=record.sourceUrl;report.warnings.push('此包由网站下载；文字分类未用于绕过兼容性和安装检查');
    // A report and its completed download must become visible in the same file commit.
    // Do not mutate the task until commit succeeds: failure reporting must not carry a dangling link.
    const completed:DownloadRecord={...record,reportId:report.id,status:'已分析'};
    assertImportWrite(this.store,report);
    this.store.writeBatch([{operation:'put',kind:'import',id:report.id,value:report},{operation:'put',kind:'download',id:record.id,value:completed}]);
    Object.assign(record,completed);
    this.logger.record('下载',record.name+'：下载和文件分析完成；尚未安装或验证游戏加载');
  }
}
