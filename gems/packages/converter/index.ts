import { open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

export type ConversionMode = 'quick' | 'standard' | 'deep';
export type ResourceEdition = 'legacy-header' | 'enhanced-header' | 'unknown';
export interface ResourceAnalysis {
  filename: string; kind: string; version?: number; edition: ResourceEdition;
  mode: ConversionMode; headerValid: boolean; envelopeValid: boolean | null;
  sha256?: string; expandedBytes?: number; issues: string[];
  staticValidation: 'not-validated' | 'envelope-only';
  converted: false; gameLoaded: false; inGameTested: false;
}
const HEADER_VERSIONS: Record<string, { legacy: number; enhanced: number }> = {
  '.yft': { legacy: 162, enhanced: 171 }, '.ytd': { legacy: 13, enhanced: 5 },
  '.ydr': { legacy: 165, enhanced: 159 }, '.ydd': { legacy: 165, enhanced: 159 },
};
/** Classification only: a matching header is never proof that the model is usable. */
export function inspectResourceHeader(data: Buffer, filename: string): ResourceAnalysis {
  const kind = path.extname(filename).toLowerCase();
  const result: ResourceAnalysis = { filename: path.basename(filename), kind, edition: 'unknown', mode: 'quick', headerValid: false, envelopeValid: null, issues: [], staticValidation: 'not-validated', converted: false, gameLoaded: false, inGameTested: false };
  if (data.length < 16) { result.issues.push('资源头不足 16 字节。'); return result; }
  if (data.readUInt32LE(0) !== 0x37435352) { result.issues.push('不是已支持的 RSC7 资源封装，不能确认游戏版本。'); return result; }
  result.version = data.readUInt32LE(4);
  const flagsVersion = ((data.readUInt32LE(8) >>> 28) << 4) | (data.readUInt32LE(12) >>> 28);
  if (flagsVersion !== result.version) { result.issues.push('资源版本与系统/图形标志中的版本不一致。'); return result; }
  result.headerValid = true;
  const expected = HEADER_VERSIONS[kind];
  if (expected && result.version === expected.legacy) result.edition = 'legacy-header';
  else if (expected && result.version === expected.enhanced) result.edition = 'enhanced-header';
  else result.issues.push('资源版本不在已核对的版本表内，兼容性未知。');
  result.issues.push('仅识别资源头版本；模型、材质、骨骼、引用及游戏加载尚未验证。');
  return result;
}

export async function analyzeResourceFile(filename: string, mode: ConversionMode = 'standard', maxBytes = 128 * 1024 * 1024): Promise<ResourceAnalysis> {
  if (!['quick', 'standard', 'deep'].includes(mode)) throw new Error('未知转换检测模式。');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 16) throw new Error('资源大小限制无效。');
  const handle = await open(filename, 'r');
  let data: Buffer;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) throw new Error('资源不是普通文件或超过安全大小限制。');
    data = Buffer.alloc(mode === 'quick' ? Math.min(info.size, 16) : info.size);
    let position = 0;
    while (position < data.length) { const read = await handle.read(data, position, data.length - position, position); if (!read.bytesRead) throw new Error('资源在读取过程中被修改，请重新分析。'); position += read.bytesRead; }
    const after = await handle.stat(); if (after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw new Error('资源在读取过程中被修改，请重新分析。');
  } finally { await handle.close(); }
  const result = inspectResourceHeader(data, filename); result.mode = mode;
  if (mode === 'quick' || !result.headerValid) return result;
  result.sha256 = createHash('sha256').update(data).digest('hex');
  try {
    const expanded = inflateRawSync(data.subarray(16), { maxOutputLength: maxBytes });
    result.expandedBytes = expanded.length; result.envelopeValid = expanded.length > 0;
    if (!expanded.length) result.issues.push('资源压缩载荷为空。');
    else result.staticValidation = 'envelope-only';
    if (mode === 'deep') {
      // An independently useful stricter check, without inventing resource graph support.
      const flags = [data.readUInt32LE(8), data.readUInt32LE(12)];
      const pageBytes = flags.reduce((total, value) => total + pageSize(value), 0);
      if (expanded.length !== pageBytes) { result.envelopeValid = false; result.staticValidation = 'not-validated'; result.issues.push(`解压载荷大小 ${expanded.length} 与资源页面标志大小 ${pageBytes} 不一致。`); }
      result.issues.push('深度检测已核对资源页面大小；资源指针图、纹理引用和模型结构分析尚未接入。');
    }
  } catch { result.envelopeValid = false; result.issues.push('资源载荷解压失败或超过安全大小限制。'); }
  return result;
}
function pageSize(flags: number): number {
  return 512 * 2 ** (flags & 15) * (((flags >>> 27) & 1) + ((flags >>> 26) & 1) * 2 + ((flags >>> 25) & 1) * 4 + ((flags >>> 24) & 1) * 8 + ((flags >>> 17) & 127) * 16 + ((flags >>> 11) & 63) * 32 + ((flags >>> 7) & 15) * 64 + ((flags >>> 5) & 3) * 128 + ((flags >>> 4) & 1) * 256);
}

export interface ConversionBackend { id: string; version: string; sourceUrl: string; license: string; supportedKinds: string[]; outputEdition: 'enhanced'; verified: boolean; convert(input: string, independentOutput: string): Promise<void> }
export const converterCapabilities = {
  headerDetection: true, envelopeValidation: true, pageSizeValidation: true,
  conversion: false, resourceGraphValidation: false, repackRpf: false, gameVerification: false,
  reason: '尚未集成具有明确分发许可且通过真实资源测试的转换后端。CodeWalker 官方源码注明仅教育用途，当前工程不分发或调用其转换器。',
} as const;
/** Fail closed. Backend registration will require provenance, license review and real-resource fixtures. */
export async function convertResources(_inputs: string[], _independentOutput: string, _mode: ConversionMode = 'standard'): Promise<never> {
  throw new Error(converterCapabilities.reason);
}
