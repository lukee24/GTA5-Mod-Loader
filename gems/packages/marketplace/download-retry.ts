import {repositoryName,parseReleases} from './providers';
import {releasesJson} from './network';
import type {DownloadRecord,MarketAsset} from './types';

export type DownloadAsset=Pick<MarketAsset,'name'|'pageUrl'|'downloadUrl'|'size'|'digest'>&Partial<Pick<MarketAsset,'id'|'version'>>;
export interface RetryAsset {id:string;version:string;size:number;digest:string|null;}
export const retryStates=['失败','已取消','已中断'];
function repository(id:unknown){
 if(typeof id!=='string'||id.length>240)throw new Error('下载缺少可核对的公开发布标识');
 const separator=id.lastIndexOf(':'),name=repositoryName(id.slice(0,separator)),number=id.slice(separator+1);
 if(!/^[1-9]\d*$/.test(number)||!Number.isSafeInteger(Number(number)))throw new Error('公开发布文件标识无效');return name;
}
export function validatedRetryReceipt(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('公开发布记录类型无效');
 const value=input as RetryAsset;
 const name=repository(value.id);
 if(typeof value.version!=='string'||!value.version||value.version.length>100||/[\x00-\x1f]/.test(value.version)||!Number.isSafeInteger(value.size)||value.size<1||value.size>1024**3||value.digest!==null&&(typeof value.digest!=='string'||!/^[a-f0-9]{64}$/i.test(value.digest)))throw new Error('公开发布的版本、大小或摘要记录无效');
 return{name,value:{id:value.id,version:value.version,size:value.size,digest:value.digest?.toLowerCase()??null}};
}
export function retryReceipt(asset:DownloadAsset):RetryAsset|undefined {
 if(asset.id===undefined&&asset.version===undefined)return undefined;
 const {name,value}=validatedRetryReceipt({id:asset.id!,version:asset.version!,size:asset.size,digest:asset.digest});
 const page=new URL(asset.pageUrl),url=new URL(asset.downloadUrl);
 if([page,url].some(url=>url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.port||url.search||url.hash)||!page.pathname.toLowerCase().startsWith('/'+name.toLowerCase()+'/releases/')||!url.pathname.toLowerCase().startsWith('/'+name.toLowerCase()+'/releases/download/'))throw new Error('公开发布标识与作者来源不匹配');
 return value;
}
/** Re-read the public release index; download URLs are never persisted or supplied by the renderer. */
export async function refreshedRetryAsset(record:DownloadRecord,signal:AbortSignal,read:typeof releasesJson=releasesJson):Promise<MarketAsset>{
 signal.throwIfAborted();if(!retryStates.includes(record.status)||!record.retryAsset)throw new Error('此记录不能直接重试，请在来源重新选择发布包');
 const {name,value}=validatedRetryReceipt(record.retryAsset);
 const source=new URL(record.sourceUrl);
 if(source.protocol!=='https:'||source.hostname!=='github.com'||source.username||source.password||source.port||source.search||source.hash||!source.pathname.toLowerCase().startsWith('/'+name.toLowerCase()+'/releases/'))throw new Error('记录的作者来源无效，未发出重试请求');
 const assets=parseReleases(name,await read(name,signal));signal.throwIfAborted();const asset=assets.find(asset=>asset.id===value.id);
 if(!asset)throw new Error('原发布文件已删除或不在最近8个正式版本中，请在来源重新选择');
 const current=retryReceipt(asset)!;
 if(asset.name!==record.name||asset.pageUrl!==record.sourceUrl||current.version!==value.version||current.size!==value.size||current.digest!==value.digest)throw new Error('作者发布信息已变化，请核对当前版本后重新选择下载');
 return asset;
}
