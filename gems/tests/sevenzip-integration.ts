import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {crc32} from 'node:zlib';
import {scan} from '../packages/scanner';
import {verifiedSevenZipBackend, runSevenZip} from '../packages/scanner/sevenzip-backend';
import {noLinks, hashFile} from '../packages/core/security';

async function fixture(t:any){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-sevenzip-')),source=path.join(root,'中文 源文件'),data=path.join(root,'data');fs.mkdirSync(path.join(source,'mods'),{recursive:true});
  const old=process.env.GEMS_7ZIP_DIRECTORY;
  process.env.GEMS_7ZIP_DIRECTORY ??= path.resolve('tools/7zip-26.05');
  t.after(()=>{if(old===undefined)delete process.env.GEMS_7ZIP_DIRECTORY;else process.env.GEMS_7ZIP_DIRECTORY=old;const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gems-sevenzip-'));noLinks(path.parse(resolved).root,resolved);fs.rmSync(resolved,{recursive:true,force:true});});
  const backend=await verifiedSevenZipBackend();
  const create=async(name:string,extra:string[]=[])=>{const archive=path.join(root,name);await promisify(execFile)(backend.exe,['a','-t7z','-mx=0','-ms=off','-mhc=off',...extra,'--',archive,'mods'],{cwd:source,windowsHide:true,timeout:30000,maxBuffer:1024**2});return archive;};
  return{root,source,data,backend,create};
}
test('实际26.05后端逐条导入7Z：中文空格、空文件与原包哈希保持',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'mods/中文 空格.ini'),'[settings]\nvalue=实际数据');fs.writeFileSync(path.join(f.source,'mods/empty.ini'),'');
  const archive=await f.create('中文 模组.7z'),before=await hashFile(archive),report=await scan(archive,f.data);
  assert.equal(await hashFile(archive),before);assert.equal(report.files.length,2);assert.equal(report.files.find(file=>file.path==='mods/empty.ini')?.size,0);assert.match(fs.readFileSync(report.files.find(file=>file.path==='mods/中文 空格.ini')!.source,'utf8'),/实际数据/u);
  assert.deepEqual(report.blockers,[]);assert.equal(fs.readdirSync(path.dirname(path.dirname(report.files[0].source))).some(name=>name.startsWith('archive-stage-')),false);
});
test('实际后端拒绝损坏、伪扩展名与两种加密7Z，保留原包而不发布提取内容',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'mods/config.ini'),'abc');
  const damaged=await f.create('damaged.7z');fs.truncateSync(damaged,12);
  const fake=path.join(f.root,'fake.rar');fs.writeFileSync(fake,'PK fake renamed zip');
  const encrypted=await f.create('encrypted.7z',['-psecret']),headers=await f.create('headers.7z',['-psecret','-mhe=on']);
  for(const archive of [damaged,fake,encrypted,headers]){const before=await hashFile(archive);await assert.rejects(scan(archive,f.data),/损坏|加密|后端|文件头/u);assert.equal(await hashFile(archive),before);}
  for(const folder of fs.readdirSync(path.join(f.data,'imports'))){const work=path.join(f.data,'imports',folder);assert.ok(fs.existsSync(path.join(work,'failure.txt')));assert.equal(fs.readdirSync(work).some(name=>name.startsWith('archive-stage-')),false);assert.deepEqual(fs.readdirSync(path.join(work,'contents')),[]);}
});
test('实际后端 stdout 上限会终止读取；不接受修改后的后端副本',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'mods/config.ini'),'abc');const archive=await f.create('bounded.7z');
  await assert.rejects(runSevenZip(f.backend,['l','-slt','-ba','--',archive],1,30000),/超过/u);
  await assert.rejects(runSevenZip(f.backend,['l','-slt','-ba','--',archive],1024**2,30000,()=>{throw new Error('模拟缓存写入失败');}),/模拟缓存写入失败/u);
  await assert.rejects(runSevenZip(f.backend,['b','-mmt1','-md=1m'],1024**2,10),/时间限制/u);
  const copy=path.join(f.root,'untrusted');fs.mkdirSync(copy);for(const name of ['7z.exe','7z.dll'])fs.copyFileSync(path.join(f.backend.directory,name),path.join(copy,name));
  fs.appendFileSync(path.join(copy,'7z.dll'),'tampered');process.env.GEMS_7ZIP_DIRECTORY=copy;
  await assert.rejects(verifiedSevenZipBackend(),/未通过本版本核验/u);
});
test('实际后端按字面精确选择含特殊符号的文件，solid 7Z 导入可复现',async t=>{
  const f=await fixture(t);
  for(const name of ['-flag.ini','@list.ini','!include.ini','[brackets].ini'])fs.writeFileSync(path.join(f.source,'mods',name),'settings:'+name);
  const archive=await f.create('solid special.7z',['-mx=1','-ms=on','-mhc=on']),report=await scan(archive,f.data);
  assert.equal(report.files.length,4);
  for(const file of report.files)assert.equal(fs.readFileSync(file.source,'utf8'),'settings:'+path.basename(file.path));
});
test('真实7Z恶意条目在目录检查中拒绝，损坏数据流清理自有暂存并保留原包',async t=>{
  const f=await fixture(t);fs.writeFileSync(path.join(f.source,'mods/config.ini'),'abc');
  const archive=await f.create('traversal.7z'),bytes=fs.readFileSync(archive);
  const start=32+Number(bytes.readBigUInt64LE(12)),length=Number(bytes.readBigUInt64LE(20));
  const needle=Buffer.from('mods/config.ini','utf16le'),replacement=Buffer.from('../escape/a.ini','utf16le');assert.equal(needle.length,replacement.length);
  const offset=bytes.indexOf(needle,start);assert.ok(offset>=start&&offset+needle.length<=start+length);replacement.copy(bytes,offset);
  bytes.writeUInt32LE(crc32(bytes.subarray(start,start+length)),28);bytes.writeUInt32LE(crc32(bytes.subarray(12,32)),8);fs.writeFileSync(archive,bytes);
  const before=await hashFile(archive);await assert.rejects(scan(archive,f.data),/非法路径/u);assert.equal(await hashFile(archive),before);assert.equal(fs.existsSync(path.join(f.root,'escape')),false);
  const broken=await f.create('crc-error.7z'),payload=fs.readFileSync(broken);payload[32]^=0xff;fs.writeFileSync(broken,payload);
  await assert.rejects(scan(broken,f.data),/损坏|CRC|后端/u);
  for(const folder of fs.readdirSync(path.join(f.data,'imports'))){const work=path.join(f.data,'imports',folder);assert.equal(fs.readdirSync(work).some(name=>name.startsWith('archive-stage-')),false);assert.deepEqual(fs.readdirSync(path.join(work,'contents')),[]);}
});
