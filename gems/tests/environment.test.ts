import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {explainError} from '../packages/core/errors';
import {inspectSteam, parseManifest} from '../packages/diagnostics/steam';
import {validateGame, inspectEnvironment} from '../packages/diagnostics';
import {Store} from '../packages/database';
import {Installer} from '../packages/installer';
import {Backup} from '../packages/backup';
import {scan} from '../packages/scanner';
import type {Transaction} from '../packages/core/types';
import {noLinks} from '../packages/core/security';
function cleanup(base: string) {
 const resolved = path.resolve(base);
 assert.equal(path.dirname(resolved).toLowerCase(), path.resolve(os.tmpdir()).toLowerCase());
 assert.ok(path.basename(resolved).startsWith('gems-steam-'));
 noLinks(path.parse(resolved).root, resolved);
 fs.rmSync(resolved, {recursive: true, force: true});
}

function fixture(extra = '', flags = '4') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-steam-test-'));
  const root = path.join(base, 'steamapps', 'common', 'Enhanced');
  fs.mkdirSync(path.join(root, 'update'), {recursive: true});
  const pe = Buffer.alloc(128); pe.write('MZ'); pe.writeUInt32LE(64, 60); pe.writeUInt32LE(0x4550, 64); pe.writeUInt16LE(0x8664, 68);
  fs.writeFileSync(path.join(root, 'GTA5_Enhanced.exe'), pe);
  const rpf = Buffer.alloc(16); rpf.writeUInt32LE(0x52504637);
  fs.writeFileSync(path.join(root, 'update/update.rpf'), rpf);
  const manifest = path.join(base, 'steamapps', 'appmanifest_3240220.acf');
  fs.writeFileSync(manifest, `"AppState" { "appid" "3240220" "installdir" "Enhanced" "StateFlags" "${flags}" "buildid" "1234" ${extra} }`);
  return {base, root, manifest};
}
test('Steam 安装记录就绪仍保留未完整性验证状态', async () => {
  const f = fixture();
  try {assert.equal(inspectSteam(f.root)?.ready, true); await validateGame(f.root); assert.match(inspectSteam(f.root)!.evidence, /未执行完整性验证/);} finally {cleanup(f.base);}
});
test('Steam 非就绪状态即使 PE/RPF 已存在也拒绝修改', async () => {
  const f = fixture('', '1026'); const before = fs.readFileSync(f.manifest);
  try {await assert.rejects(validateGame(f.root), /尚未确认完成/); const env = await inspectEnvironment(f.root); assert.equal(env.valid, false); assert.equal(env.components.find(component=>component.name==='Steam 下载与部署')?.status, '尚未就绪'); if(env.running===null)assert.ok(env.components.some(component=>component.name==='游戏进程'&&component.status==='未知'&&component.evidence)); assert.deepEqual(fs.readFileSync(f.manifest), before);} finally {cleanup(f.base);}
});
test('Steam 下载和部署计数都必须完成，不根据文件存在判成功', async () => {
  for (const extra of ['"BytesDownloaded" "1" "BytesToDownload" "2"', '"BytesStaged" "1" "BytesToStage" "2"', '"BytesToDownload" "2"']) {
    const f = fixture(extra); try {assert.equal(inspectSteam(f.root)?.ready, false); await assert.rejects(validateGame(f.root));} finally {cleanup(f.base);}
  }
});
test('Steam 完成计数与稳定状态允许后续文件检查', async () => {
  const f = fixture('"BytesDownloaded" "2" "BytesToDownload" "2" "BytesStaged" "3" "BytesToStage" "3"');
  try {await validateGame(f.root);} finally {cleanup(f.base);}
});
test('Steam 暂存目录和安装目录不匹配阻止使用', () => {
  const f = fixture();
  try {assert.throws(() => inspectSteam(path.join(f.base, 'steamapps/downloading/3240220')), /暂存目录/); assert.throws(() => inspectSteam(path.join(f.base, 'steamapps/common/Other')), /不一致/);} finally {cleanup(f.base);}
});
test('Steam 安装记录损坏、重复、路径穿越及超大计数均拒绝', () => {
  const f = fixture();
  try {
    for (const value of ['"AppState" {', '"AppState" {"appid" "3240220" "installdir" "../Enhanced"}', '"AppState" {"appid" "3240220" "installdir" "Enhanced" "stateflags" "4" "StateFlags" "4"}', '"AppState" {"appid" "3240220" "installdir" "Enhanced" "stateflags" "4" "buildid" "9007199254740999"}']) {
      fs.writeFileSync(f.manifest, value); assert.throws(() => inspectSteam(f.root));
    }
  } finally {cleanup(f.base);}
});
test('KeyValues 引号中大括号不会当作结构，注释和转义正确读取', () => {
  const parsed = parseManifest('// note\n"AppState" { "name" "{" "path" "a\\\\b" "nested" {"quote" "a\\\"b"} }');
  assert.deepEqual(JSON.parse(JSON.stringify(parsed)), {appstate: {name: '{', path: 'a\\b', nested: {quote: 'a"b'}}});
  for (const text of ['x', '"a" "bad\\n"', '}', '"a" {'.repeat(18), 'a'.repeat(1048577)]) assert.throws(() => parseManifest(text));
});
test('中文文件系统错误提示保留可查询错误码而不暴露原始路径', () => {
  for (const code of ['ENOENT', 'EACCES', 'EPERM', 'EBUSY', 'ENOSPC', 'EEXIST', 'EIO']) {
    const message = explainError(Object.assign(new Error(code + ': C:/private/path'), {code}));
    assert.match(message, /[\u4e00-\u9fff]/); assert.ok(message.includes(code)); assert.ok(!message.includes('private'));
  }
  assert.equal(explainError(new Error('已有模组仍在使用此文件')), '已有模组仍在使用此文件');
  assert.match(explainError(new Error('unexpected engine error')), /技术信息/);
  assert.ok(!explainError('\u0000error').includes('\u0000'));
});
test('Steam 在安装预览后开始更新，执行时拒绝写入且不创建假成功记录', async () => {
  const f = fixture(); const data = path.join(f.base, 'data');
  const store = await Store.open(data, path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  try {
    const source = path.join(f.base, 'package'); fs.mkdirSync(path.join(source, 'mods'), {recursive: true}); fs.writeFileSync(path.join(source, 'mods/config.ini'), 'real test');
    const report = await scan(source, data), installer = new Installer(store, new Backup(path.join(data, 'backup')), validateGame);
    const plan = await installer.plan(report, f.root);
    assert.equal(plan.blockers.length, 0);
    fs.writeFileSync(f.manifest, fs.readFileSync(f.manifest, 'utf8').replace('"StateFlags" "4"', '"StateFlags" "1026"'));
    await assert.rejects(installer.install(plan, report, {overwrite: false, binary: true}), /尚未确认完成/);
    assert.equal(fs.existsSync(path.join(f.root, 'mods/config.ini')), false); assert.equal(store.list('mod').length, 0);
  } finally {store.close(); cleanup(f.base);}
});
test('Steam 安装记录所在路径发生 junction 越界时拒绝读取', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-steam-link-'));
  const actual = path.join(base, 'actual'), link = path.join(base, 'steamapps'); fs.mkdirSync(path.join(actual, 'common/Enhanced'), {recursive: true}); fs.symlinkSync(actual, link, 'junction');
  try {assert.throws(() => inspectSteam(path.join(link, 'common/Enhanced')), /连接/);} finally {fs.unlinkSync(link); cleanup(base);}
});
test('恢复文件占用时保留文件与中文待处理记录，解除占用后继续恢复', async () => {
  const f = fixture(), data = path.join(f.base, 'data');
  const store = await Store.open(data, path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  try {
    const source = path.join(f.base, 'package'); fs.mkdirSync(path.join(source, 'mods'), {recursive: true}); fs.writeFileSync(path.join(source, 'mods/config.ini'), 'new');
    fs.mkdirSync(path.join(f.root, 'mods')); fs.writeFileSync(path.join(f.root, 'mods/config.ini'), 'old');
    const report = await scan(source, data), backup = new Backup(path.join(data, 'backup')), installer = new Installer(store, backup, validateGame);
    await installer.install(await installer.plan(report, f.root), report, {overwrite: true, binary: true});
    const restore = backup.restore.bind(backup); backup.restore = async () => {throw Object.assign(new Error('EBUSY: file locked'), {code: 'EBUSY'});};
    await assert.rejects(installer.disable(report.id), /其他程序使用/);
    const tx = store.list<Transaction>('transaction')[0]; assert.equal(tx.state, '恢复待处理'); assert.match(tx.error!, /EBUSY/); assert.equal(fs.readFileSync(path.join(f.root, 'mods/config.ini'), 'utf8'), 'new');
    backup.restore = restore; await installer.recover(); assert.equal(fs.readFileSync(path.join(f.root, 'mods/config.ini'), 'utf8'), 'old'); assert.equal(store.list<Transaction>('transaction')[0].state, '已回滚');
  } finally {store.close(); cleanup(f.base);}
});
