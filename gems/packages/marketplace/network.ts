import https from 'node:https';
import {clientUserAgent} from './client-identity';
import dns from 'node:dns/promises';
import {BlockList,isIP} from 'node:net';
import type {IncomingMessage} from 'node:http';
import {awaitAbort} from '../core/await-abort';
import {responseHeaders} from './http-lifecycle';

const allowed=new Set(['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','files.gta5-mods.com','www.gta5-mods.com','gta5-mods.com','img.gta5-mods.com']);
export function downloadUrl(value:string):URL {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.port||u.username||u.password||u.hash||!allowed.has(u.hostname))throw new Error('下载仅接受受支持网站的 HTTPS 地址；外部网盘尚未接入');
  return u;
}
const blocked=new BlockList();
for(const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',3]] as [string,number][])blocked.addSubnet(address,prefix,'ipv4');
const global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
blocked.addSubnet('2001:db8::',32,'ipv6');blocked.addSubnet('2002::',16,'ipv6');
export function publicAddress(address:string):boolean {
  const family=isIP(address);
  return family===4?!blocked.check(address,'ipv4'):family===6&&global6.check(address,'ipv6')&&!blocked.check(address,'ipv6');
}
export function publicDnsAnswer(host:string,value:any):{address:string;family:number}[]{
  if(value?.Status!==0||!Array.isArray(value.Question)||value.Question.length!==1||value.Question[0].name?.replace(/\.$/,'').toLowerCase()!==host||value.Question[0].type!==1||!Array.isArray(value.Answer))throw new Error('公共 DNS 回查返回了无效结果');
  const addresses=value.Answer.filter((a:any)=>a.type===1).map((a:any)=>({address:a.data,family:4}));
  if(!addresses.length||addresses.length>32||addresses.some((a:any)=>typeof a.address!=='string'||!publicAddress(a.address)))throw new Error('公共 DNS 回查未返回可用的公网地址');
  return addresses;
}
async function lookupPublic(host:string,signal:AbortSignal){
  let addresses:{address:string;family:number}[]=[];
  try{addresses=await awaitAbort(()=>dns.lookup(host,{all:true,verbatim:true}),AbortSignal.any([signal,AbortSignal.timeout(10000)]));}catch{signal.throwIfAborted();}
  signal.throwIfAborted();
  if(addresses.length&&addresses.every(a=>publicAddress(a.address)))return addresses;
  // 部分代理软件的 fake-IP DNS 返回 198.18/15 或私有 IPv6。
  // 不放行这些地址：向固定公网 HTTPS DNS 回查，再连接校验过的公网 IP。
  // 此路径仅适用于代码内固定官方域名；TLS 仍验证原网站证书。
  const response=await responseHeaders(receive=>{
    const request=https.get({rejectUnauthorized:true,minVersion:'TLSv1.2',hostname:'cloudflare-dns.com',path:'/dns-query?name='+encodeURIComponent(host)+'&type=A',family:4,lookup:((_h:any,_o:any,cb:any)=>cb(null,'1.1.1.1',4)) as any,signal,headers:{Accept:'application/dns-json'}},receive);
    request.setTimeout(10000,()=>request.destroy(new Error('公共 DNS 回查空闲超时')));return request;
  },signal,10000,'公共 DNS 回查连接或响应头等待超时','公共 DNS 回查失败，请检查网络连接');
  let length=0;const parts:Buffer[]=[];
  try{
    if(response.statusCode!==200)throw new Error('公共 DNS 回查请求失败');
    for await(const part of response){signal.throwIfAborted();const chunk=Buffer.from(part);length+=chunk.length;if(length>65536)throw new Error('公共 DNS 回查响应超限');parts.push(chunk);}
    signal.throwIfAborted();
    return publicDnsAnswer(host,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts))));
  }finally{response.destroy();}
}
export type Transport=(url:string,signal:AbortSignal)=>Promise<IncomingMessage>;
export const trustedResponse:Transport=async (value,signal)=>{
  let u=downloadUrl(value);
  for(let redirects=0;redirects<=5;redirects++){
    signal.throwIfAborted();
    const addresses=await lookupPublic(u.hostname,signal);
    signal.throwIfAborted();
    if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('网站解析到了本地、保留或不受支持的网络地址，已停止下载');
    const selected=addresses[0];
    const response=await responseHeaders(receive=>{
      const request=https.get(u,{rejectUnauthorized:true,minVersion:'TLSv1.2',signal,family:selected.family,lookup:((_host:any,_options:any,callback:any)=>callback(null,selected.address,selected.family)) as any,headers:{'User-Agent':clientUserAgent,'Accept':u.hostname==='api.github.com'?'application/vnd.github+json':'*/*','Accept-Encoding':'identity',...(u.hostname==='api.github.com'?{'X-GitHub-Api-Version':'2026-03-10'}:{})}},receive);
      request.setTimeout(30000,()=>request.destroy(new Error('网站传输空闲超时，请稍后重试')));return request;
    },signal,30000,'网站连接或响应头等待超时，请稍后重试','网站连接失败，请检查网络或 HTTPS 证书');
    const code=response.statusCode||0;
    if([301,302,303,307,308].includes(code)){
      const location=response.headers.location;response.destroy();
      if(!location||redirects===5)throw new Error('网站重定向过多或目标缺失');
      u=downloadUrl(new URL(location,u).href);continue;
    }
    if(code!==200){response.destroy();throw new Error(code===429||code===403?'网站拒绝访问或请求额度已用完，请稍后重试；不会反复请求':code===404?'发布包或公开仓库不存在':'网站请求失败（HTTP '+code+'）');}
    if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();throw new Error('网站返回了不受支持的传输编码');}
    return response;
  }
  throw new Error('网站重定向无效');
};
export async function releasesJson(repository:string,signal:AbortSignal,transport:Transport=trustedResponse){
  const response=await transport('https://api.github.com/repos/'+repository+'/releases?per_page=8',signal);
  let length=0;const chunks:Buffer[]=[];
  try{for await(const part of response){signal.throwIfAborted();const chunk=Buffer.from(part);length+=chunk.length;if(length>4*1024**2)throw new Error('发布列表超过 4 MiB 安全限制');chunks.push(chunk);}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}finally{response.destroy();}
}
