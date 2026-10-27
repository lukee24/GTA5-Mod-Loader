import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {hashFile,hashOrNull,MAX_BYTES} from '../packages/core/security';
import {Backup} from '../packages/backup';import {Store} from '../packages/database';import {Installer} from '../packages/installer';import {scan} from '../packages/scanner';
function fixture(t:any){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-file-hash-')),file=path.join(root,'source.ini'),bytes=Buffer.alloc(128*1024,37);fs.writeFileSync(file,bytes);t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-file-hash-'));fs.rmSync(root,{recursive:true});});return{root,file,bytes};}
test('正常与空文件实际SHA正确，初始不存在才返回null',async t=>{
 const f=fixture(t);assert.equal(await hashFile(f.file),crypto.createHash('sha256').update(f.bytes).digest('hex'));
 fs.writeFileSync(f.file,'');assert.equal(await hashFile(f.file),crypto.createHash('sha256').digest('hex'));assert.equal(await hashOrNull(path.join(f.root,'missing.ini')),null);
});
test('实际短读循环仍给出完整SHA，提前EOF不返回截断摘要',async t=>{
 const f=fixture(t),bytes=Buffer.alloc(1024,42),original=fs.read;fs.writeFileSync(f.file,bytes);let calls=0;
 (fs as any).read=(...args:any[])=>{calls++;args[3]=Math.min(args[3],3);return(original as any)(...args);};
 try{assert.equal(await hashFile(f.file),crypto.createHash('sha256').update(bytes).digest('hex'));assert.ok(calls>300);}finally{(fs as any).read=original;}
 calls=0;(fs as any).read=(...args:any[])=>{if(++calls===2){queueMicrotask(()=>args[5](null,0,args[1]));return;}args[3]=3;return(original as any)(...args);};
 try{await assert.rejects(hashFile(f.file),/读取不完整/);}finally{(fs as any).read=original;}
 assert.deepEqual(fs.readFileSync(f.file),bytes);
});
test('读取中实际替换路径或改写内容并改变时间戳，保留新旧字节且拒绝',async t=>{
 const f=fixture(t),original=fs.read,newer=Buffer.alloc(f.bytes.length,42);
 for(const mode of ['replace','same-length']){
  fs.writeFileSync(f.file,f.bytes);let changed=false;const moved=path.join(f.root,'old.ini');
  (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;if(mode==='replace')fs.renameSync(f.file,moved);fs.writeFileSync(f.file,newer);if(mode==='same-length')fs.utimesSync(f.file,new Date('2020-01-01'),new Date('2020-01-01'));}callback(...result);};return(original as any)(...args);};
  try{await assert.rejects(hashFile(f.file),/哈希读取.*变化/);}finally{(fs as any).read=original;}
  assert.ok(changed);assert.deepEqual(fs.readFileSync(f.file),newer);if(mode==='replace')assert.deepEqual(fs.readFileSync(moved),f.bytes);
 }
});
test('非普通文件/父连接/超20GiB元数据在读取前拒绝，硬链接只读允许',async t=>{
 const f=fixture(t),directory=path.join(f.root,'directory'),junction=path.join(f.root,'junction'),hard=path.join(f.root,'hard.ini');fs.mkdirSync(directory);
 await assert.rejects(hashFile(directory),/普通文件/);fs.symlinkSync(f.root,junction,'junction');await assert.rejects(hashFile(path.join(junction,'source.ini')),/链接|连接/);fs.unlinkSync(junction);
 fs.linkSync(f.file,hard);assert.equal(await hashFile(hard),crypto.createHash('sha256').update(f.bytes).digest('hex'));assert.deepEqual(fs.readFileSync(f.file),f.bytes);fs.unlinkSync(hard);
 const lstat=fs.lstatSync,open=fs.openSync;let opens=0;
 (fs as any).lstatSync=(...args:any[])=>{const stat=(lstat as any)(...args);if(String(args[0])===f.file&&args[1]?.bigint){const large=Object.create(stat);large.size=BigInt(MAX_BYTES)+1n;return large;}return stat;};
 fs.openSync=((...args:any[])=>{opens++;return(open as any)(...args);}) as typeof fs.openSync;
 try{await assert.rejects(hashFile(f.file),/20GiB/);assert.equal(opens,0);}finally{(fs as any).lstatSync=lstat;fs.openSync=open;}
 assert.deepEqual(fs.readFileSync(f.file),f.bytes);
});
test('异步读取失败保留原错误且句柄关闭，随后同服务核验正常',async t=>{
 const f=fixture(t),read=fs.read,open=fs.openSync,failure=new Error('注入原始读取故障');let descriptor:number|undefined;
 fs.openSync=((...args:any[])=>{const fd=(open as any)(...args);if(String(args[0])===f.file)descriptor=fd;return fd;}) as typeof fs.openSync;
 (fs as any).read=(...args:any[])=>{queueMicrotask(()=>args[5](failure,0,args[1]));};
 try{await assert.rejects(hashFile(f.file),error=>error===failure);}finally{(fs as any).read=read;fs.openSync=open;}
 assert.notEqual(descriptor,undefined);assert.throws(()=>fs.fstatSync(descriptor!),{code:'EBADF'});assert.deepEqual(fs.readFileSync(f.file),f.bytes);assert.equal(await hashFile(f.file),crypto.createHash('sha256').update(f.bytes).digest('hex'));
});
test('读取中实际截断不得确认短内容，保留外部截断且关闭句柄',async t=>{
 const f=fixture(t),read=fs.read;let changed=false;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;fs.truncateSync(f.file,1);}callback(...result);};return(read as any)(...args);};
 try{await assert.rejects(hashFile(f.file),/哈希读取.*变化/);}finally{(fs as any).read=read;}
 assert.ok(changed);assert.equal(fs.statSync(f.file).size,1);assert.equal(fs.readFileSync(f.file)[0],37);
});
test('备份来源读取期间追加被拒绝，不登记blob并保留追加来源',async t=>{
 const f=fixture(t),backup=new Backup(path.join(f.root,'backup')),read=fs.read;let changed=false;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;fs.appendFileSync(f.file,'实际备份源追加');}callback(...result);};return(read as any)(...args);};
 try{await assert.rejects(backup.put(f.file),/哈希读取.*变化/);}finally{(fs as any).read=read;}
 assert.ok(changed);assert.deepEqual(fs.readdirSync(path.join(backup.root,'blobs')),[]);assert.equal(fs.statSync(f.file).size,f.bytes.length+Buffer.byteLength('实际备份源追加'));
});
test('真实扫描/SQLite安装预览拒绝增长缓存，外部恢复后安装与停用正常',async t=>{
 const f=fixture(t),data=path.join(f.root,'data'),game=path.join(f.root,'game'),source=path.join(f.root,'package');fs.mkdirSync(game);fs.mkdirSync(path.join(source,'scripts'),{recursive:true});fs.writeFileSync(path.join(source,'scripts/test.ini'),f.bytes);
 const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
 try{
  const report=await scan(source,data),backup=new Backup(path.join(data,'backup')),installer=new Installer(store,backup,async()=>{}),cached=report.files[0].source,before=fs.readFileSync(path.join(data,'gems.sqlite')),read=fs.read;let changed=false;
  (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;fs.appendFileSync(cached,'实际缓存追加');}callback(...result);};return(read as any)(...args);};
  let plan;try{plan=await installer.plan(report,game);}finally{(fs as any).read=read;}
  assert.ok(changed);assert.ok(plan.blockers.some(message=>/哈希读取.*变化/.test(message)));assert.equal(plan.files.length,0);assert.deepEqual(fs.readdirSync(game),[]);assert.deepEqual(fs.readdirSync(path.join(backup.root,'blobs')),[]);assert.deepEqual(fs.readFileSync(path.join(data,'gems.sqlite')),before);assert.equal(store.list('transaction').length,0);assert.deepEqual(fs.readFileSync(path.join(source,'scripts/test.ini')),f.bytes);
  fs.writeFileSync(cached,f.bytes);const healthy=await installer.plan(report,game);assert.deepEqual(healthy.blockers,[]);await installer.install(healthy,report,{overwrite:false,binary:true});assert.deepEqual(fs.readFileSync(path.join(game,'scripts/test.ini')),f.bytes);await installer.disable(report.id);assert.equal(fs.existsSync(path.join(game,'scripts/test.ini')),false);
 }finally{store.close();}
});
test('哈希读取中实际追加文件必须拒绝，不把增长后的内容当原文件证据',async t=>{
 const f=fixture(t),original=fs.read;let changed=false;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;fs.appendFileSync(f.file,'实际追加');}callback(...result);};return(original as any)(...args);};
 try{await assert.rejects(hashFile(f.file),/哈希读取.*变化/);}finally{(fs as any).read=original;}
 assert.ok(changed);assert.equal(fs.statSync(f.file).size,f.bytes.length+Buffer.byteLength('实际追加'));
});
test('读取开始后实际删除文件不能被hashOrNull误判为初始缺失',async t=>{
 const f=fixture(t),original=fs.read;let changed=false;
 (fs as any).read=(...args:any[])=>{const callback=args[5];args[5]=(...result:any[])=>{if(!changed){changed=true;fs.unlinkSync(f.file);}callback(...result);};return(original as any)(...args);};
 try{await assert.rejects(hashOrNull(f.file),/哈希读取.*变化/);}finally{(fs as any).read=original;}
 assert.ok(changed);assert.equal(fs.existsSync(f.file),false);
});
