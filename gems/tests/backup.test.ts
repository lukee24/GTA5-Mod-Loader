import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Backup} from '../packages/backup';
import {hashFile} from '../packages/core/security';

async function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-backup-')),backup=new Backup(path.join(root,'backup')),source=path.join(root,'source.ini'),target=path.join(root,'target.ini');fs.writeFileSync(source,'verified backup');fs.writeFileSync(target,'user original');const hash=await backup.put(source);return{root,backup,source,target,hash};}

test('恢复副本损坏必须在覆盖原文件之前拒绝，清理临时副本',async()=>{
  const f=await fixture(),original=fs.copyFileSync;
  fs.copyFileSync=(from,to,mode)=>{original(from,to,mode);if(String(from)===f.backup.file(f.hash))fs.writeFileSync(to,'corrupted copy');};
  try{await assert.rejects(f.backup.restore(f.hash,f.target),/临时副本校验失败/);}finally{fs.copyFileSync=original;}
  assert.equal(fs.readFileSync(f.target,'utf8'),'user original');assert.ok(!fs.readdirSync(f.root).some(n=>n.includes('.gems-')));
});

test('复制过程中目标被用户修改时，提交检查保留新文件',async()=>{
  const f=await fixture(),expected=await hashFile(f.target),original=fs.copyFileSync;
  fs.copyFileSync=(from,to,mode)=>{original(from,to,mode);if(String(from)===f.backup.file(f.hash))fs.writeFileSync(f.target,'user changed during copy');};
  try{await assert.rejects(f.backup.restore(f.hash,f.target,expected),/提交前目标发生变化/);}finally{fs.copyFileSync=original;}
  assert.equal(fs.readFileSync(f.target,'utf8'),'user changed during copy');assert.ok(!fs.readdirSync(f.root).some(n=>n.includes('.gems-')));
});

test('预期新增文件却已有用户文件时，恢复不能覆盖',async()=>{
  const f=await fixture();await assert.rejects(f.backup.restore(f.hash,f.target,null),/目标发生变化/);assert.equal(fs.readFileSync(f.target,'utf8'),'user original');
});

test('备份刷新磁盘失败不登记 blob，清理临时文件并保留源文件',async()=>{
  const f=await fixture();fs.writeFileSync(f.source,'different new backup');const original=fs.fsyncSync;
  fs.fsyncSync=()=>{throw new Error('模拟磁盘刷新失败');};
  try{await assert.rejects(f.backup.put(f.source),/磁盘刷新失败/);}finally{fs.fsyncSync=original;}
  assert.deepEqual(fs.readdirSync(path.join(f.backup.root,'blobs')),[f.hash]);assert.equal(fs.readFileSync(f.source,'utf8'),'different new backup');
});

test('恢复目标通过 junction 越界时拒绝，保持外部原文件',async()=>{
  const f=await fixture(),outside=path.join(f.root,'outside'),link=path.join(f.root,'link');fs.mkdirSync(outside);fs.writeFileSync(path.join(outside,'protected.ini'),'external original');fs.symlinkSync(outside,link,'junction');
  await assert.rejects(f.backup.restore(f.hash,path.join(link,'protected.ini')),/链接|连接/);assert.equal(fs.readFileSync(path.join(outside,'protected.ini'),'utf8'),'external original');
});

test('完整恢复校验通过才替换文件，拒绝后可重新执行',async()=>{
  const f=await fixture();await assert.rejects(f.backup.restore(f.hash,f.target,null));const expected=await hashFile(f.target);await f.backup.restore(f.hash,f.target,expected);assert.equal(await hashFile(f.target),f.hash);assert.equal(fs.readFileSync(f.target,'utf8'),'verified backup');
});
