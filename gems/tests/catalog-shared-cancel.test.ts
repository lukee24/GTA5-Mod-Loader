import test from 'node:test';import assert from 'node:assert/strict';import {PassThrough} from 'node:stream';import type {IncomingMessage} from 'node:http';import {ModCatalog} from '../packages/marketplace/catalog';
const query={category:'车辆',kind:'全部载具',brand:'奔驰',page:1};
const row='<div class="file-list-obj"><div class="details"><div class="name"><a href="/vehicles/fixture-shared">隔离车辆</a></div></div></div>';
for(const lateFailure of [false,true])test('共享读取者取消立即结束自己的等待，不中止首个读取；迟到'+(lateFailure?'失败':'成功'),async()=>{
  const body=new PassThrough();Object.assign(body,{statusCode:200,headers:{'content-type':'text/html'}});let entered!:()=>void;const reached=new Promise<void>(resolve=>{entered=resolve;}),urls:string[]=[],catalog=new ModCatalog(async url=>{urls.push(url);if(url.endsWith('robots.txt')){const rules=new PassThrough();Object.assign(rules,{statusCode:200,headers:{'content-type':'text/plain'}});queueMicrotask(()=>rules.end('User-agent: *\n'));return rules as unknown as IncomingMessage;}entered();return body as unknown as IncomingMessage;});
  const owner=catalog.read(query,new AbortController().signal).then(value=>({value,error:null}),error=>({value:null,error}));await reached;const controller=new AbortController();let joinedOutcome='pending';const joined=catalog.read({...query,brand:'迈巴赫'},controller.signal).then(()=>{joinedOutcome='completed';},error=>{joinedOutcome=error.message;});controller.abort(new Error('隔离共享读取取消'));
  try{await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(joinedOutcome,'隔离共享读取取消');assert.equal(body.destroyed,false);assert.equal(urls.length,2);}
  finally{if(lateFailure)body.destroy(new Error('隔离迟到正文失败'));else body.end(row);await joined;}
  const result=await owner;if(lateFailure)assert.match(result.error.message,/隔离迟到正文失败/);else assert.equal(result.value?.query.brand,'奔驰');assert.equal(joinedOutcome,'隔离共享读取取消');
});
