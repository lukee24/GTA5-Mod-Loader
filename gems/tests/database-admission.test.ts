import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import initSqlJs from 'sql.js';import {Store} from '../packages/database';
const wasm=path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture(t:any,sql:string){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-admission-'));const SQL=await initSqlJs({locateFile:()=>wasm}),db=new SQL.Database();try{db.run(sql);fs.writeFileSync(path.join(root,'gems.sqlite'),db.export());}finally{db.close();}t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-admission-'));fs.rmSync(root,{recursive:true});});return root;}
const documents='CREATE TABLE documents(kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,id));';
for(const [name,sql]of [
  ['缺少版本表',documents],
  ['版本表为空',documents+'CREATE TABLE schema_version(version INTEGER NOT NULL);'],
  ['版本记录歧义',documents+'CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1),(2);'],
  ['重复版本记录',documents+'CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1),(1);'],
  ['版本列缺失',documents+'CREATE TABLE schema_version(other INTEGER NOT NULL);INSERT INTO schema_version VALUES(1);'],
  ['记录表主键错误','CREATE TABLE documents(kind TEXT,id TEXT,json TEXT);CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1);']
])test('已有数据库'+name+'必须拒绝并保留原始字节',async t=>{
  const root=await fixture(t,sql),file=path.join(root,'gems.sqlite'),before=fs.readFileSync(file);let opened:Store|undefined;
  try{await assert.rejects(async()=>{opened=await Store.open(root,wasm);},/数据库/);assert.deepEqual(fs.readFileSync(file),before);}finally{opened?.close();}
});
test('超限数据库必须在全量读取前拒绝',async t=>{
  const root=await fixture(t,documents+'CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1);'),file=path.join(root,'gems.sqlite');
  const fd=fs.openSync(file,'r+');try{fs.ftruncateSync(fd,256*1024**2+1);}finally{fs.closeSync(fd);}
  const read=fs.readFileSync;let reads=0;
  fs.readFileSync=((name:any,...args:any[])=>{if(name===file){reads++;throw Error('测试拒绝全量读取超限文件');}return (read as any)(name,...args);}) as typeof fs.readFileSync;
  try{await assert.rejects(Store.open(root,wasm),/数据库.*256 MiB/);assert.equal(reads,0);assert.equal(fs.statSync(file).size,256*1024**2+1);}finally{fs.readFileSync=read;}
});
test('支持的真实数据库可以写入、关闭、重新打开而不改变记录',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-db-admission-'));t.after(()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-db-admission-'));fs.rmSync(root,{recursive:true});});
  const first=await Store.open(root,wasm);first.put('settings','main',{value:'真实中文记录'});first.close();const second=await Store.open(root,wasm);try{assert.deepEqual(second.get('settings','main'),{value:'真实中文记录'});}finally{second.close();}
});
test('数据库导出超限时保留磁盘和内存基线，不留下假保存结果',async t=>{
  const root=await fixture(t,documents+'CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1);');
  const store=await Store.open(root,wasm);store.put('settings','main',{value:'原始记录'});
  const file=path.join(root,'gems.sqlite'),before=fs.readFileSync(file),exportOriginal=store.db.export.bind(store.db);let calls=0;
  // 故障注入：第二次 export 对应保存新状态，模拟超限输出，非有效大库性能测试。
  store.db.export=()=>++calls===2?new Uint8Array(256*1024**2+1):exportOriginal();
  try{assert.throws(()=>store.put('settings','main',{value:'不应提交'}),/数据库.*256 MiB/);assert.deepEqual(store.get('settings','main'),{value:'原始记录'});assert.deepEqual(fs.readFileSync(file),before);}finally{store.close();}
});
