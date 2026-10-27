import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {inspectRuntimeDependencies, MAX_RUNTIME_BINARY_BYTES, readGameVersion} from '../packages/diagnostics/runtime-dependencies';
import {noLinks} from '../packages/core/security';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-runtime-'));
  return {root, cleanup() {const resolved = path.resolve(root); assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('gems-runtime-')); noLinks(path.parse(resolved).root, resolved); fs.rmSync(resolved, {recursive: true, force: true});}};
}
function pe(machine = 0x8664) {const buffer = Buffer.alloc(128); buffer.write('MZ'); buffer.writeUInt32LE(64, 60); buffer.writeUInt32LE(0x4550, 64); buffer.writeUInt16LE(machine, 68); return buffer;}
const dependency = (root: string, version = '1.0.1158.16', id = 'scripthookv') => inspectRuntimeDependencies(root, version).dependencies.find(item => item.id === id)!;

test('缺少依赖与精确版本不在支持记录中分别展示，不把旧日志当成当前加载证明', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'ScriptHookV.log'), 'INIT: Success, game version is VER_EN_1_0_1158_13\nCORE: Launching main() for NativeTrainer.asi');
    const result = inspectRuntimeDependencies(f.root, '1.0.1158.16');
    assert.ok(result.dependencies.every(item => item.status === 'missing'));
    assert.equal(result.dependencies.find(item => item.id === 'scripthookv')!.support, 'not-listed');
    assert.equal(result.gameplay, 'not-tested');
    assert.match(result.summary, /未进行游戏内加载/u);
    assert.equal(fs.readdirSync(f.root).length, 1);
  } finally {f.cleanup();}
});

test('真实 PE 候选与稳定哈希不能替代发布者身份、版本支持或游戏内验证', () => {
  const f = fixture(), original = pe();
  try {
    fs.writeFileSync(path.join(f.root, 'ScriptHookV.dll'), original);
    const unsupported = dependency(f.root);
    assert.equal(unsupported.status, 'unsupported');
    assert.equal(unsupported.files[0].status, 'present');
    assert.equal(unsupported.files[0].sha256, crypto.createHash('sha256').update(original).digest('hex'));
    assert.equal(unsupported.source?.checked, '2026-10-26');
    assert.equal(unsupported.source?.source, 'https://www.dev-c.com/gtav/scripthookv/');
    const matching = dependency(f.root, '1.0.1158.13');
    assert.equal(matching.support, 'matched'); assert.equal(matching.status, 'unknown');
    assert.match(matching.evidence, /组件二进制和游戏内运行仍待验证/u);
    assert.equal(dependency(f.root, '未知').support, 'unknown');
    assert.deepEqual(fs.readFileSync(path.join(f.root, 'ScriptHookV.dll')), original);
  } finally {f.cleanup();}
});

test('配置存在、相似版本及错误架构不能伪装已就绪运行时', () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.root, 'ReShade.ini'), '[GENERAL]');
    assert.equal(dependency(f.root, '1.0.1158.13', 'reshade').status, 'missing');
    for (const payload of [Buffer.from('not a binary'), pe(0x14c)]) {
      fs.writeFileSync(path.join(f.root, 'ScriptHookV.dll'), payload);
      const result = dependency(f.root, '1.0.1158.13 (patched)');
      assert.equal(result.status, 'unknown'); assert.equal(result.support, 'unknown'); assert.equal(result.files[0].status, 'invalid');
    }
  } finally {f.cleanup();}
});

test('同名目录、超限文件和硬链接不作为可读取依赖，其他组件继续诊断', () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, 'OpenRPF.asi'));
    const large = path.join(f.root, 'ScriptHookV.dll'); fs.closeSync(fs.openSync(large, 'w')); fs.truncateSync(large, MAX_RUNTIME_BINARY_BYTES + 1);
    fs.writeFileSync(path.join(f.root, 'dinput8.dll'), pe()); fs.linkSync(path.join(f.root, 'dinput8.dll'), path.join(f.root, 'loader-alias'));
    const result = inspectRuntimeDependencies(f.root, '1.0.1158.13');
    for (const id of ['openrpf', 'scripthookv', 'asi-loader']) assert.equal(result.dependencies.find(item => item.id === id)!.files[0].status, 'unreadable');
    assert.equal(result.dependencies.find(item => item.id === 'scripthookvdotnet')!.status, 'missing');
  } finally {if (fs.existsSync(path.join(f.root, 'loader-alias'))) fs.unlinkSync(path.join(f.root, 'loader-alias')); f.cleanup();}
});

test('候选读取期间发生修改，丢弃哈希和成功状态', () => {
  const f = fixture(), file = path.join(f.root, 'ScriptHookV.dll'), originalRead = fs.readSync;
  let changed = false;
  try {
    fs.writeFileSync(file, pe());
    fs.readSync = ((fd: number, buffer: Buffer, ...args: any[]) => {
      const count = (originalRead as any)(fd, buffer, ...args);
      if (!changed && buffer.length === 64 * 1024) {changed = true; fs.writeFileSync(file, Buffer.from('changed during read'));}
      return count;
    }) as typeof fs.readSync;
    const result = dependency(f.root);
    assert.equal(changed, true); assert.equal(result.files[0].status, 'unreadable'); assert.equal(result.files[0].sha256, undefined);
    assert.equal(result.status, 'unknown'); assert.match(result.files[0].evidence, /发生变化/u);
  } finally {fs.readSync = originalRead; f.cleanup();}
});

test('两个加载器与不完整 .NET 候选保持待核实且不自动删除文件', () => {
  const f = fixture();
  try {
    for (const name of ['dinput8.dll', 'dsound.dll', 'ScriptHookVDotNet3.dll']) fs.writeFileSync(path.join(f.root, name), pe());
    const result = inspectRuntimeDependencies(f.root, '1.0.1158.13');
    assert.match(result.dependencies.find(item => item.id === 'asi-loader')!.evidence, /排除旧加载器冲突/u);
    const dotnet = result.dependencies.find(item => item.id === 'scripthookvdotnet')!;
    assert.equal(dotnet.status, 'unknown'); assert.match(dotnet.evidence, /其中一个文件存在不能证明依赖完整/u);
    assert.equal(fs.readdirSync(f.root).length, 3);
  } finally {f.cleanup();}
});

test('未知游戏版本保留读取失败原因，取消信号不能降级为已检查', async () => {
  const f = fixture();
  try {
    const result = inspectRuntimeDependencies(f.root, '未知', '版本查询不可用');
    assert.equal(result.gameVersionError, '版本查询不可用');
    assert.equal(result.dependencies.find(item => item.id === 'scripthookv')!.support, 'unknown');
    const controller = new AbortController(); controller.abort(new Error('取消诊断'));
    await assert.rejects(readGameVersion(f.root, controller.signal), /取消诊断/u);
  } finally {f.cleanup();}
});
