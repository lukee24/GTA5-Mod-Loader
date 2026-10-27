import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { RpfError, readRpfBuffer } from './index';
import { inspectResourceHeader, analyzeResourceFile, convertResources } from '../converter/index';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function binary(name: string, payload: Buffer, compressed = false): Buffer {
  const packed = compressed ? deflateRawSync(payload) : payload;
  const names = Buffer.from(`\0${name}\0`), b = Buffer.alloc(512 + packed.length);
  b.writeUInt32LE(0x52504637, 0); b.writeUInt32LE(2, 4); b.writeUInt32LE(names.length, 8); b.writeUInt32LE(0x4e45504f, 12);
  b.writeUInt32LE(0x7fffff00, 20); b.writeUInt32LE(1, 24); b.writeUInt32LE(1, 28);
  b.writeUInt16LE(1, 32); b.writeUIntLE(compressed ? packed.length : 0, 34, 3); b.writeUIntLE(1, 37, 3); b.writeUInt32LE(payload.length, 40);
  names.copy(b, 48); packed.copy(b, 512); return b;
}
function resource(version = 162): Buffer {
  const payload = deflateRawSync(Buffer.alloc(512)), result = Buffer.alloc(16 + payload.length);
  result.writeUInt32LE(0x37435352); result.writeUInt32LE(version, 4);
  result.writeUInt32LE(((version >>> 4) * 0x10000000 + 0x08000000) >>> 0, 8); result.writeUInt32LE(((version & 15) * 0x10000000) >>> 0, 12);
  payload.copy(result, 16); return result;
}
test('读取和提取未压缩二进制 RPF；不修改输入', () => {
  const source = binary('dlclist.xml', Buffer.from('<paths/>')), before = Buffer.from(source), rpf = readRpfBuffer(source);
  assert.equal(rpf.list()[1].path, 'dlclist.xml'); assert.equal(rpf.extractBinary(1).toString(), '<paths/>'); assert.deepEqual(source, before);
  source.fill(0); assert.equal(rpf.extractBinary(1).toString(), '<paths/>');
});
test('提取压缩二进制并验证实际大小', () => { const r = readRpfBuffer(binary('readme.txt', Buffer.from('abc'.repeat(1000)), true)); assert.equal(r.extractBinary(1).length, 3000); });
test('递归读取嵌套 RPF，并保留内部路径', () => { const r = readRpfBuffer(binary('inner.rpf', binary('meta.xml', Buffer.from('<meta/>')))); assert.equal(r.inspectNested()[0].entries?.[1].path, 'meta.xml'); });
test('嵌套损坏 RPF 返回具体失败原因', () => { const r = readRpfBuffer(binary('inner.rpf', Buffer.alloc(20))); assert.equal(r.inspectNested()[0].code, 'UNSUPPORTED_VERSION'); });
test('加密目录阻止解析；加密文件阻止提取', () => {
  const b = binary('f.txt', Buffer.from('abc')); b.writeUInt32LE(0xffffff9, 12); assert.throws(() => readRpfBuffer(b), (e: unknown) => e instanceof RpfError && e.code === 'ENCRYPTED_ARCHIVE');
  b.writeUInt32LE(0x4e45504f, 12); b.writeUInt32LE(1, 44); assert.throws(() => readRpfBuffer(b).extractBinary(1), /已加密/);
});
test('路径穿越、设备名和 Windows 路径拒绝', () => { for (const name of ['..', '../a', 'C:a', 'con.txt', 'abc.']) assert.throws(() => readRpfBuffer(binary(name, Buffer.from('a'))), /不安全/); });
test('目录循环、越界名称、数据和根节点拒绝', () => {
  const b = binary('f.txt', Buffer.from('abc'));
  const cycle = Buffer.from(b); cycle.writeUInt32LE(0, 24); assert.throws(() => readRpfBuffer(cycle), /循环/);
  const name = Buffer.from(b); name.writeUInt16LE(255, 32); assert.throws(() => readRpfBuffer(name), /索引越界/);
  const range = Buffer.from(b); range.writeUIntLE(255, 37, 3); assert.throws(() => readRpfBuffer(range), /数据范围无效/);
  assert.throws(() => readRpfBuffer(b.subarray(0, 47)), /越界/);
});
test('恶意重复目录引用在分配前拒绝', () => {
  const b = binary('folder', Buffer.from('abc')); b.writeUInt32LE(0x7fffff00, 36); b.writeUInt32LE(0, 40); b.writeUInt32LE(2, 44);
  assert.throws(() => readRpfBuffer(b), /引用数量异常/);
});
test('解压大小超限、宣称大小不一致和损坏压缩拒绝', () => {
  const b = binary('x.txt', Buffer.alloc(4096), true); assert.throws(() => readRpfBuffer(b, 'x.rpf', { maxExpandedBytes: 512 }).extractBinary(1), /安全限制/);
  b.writeUInt32LE(4000, 40); assert.throws(() => readRpfBuffer(b).extractBinary(1), /不一致/);
  b.fill(0xff, 512); assert.throws(() => readRpfBuffer(b).extractBinary(1), /解压失败/);
});
test('资源条目版本及独立 RSC7 提取', () => {
  const data = resource(), b = binary('car.yft', data); b.writeUIntLE(data.length, 34, 3); b.writeUIntLE(0x800001, 37, 3); b.writeUInt32LE(data.readUInt32LE(8), 40); b.writeUInt32LE(data.readUInt32LE(12), 44);
  const r = readRpfBuffer(b); assert.equal(r.list()[1].resourceVersion, 162); assert.equal(r.list()[1].expandedSize, 512); assert.deepEqual(r.extractResource(1), data);
});
test('二进制替换生成独立 RPF 副本、回读校验和原档案保护', () => {
  const input = binary('dlclist.xml', Buffer.from('<paths/>')), before = Buffer.from(input), r = readRpfBuffer(input), updated = Buffer.from('<paths><Item>dlcpacks:/car/</Item></paths>');
  const output = r.replaceBinaryEntries(new Map([[1, updated]]));
  assert.deepEqual(input, before); assert.equal(r.extractBinary(1).toString(), '<paths/>'); assert.deepEqual(readRpfBuffer(output).extractBinary(1), updated);
  assert.throws(() => r.replaceBinaryEntries(new Map([[0, updated]])), /类型无效/);
  assert.throws(() => r.replaceBinaryEntries(new Map([[1, Buffer.alloc(0)]])), /为空/);
});
test('重建嵌套 RPF 时仍保存未压缩 RPF 载荷', () => {
  const input = readRpfBuffer(binary('inner.rpf', binary('x.xml', Buffer.from('<old/>'))));
  const nested = input.extractBinary(1), replacement = readRpfBuffer(nested).replaceBinaryEntries(new Map([[1, Buffer.from('<new/>')]]));
  const output = input.replaceBinaryEntries(new Map([[1, replacement]]));
  assert.equal(readRpfBuffer(readRpfBuffer(output).extractBinary(1)).extractBinary(1).toString(), '<new/>');
});
test('真实资源头区分 Legacy、Enhanced 和未知版本，不宣称游戏测试', () => {
  assert.equal(inspectResourceHeader(resource(162), 'car.yft').edition, 'legacy-header');
  const enhanced = inspectResourceHeader(resource(171), 'car.yft'); assert.equal(enhanced.edition, 'enhanced-header'); assert.equal(enhanced.inGameTested, false);
  assert.equal(inspectResourceHeader(resource(2), 'car.yft').edition, 'unknown');
  assert.equal(inspectResourceHeader(Buffer.from('not a model'), 'car.yft').headerValid, false);
});
test('三个检测模式实际执行不同检查，转换未接入时拒绝且保留原文件', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gems-resource-'));
  try {
    const filename = path.join(dir, 'car.yft'); await writeFile(filename, resource());
    const quick = await analyzeResourceFile(filename, 'quick'), standard = await analyzeResourceFile(filename, 'standard'), deep = await analyzeResourceFile(filename, 'deep');
    assert.equal(quick.sha256, undefined); assert.equal(quick.envelopeValid, null); assert.equal(standard.envelopeValid, true); assert.ok(standard.sha256); assert.equal(deep.envelopeValid, true); assert.ok(deep.issues.some(i => i.includes('页面')));
    await assert.rejects(convertResources([filename], path.join(dir, 'out')), /尚未集成/);
    const mismatch = resource(); mismatch.writeUInt32LE(0xa0000000, 8); await writeFile(filename, mismatch); assert.equal((await analyzeResourceFile(filename, 'deep')).envelopeValid, false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
