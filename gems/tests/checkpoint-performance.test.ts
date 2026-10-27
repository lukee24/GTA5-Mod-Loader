import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {performance} from 'node:perf_hooks';
import {Store} from '../packages/database';
import type {Transaction} from '../packages/core/types';
import {RecoveryCheckpoint} from '../packages/installer/recovery-checkpoint';
import {readTransaction} from '../packages/installer/recovery-records';

async function fixture(t:any,count=0){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-checkpoint-performance-'));
  const game=path.join(root,'game'),data=path.join(root,'data');fs.mkdirSync(game);
  const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const tx:Transaction={id:'current',name:'实际数据库检查点',modId:'mod-current',gamePath:game,created:'2026-10-13T00:00:00.000Z',state:'执行中',changes:Array.from({length:count},(_,i)=>({target:'mods/'+Array(8).fill('d'.repeat(120)).join('/')+'/'+i+'.ini',before:null,after:'a'.repeat(64),applied:false}))};
  store.put('transaction',tx.id,tx);
  t.after(()=>{store.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-checkpoint-performance-'));fs.rmSync(root,{recursive:true});});
  return{root,game,data,store,tx};
}
function countParses(action:()=>void){
  const original=JSON.parse;let parses=0;
  JSON.parse=((...args:Parameters<typeof JSON.parse>)=>{parses++;return original(...args);}) as typeof JSON.parse;
  try{action();return parses;}finally{JSON.parse=original;}
}
function raw(store:Store,id:string,json:string){store.db.run('UPDATE documents SET json=? WHERE kind=? AND id=?',[json,'transaction',id]);}

test('相同实际SQL文本每次新读取，但重复检查不再解析1500条目标',async t=>{
  const f=await fixture(t,1500),checkpoint=new RecoveryCheckpoint(f.store,f.tx),before=fs.readFileSync(path.join(f.data,'gems.sqlite'));
  const original=f.store.recoveryRow.bind(f.store);let reads=0;
  f.store.recoveryRow=(id)=>{reads++;return original(id);};
  const parses=countParses(()=>{for(let i=0;i<24;i++)checkpoint.assertCurrent();});
  t.diagnostic(JSON.stringify({changes:f.tx.changes.length,bytes:Buffer.byteLength(JSON.stringify(f.tx)),checks:24,reads,parses}));
  assert.equal(reads,24);assert.equal(parses,0);assert.deepEqual(fs.readFileSync(path.join(f.data,'gems.sqlite')),before);assert.deepEqual(fs.readdirSync(f.game),[]);
});

test('等价键序及空白变化仅首次完整验证，后来实际变化仍拒绝',async t=>{
  const f=await fixture(t,4),checkpoint=new RecoveryCheckpoint(f.store,f.tx),equivalent=JSON.stringify(Object.fromEntries(Object.entries(f.tx).reverse()),null,2)+'\n';
  raw(f.store,f.tx.id,equivalent);
  assert.equal(countParses(()=>{for(let i=0;i<12;i++)checkpoint.assertCurrent();}),1);
  raw(f.store,f.tx.id,JSON.stringify({...f.tx,error:'外部核对'}));
  assert.throws(()=>checkpoint.assertCurrent(),/事务记录在恢复期间发生变化/);
  assert.equal(f.store.recoveryRow(f.tx.id)?.json,JSON.stringify({...f.tx,error:'外部核对'}));
  raw(f.store,f.tx.id,equivalent);assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
});

test('实际SQLite删除/坏JSON/超限文本仍拒绝，不恢复旧行',async t=>{
  const f=await fixture(t),checkpoint=new RecoveryCheckpoint(f.store,f.tx),json=JSON.stringify(f.tx);
  for(const value of ['{bad',JSON.stringify({...f.tx,unexpected:true}),json+' '.repeat(8*1024**2)]){
    raw(f.store,f.tx.id,value);assert.throws(()=>checkpoint.assertCurrent(),/事务记录在恢复期间发生变化/);
    assert.equal(f.store.db.exec("SELECT length(CAST(json AS BLOB)) FROM documents WHERE kind='transaction'")[0].values[0][0],Buffer.byteLength(value));
  }
  f.store.db.run("DELETE FROM documents WHERE kind='transaction'");assert.throws(()=>checkpoint.assertCurrent(),/发生变化/);assert.equal(f.store.recoveryRow(f.tx.id),undefined);
});

test('解析通过但任一目标/哈希/应用状态变化均不能刷新缓存',async t=>{
  const f=await fixture(t,1),checkpoint=new RecoveryCheckpoint(f.store,f.tx);
  for(const change of [{...f.tx.changes[0],target:'mods/other.ini'},{...f.tx.changes[0],after:'b'.repeat(64)},{...f.tx.changes[0],applied:true}]){
    const json=JSON.stringify({...f.tx,changes:[change]});raw(f.store,f.tx.id,json);
    assert.throws(()=>checkpoint.assertCurrent(),/发生变化/);assert.throws(()=>checkpoint.assertCurrent(),/发生变化/);assert.equal(f.store.recoveryRow(f.tx.id)?.json,json);
  }
  raw(f.store,f.tx.id,JSON.stringify(f.tx));assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
});

test('保存成功才更新文本基线，省略可选字段仍规范化',async t=>{
  const f=await fixture(t),checkpoint=new RecoveryCheckpoint(f.store,{...f.tx,trustedRestore:undefined});
  const next={...f.tx,state:'恢复待处理' as const,error:undefined};checkpoint.save(next);
  assert.equal(countParses(()=>{checkpoint.assertCurrent();checkpoint.assertCurrent();}),0);
  next.name='调用者后续修改';assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
  assert.equal(readTransaction(f.store,f.tx.id)?.name,f.tx.name);
});

test('保存失败保留旧文本基线，容量拒绝与后续重试正常',async t=>{
  const f=await fixture(t),checkpoint=new RecoveryCheckpoint(f.store,f.tx),original=f.store.put.bind(f.store),failure=new Error('实际保存故障');
  f.store.put=()=>{throw failure;};assert.throws(()=>checkpoint.save({...f.tx,state:'恢复待处理'}),error=>error===failure);
  f.store.put=original;assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
  assert.throws(()=>checkpoint.save({...f.tx,error:'x'.repeat(4097)}),/事务记录/);assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
  checkpoint.save({...f.tx,state:'恢复待处理'});assert.equal(countParses(()=>checkpoint.assertCurrent()),0);
});

test('初始参数后来变化不影响基线，安装操作的拒绝文案保持',async t=>{
  const f=await fixture(t,1),checkpoint=new RecoveryCheckpoint(f.store,f.tx,'安装');f.tx.changes[0].target='mods/user-change.ini';
  assert.equal(countParses(()=>checkpoint.assertCurrent()),0);f.store.db.run("DELETE FROM documents WHERE kind='transaction'");
  assert.throws(()=>checkpoint.assertCurrent(),/事务记录在安装期间发生变化/);
});

test('同一实际SQL账本对照计时，仅记录核心检查耗时不作为GUI或游戏性能验收',async t=>{
  const f=await fixture(t,1500),checkpoint=new RecoveryCheckpoint(f.store,f.tx),checks=24;
  checkpoint.assertCurrent();assert.ok(isDeepStrictEqual(readTransaction(f.store,f.tx.id),f.tx));
  let start=performance.now();for(let i=0;i<checks;i++)assert.ok(isDeepStrictEqual(readTransaction(f.store,f.tx.id),f.tx));const originalMs=performance.now()-start;
  start=performance.now();for(let i=0;i<checks;i++)checkpoint.assertCurrent();const optimizedMs=performance.now()-start;
  t.diagnostic(JSON.stringify({changes:1500,checks,bytes:Buffer.byteLength(JSON.stringify(f.tx)),originalMs,optimizedMs,scope:'同进程实际SQLite文本核对；不写目标文件，不以计时断言通过'}));
  assert.deepEqual(fs.readdirSync(f.game),[]);assert.equal(readTransaction(f.store,f.tx.id)?.changes.length,1500);
});
