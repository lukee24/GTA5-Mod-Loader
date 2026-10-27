import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {getEventListeners} from 'node:events';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {PassThrough} from 'node:stream';import type {IncomingMessage} from 'node:http';
import yazl from 'yazl';
import {Store} from '../packages/database';import {Downloads} from '../packages/marketplace/downloads';
import {trustedResponse} from '../packages/marketplace/network';
// @ts-expect-error Test-only memory certificate module; never modifies system trust.
import {untrustedCertificate} from './tls-fixture.mjs';

const url='https://api.github.com/repos/author/mod/releases';
function fixture(t:any,mode:'asset'|'doh',scaled=30){
  const lookup=dns.lookup,get=https.get,timeout=globalThis.setTimeout;
  const agent=new https.Agent();const requests:ReturnType<typeof https.get>[]=[];
  const configured:number[]=[];
  dns.lookup=(()=>Promise.resolve([{address:mode==='doh'?'198.18.0.1':'140.82.112.3',family:4}])) as unknown as typeof dns.lookup;
  globalThis.setTimeout=((callback:any,delay:any,...args:any[])=>{if(delay===30000||delay===10000){configured.push(delay);return timeout(callback,scaled,...args);}return timeout(callback,delay,...args);}) as typeof setTimeout;
  https.get=((target:any,options:any,callback:any)=>{
    const object=target instanceof URL?{...options,hostname:target.hostname,path:target.pathname+target.search}:target;
    const request=get({...object,agent},target instanceof URL?callback:options);requests.push(request);return request;
  }) as typeof https.get;
  t.after(()=>{dns.lookup=lookup;https.get=get;globalThis.setTimeout=timeout;for(const request of requests)request.destroy();agent.destroy();});
  return{agent,requests,configured,timeout};
}
for(const mode of ['asset','doh'] as const)test('连接未分配 socket 时本地等待时限生效：'+mode,{timeout:5000},async t=>{
  const f=fixture(t,mode);
  // 真实 Node ClientRequest/Agent，仅测试 Agent 的连接建立回调悬挂；不改系统路由。
  f.agent.createConnection=((_options:any,_callback:any)=>undefined) as unknown as typeof f.agent.createConnection;
  const caller=new AbortController();let watchdogFired=false;
  const watchdog=f.timeout(()=>{watchdogFired=true;caller.abort();},250);
  try{
    await assert.rejects(trustedResponse(url,caller.signal));
    assert.equal(watchdogFired,false,'仍等到调用方总时限，没有本地连接时限');
    assert.ok(f.configured.includes(mode==='asset'?30000:10000));
    assert.equal(f.requests.length,1);assert.equal(f.requests[0].destroyed,true);
  }finally{clearTimeout(watchdog);caller.abort();}
});
test('真实 TCP 已连接但 TLS 握手不返回时有明确等待上限',{timeout:5000},async t=>{
  const f=fixture(t,'asset'),sockets=new Set<net.Socket>();
  const server=net.createServer(socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const get=https.get;
  https.get=((target:any,options:any,callback:any)=>get({...options,hostname:target.hostname,path:target.pathname,port:address.port,lookup:(_h:any,_o:any,cb:any)=>cb(null,'127.0.0.1',4)},callback)) as typeof https.get;
  const caller=new AbortController();let watchdogFired=false;const watchdog=f.timeout(()=>{watchdogFired=true;caller.abort();},500);
  try{await assert.rejects(trustedResponse(url,caller.signal));assert.equal(watchdogFired,false);assert.equal(f.requests[0].destroyed,true);}finally{clearTimeout(watchdog);caller.abort();for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
for(const action of ['cancel','deadline'] as const)test('无 socket 等待及时收尾并销毁迟到 socket：'+action,{timeout:5000},async t=>{
  const f=fixture(t,'asset');let callback!:Function,entered!:()=>void;
  const started=new Promise<void>(resolve=>entered=resolve);
  f.agent.createConnection=((_options:any,done:any)=>{callback=done;entered();return undefined;}) as unknown as typeof f.agent.createConnection;
  const caller=new AbortController(),pending=trustedResponse(url,caller.signal);
  await started;if(action==='cancel')caller.abort();
  await assert.rejects(pending,action==='cancel'?/取消/:/响应头等待超时/);
  assert.equal(f.requests[0].destroyed,true);
  const late=new net.Socket();callback(null,late);
  await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(late.destroyed,true,'取消后迟到 socket 没有销毁');
  assert.equal(getEventListeners(caller.signal,'abort').length,0,'取消监听没有完整清理');
});
test('连接时限在收到响应头后清理，不终止仍在传输的有效响应',{timeout:5000},async t=>{
  const f=fixture(t,'asset',500),certificate=untrustedCertificate();
  f.agent.options.ca=certificate.cert; // 此 Agent 只信任本次内存夹具，不写系统 CA。
  const server=https.createServer(certificate,(_request,response)=>{response.flushHeaders();f.timeout(()=>response.end('actual response body'),700);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');const get=https.get;
  https.get=((target:any,options:any,callback:any)=>get({...options,hostname:target.hostname,path:target.pathname,port:address.port,lookup:(_h:any,_o:any,cb:any)=>cb(null,'127.0.0.1',4)},callback)) as typeof https.get;
  try{
    const caller=new AbortController(),response=await trustedResponse(url,caller.signal);const chunks:Buffer[]=[];
    for await(const chunk of response)chunks.push(Buffer.from(chunk));
    assert.equal(Buffer.concat(chunks).toString(),'actual response body');
    await new Promise<void>(resolve=>setImmediate(resolve));
    // Node's keep-alive request may still retain its native handler; our header wait adds none.
    assert.ok(getEventListeners(caller.signal,'abort').length<=1);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('真实下载队列中连接超时的项目不阻止下一隔离 ZIP 扫描',{timeout:5000},async t=>{
  const f=fixture(t,'asset');f.agent.createConnection=(()=>undefined) as unknown as typeof f.agent.createConnection;
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-http-queue-'));
  const store=await Store.open(root,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const archive=new yazl.ZipFile(),chunks:Buffer[]=[];
  archive.addBuffer(Buffer.from('fixture=1'),'mods/timeout-test.ini');archive.outputStream.on('data',chunk=>chunks.push(chunk));
  const ready=new Promise<void>(resolve=>archive.outputStream.on('end',resolve));archive.end();await ready;
  const payload=Buffer.concat(chunks);let attempts=0;
  const queue=new Downloads(store,root,()=>{},async(url,signal)=>{
    if(!attempts++)return trustedResponse(url,signal);
    // 第二项为实际生成的本地 ZIP 夹具；不是作者联网下载或真实游戏安装。
    const response=new PassThrough();Object.assign(response,{headers:{},statusCode:200});queueMicrotask(()=>response.end(payload));return response as unknown as IncomingMessage;
  });
  t.after(async()=>{await queue.close();store.close();assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-http-queue-'));fs.rmSync(root,{recursive:true});});
  const asset={name:'第一包.zip',pageUrl:'https://github.com/author/mod/releases/v1',downloadUrl:'https://github.com/author/mod/releases/download/v1/mod.zip',size:0,digest:null};
  const first=queue.add(asset),second=queue.add({...asset,name:'后续有效包.zip'});
  const until=Date.now()+3000;while(queue.list().find(item=>item.id===second.id)?.status!=='已分析'&&Date.now()<until)await new Promise(resolve=>f.timeout(resolve,10));
  const records=queue.list();assert.equal(records.find(item=>item.id===first.id)?.status,'失败');assert.match(records.find(item=>item.id===first.id)?.error||'',/响应头等待超时/);
  assert.equal(records.find(item=>item.id===second.id)?.status,'已分析');assert.equal(store.list('import').length,1);assert.equal(store.list('transaction').length,0);
});
