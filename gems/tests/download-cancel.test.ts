import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {PassThrough} from 'node:stream';
import type {IncomingMessage} from 'node:http';
import {Store} from '../packages/database';
import {Downloads} from '../packages/marketplace/downloads';
import type {DownloadRecord} from '../packages/marketplace/types';

const wasm=path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
function asset(slug:string){return{name:slug+'.zip',pageUrl:'https://github.com/fixture-author/gems-fixture/releases/tag/v1',downloadUrl:'https://github.com/fixture-author/gems-fixture/releases/download/v1/'+slug+'.zip',size:0,digest:null};}
async function fixture(t:any){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-download-cancel-')),store=await Store.open(root,wasm),calls:{url:string;signal:AbortSignal;stream:PassThrough}[]=[],notices:(string|null)[]=[];
  let notifyFailure=false;let queue:Downloads;
  queue=new Downloads(store,root,()=>{notices.push(queue.issue);if(notifyFailure)throw new Error('隔离界面通知拒绝');},async(url,signal)=>{
    signal.throwIfAborted();const stream=new PassThrough();Object.assign(stream,{headers:{},statusCode:200});calls.push({url,signal,stream});signal.addEventListener('abort',()=>stream.destroy(new Error('隔离数据流中止')),{once:true});return stream as unknown as IncomingMessage;
  });
  t.after(async()=>{await queue.close();try{store.close();}catch(error){assert.match(String(error),/数据库.*更改/);}assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-download-cancel-'));fs.rmSync(root,{recursive:true});});
  return{root,store,queue,calls,notices,file:path.join(root,'gems.sqlite'),notifyFailure(){notifyFailure=true;}};
}
async function running(f:Awaited<ReturnType<typeof fixture>>,id:string){const deadline=Date.now()+3000;while(!fs.existsSync(path.join(f.root,'downloads',id,'active.zip.partial'))){if(Date.now()>deadline)throw new Error('隔离流未进入实际文件写入等待');await new Promise(resolve=>setTimeout(resolve,10));}}
function denyCancellation(store:Store){store.db.run("CREATE TRIGGER fixture_cancel_denied BEFORE INSERT ON documents WHEN NEW.kind='download' AND json_extract(NEW.json,'$.status')='已取消' BEGIN SELECT RAISE(ABORT,'隔离取消状态保存拒绝'); END;");store.flush();}
async function checkRestart(root:string,check:(store:Store)=>void){const reopened=await Store.open(root,wasm);try{check(reopened);}finally{reopened.close();}}

test('排队取消SQL拒绝立即停止接收任务，不启动被丢弃的排队包',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);denyCancellation(f.store);assert.throws(()=>f.queue.cancel(queued.id),/隔离取消状态保存拒绝/);assert.match(f.queue.issue||'',/隔离取消状态保存拒绝/);assert.throws(()=>f.queue.add(asset('new-after-failure')),/保存记录/);await f.queue.close();assert.equal(f.calls.length,1);assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.store.get<DownloadRecord>('download',queued.id)?.status,'排队中');assert.equal(fs.existsSync(path.join(f.root,'downloads',queued.id)),false);assert.equal(f.store.list('import').length,0);assert.ok(f.notices.some(notice=>notice?.includes('隔离取消状态保存拒绝')));await checkRestart(f.root,store=>assert.equal(store.get<DownloadRecord>('download',queued.id)?.status,'排队中'));});
test('活动取消SQL拒绝同步停止队列，不在异常返回与后台处理间接受新下载',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);denyCancellation(f.store);assert.throws(()=>f.queue.cancel(active.id),/隔离取消状态保存拒绝/);assert.throws(()=>f.queue.add(asset('new-after-failure')),/保存记录/);assert.match(f.queue.issue||'',/隔离取消状态保存拒绝/);await f.queue.close();assert.equal(f.calls.length,1);assert.equal(f.store.get<DownloadRecord>('download',active.id)?.status,'下载中');assert.equal(f.store.get<DownloadRecord>('download',queued.id)?.status,'排队中');assert.equal(fs.readdirSync(path.join(f.root,'downloads',active.id)).length,0);assert.equal(f.store.list('import').length,0);});
test('排队取消最终rename权限拒绝也停止服务，保留原物理记录并清理临时文件',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);const rename=fs.renameSync;
  fs.renameSync=((from:any,to:any)=>{if(String(to)===f.file&&f.store.get<DownloadRecord>('download',queued.id)?.status==='已取消')throw Object.assign(new Error('隔离取消rename拒绝'),{code:'EACCES'});return rename(from,to);}) as typeof fs.renameSync;
  try{assert.throws(()=>f.queue.cancel(queued.id),/rename拒绝/);assert.match(f.queue.issue||'',/权限.*EACCES/);assert.throws(()=>f.queue.add(asset('new-after-failure')),/保存记录/);await f.queue.close();assert.equal(f.store.get<DownloadRecord>('download',queued.id)?.status,'排队中');assert.equal(f.calls.length,1);assert.equal(fs.readdirSync(f.root).some(name=>name.includes('.gems-')),false);}finally{fs.renameSync=rename;}
  await checkRestart(f.root,store=>assert.equal(store.get<DownloadRecord>('download',queued.id)?.status,'排队中'));
});
test('取消遭遇外部Store提交立即停止，磁盘外部数据不被异步错误保存覆盖',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);const other=await Store.open(f.root,wasm);other.put('external','committed',{value:'真实外部提交'});other.close();const external=fs.readFileSync(f.file);assert.throws(()=>f.queue.cancel(queued.id),/数据库.*更改/);assert.match(f.queue.issue||'',/数据库.*更改/);assert.throws(()=>f.queue.add(asset('new-after-failure')),/保存记录/);await f.queue.close();assert.deepEqual(fs.readFileSync(f.file),external);await checkRestart(f.root,store=>assert.deepEqual(store.get('external','committed'),{value:'真实外部提交'}));});
test('成功取消排队项不影响活动流，也不创建该包目录或发出该包请求',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);f.queue.cancel(queued.id);assert.equal(f.queue.issue,null);assert.equal(f.calls[0].signal.aborted,false);assert.equal(f.store.get<DownloadRecord>('download',queued.id)?.status,'已取消');await f.queue.close();assert.equal(f.calls.length,1);assert.equal(fs.existsSync(path.join(f.root,'downloads',queued.id)),false);await checkRestart(f.root,store=>assert.equal(store.get<DownloadRecord>('download',queued.id)?.status,'已取消'));});
test('成功取消活动流实际中止并清除partial，队列仍能接受新任务',async t=>{const f=await fixture(t),active=f.queue.add(asset('active'));await running(f,active.id);f.queue.cancel(active.id);assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.queue.issue,null);assert.doesNotThrow(()=>f.queue.add(asset('next')));await f.queue.close();assert.equal(f.store.get<DownloadRecord>('download',active.id)?.status,'已取消');assert.equal(fs.readdirSync(path.join(f.root,'downloads',active.id)).length,0);assert.equal(f.store.list('import').length,0);});
test('取消保存拒绝后的通知也拒绝，原始保存原因不被次级通知错误替换',async t=>{const f=await fixture(t),active=f.queue.add(asset('active')),queued=f.queue.add(asset('queued'));await running(f,active.id);denyCancellation(f.store);f.notifyFailure();assert.throws(()=>f.queue.cancel(queued.id),/隔离取消状态保存拒绝/);assert.match(f.queue.issue||'',/隔离取消状态保存拒绝/);assert.doesNotMatch(f.queue.issue||'',/隔离界面通知拒绝/);await f.queue.close();assert.match(f.queue.issue||'',/隔离取消状态保存拒绝/);assert.equal(f.calls.length,1);});
