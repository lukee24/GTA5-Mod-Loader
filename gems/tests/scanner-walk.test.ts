import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {walk} from '../packages/scanner';
import {MAX_FILES,noLinks} from '../packages/core/security';

function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-walk-'));return{root,cleanup(){assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-walk-'));noLinks(path.parse(root).root,root);fs.rmSync(root,{recursive:true});}};}
test('真实嵌套目录读取实际相对路径和大小，空目录不虚构文件',async()=>{
 const f=fixture();try{fs.mkdirSync(path.join(f.root,'scripts','empty'),{recursive:true});fs.writeFileSync(path.join(f.root,'scripts','中文.ini'),'中文');const files=await walk(f.root);assert.equal(files.length,1);assert.equal(files[0].relative,'scripts/中文.ini');assert.equal(files[0].size,6);assert.equal(fs.readFileSync(files[0].file,'utf8'),'中文');}finally{f.cleanup();}
});
test('目录逐条读取，不调用整目录readdirSync',async()=>{
 const f=fixture();fs.writeFileSync(path.join(f.root,'a.ini'),'1');const before=fs.readdirSync;
 try{fs.readdirSync=(()=>{throw Error('整目录枚举不允许');}) as typeof fs.readdirSync;assert.equal((await walk(f.root)).length,1);}finally{fs.readdirSync=before;f.cleanup();}
});
test('超出全部条目预算的空目录枚举拒绝，所有已打开句柄关闭',async()=>{
 const f=fixture(),open=fs.opendirSync,read=fs.readdirSync,stat=fs.lstatSync;let opens=0,closes=0,reads=0;
 const entries=MAX_FILES*2+1;
 const entry=(index:number)=>({name:'empty-'+index,isDirectory:()=>true,isFile:()=>false});
 // Deterministic directory-enumerator fixture, not a Windows 40001-directory pressure test.
 try{
  const ancestors=new Map<string,fs.Stats>();let parent=f.root;while(true){ancestors.set(parent,stat(parent));const next=path.dirname(parent);if(next===parent)break;parent=next;}
  // Virtual children have no physical files. Cache fixed real ancestors only in
  // this enumeration-budget test; the other tests use real filesystem checks.
  Reflect.set(fs,'lstatSync',((file:string)=>{const key=path.resolve(file),value=ancestors.get(key);if(value)return value;if(key.startsWith(f.root+path.sep))throw Object.assign(Error('virtual child'),{code:'ENOENT'});return stat(file);}) as typeof fs.lstatSync);
  fs.readdirSync=((dir:string)=>path.resolve(dir)===f.root?Array.from({length:entries},(_,i)=>entry(i)):[]) as unknown as typeof fs.readdirSync;
  fs.opendirSync=((dir:string)=>{opens++;let index=0;return{readSync(){reads++;return path.resolve(dir)===f.root&&index<entries?entry(index++):null;},closeSync(){closes++;}};}) as unknown as typeof fs.opendirSync;
  await assert.rejects(walk(f.root),/目录条目超过40000项/);assert.equal(opens,closes);assert.equal(opens,entries);assert.equal(reads,entries*2-1);
 }finally{fs.opendirSync=open;fs.readdirSync=read;Reflect.set(fs,'lstatSync',stat);f.cleanup();}
});
test('子目录读取异常关闭当前和祖先句柄，保留输入',async()=>{
 const f=fixture(),open=fs.opendirSync;let opens=0,closes=0;fs.mkdirSync(path.join(f.root,'child'));fs.writeFileSync(path.join(f.root,'a.ini'),'unchanged');
 try{fs.opendirSync=((dir:string)=>{const handle=open(dir);opens++;const close=handle.closeSync.bind(handle),read=handle.readSync.bind(handle);handle.closeSync=()=>{closes++;close();};handle.readSync=()=>{if(path.basename(dir)==='child')throw Error('夹具读取故障');return read();};return handle;}) as typeof fs.opendirSync;await assert.rejects(walk(f.root),/夹具读取故障/);assert.equal(opens,2);assert.equal(closes,2);assert.equal(fs.readFileSync(path.join(f.root,'a.ini'),'utf8'),'unchanged');}finally{fs.opendirSync=open;f.cleanup();}
});
test('真实超过64层目录拒绝，并关闭全部父目录句柄',async()=>{
 const f=fixture(),open=fs.opendirSync;let opens=0,closes=0,cursor=f.root;
 try{for(let i=0;i<65;i++){cursor=path.join(cursor,'d');fs.mkdirSync(cursor);}fs.opendirSync=((dir:string)=>{const handle=open(dir);opens++;const close=handle.closeSync.bind(handle);handle.closeSync=()=>{closes++;close();};return handle;}) as typeof fs.opendirSync;await assert.rejects(walk(f.root),/目录嵌套/);assert.equal(opens,65);assert.equal(closes,65);assert.equal(fs.existsSync(cursor),true);}finally{fs.opendirSync=open;f.cleanup();}
});
