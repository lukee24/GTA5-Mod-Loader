import { deflateRawSync, inflateRawSync } from 'node:zlib';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {RpfError,fail} from './errors';
import {captureRpfLimits,DEFAULT_RPF_LIMITS,type RpfLimits} from './limits';
import {readRpfSnapshot} from './file-snapshot';
export {RpfError,DEFAULT_RPF_LIMITS};
export type {RpfLimits};

export interface RpfEntry { id: number; name: string; path: string; type: 'directory' | 'binary' | 'resource'; offset: number; storedSize: number; expandedSize?: number; encrypted: boolean; systemFlags?: number; graphicsFlags?: number; resourceVersion?: number; children?: number[] }
function safeName(name: string, root = false): void {
  if (root && name === '') return;
  if (!name || name === '.' || name === '..' || /[\\/:<>"|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) fail('UNSAFE_NAME', 'RPF 包含不安全的文件名，已阻止读取。');
}
function flagsSize(flags: number): number {
  const base = 8192 * 2 ** (flags & 15);
  return base * (((flags >>> 17) & 127) + ((flags >>> 11) & 63) * 2 + ((flags >>> 7) & 15) * 4 + ((flags >>> 5) & 3) * 8 + ((flags >>> 4) & 1) * 16 + ((flags >>> 24) & 1) / 2 + ((flags >>> 25) & 1) / 4 + ((flags >>> 26) & 1) / 8 + ((flags >>> 27) & 1) / 16);
}

/** Independent bounded reader. No cryptographic keys, writes, external programs or OpenIV dependency. */
export class RpfArchive {
  readonly entries: ReadonlyArray<Readonly<RpfEntry>>;
  readonly encryption = 'none';
  private constructor(private readonly bytes: Buffer, entries: RpfEntry[], readonly limits: Readonly<RpfLimits>, readonly sourceName: string) { this.entries = Object.freeze(entries.map(e => Object.freeze({ ...e, children: e.children ? Object.freeze([...e.children]) as unknown as number[] : undefined }))); Object.freeze(this); }
  static parse(bytes: Buffer, sourceName = 'archive.rpf', options: Partial<RpfLimits> = {}): RpfArchive {
    const limits = captureRpfLimits(options);
    if (bytes.length < 16) fail('TRUNCATED', 'RPF 文件头不完整。');
    if (bytes.length > limits.maxArchiveBytes) fail('ARCHIVE_LIMIT', 'RPF 超过当前只读后端的大小限制。');
    if (bytes.readUInt32LE(0) !== 0x52504637) fail('UNSUPPORTED_VERSION', '仅支持 RPF7，文件魔数不匹配。');
    const count = bytes.readUInt32LE(4), namesLength = bytes.readUInt32LE(8), encryption = bytes.readUInt32LE(12);
    if (encryption !== 0x4e45504f) fail('ENCRYPTED_ARCHIVE', `RPF 目录已加密或标记未知（0x${encryption.toString(16)}）；当前后端不提供解密。`);
    if (!count || count > limits.maxEntries || !namesLength || namesLength > limits.maxNamesBytes) fail('TABLE_LIMIT', 'RPF 目录或名称表超过安全限制。');
    const tableEnd = 16 + count * 16 + namesLength;
    if (tableEnd > bytes.length) fail('TRUNCATED', 'RPF 目录或名称表越界。');
    const names = bytes.subarray(16 + count * 16, tableEnd);
    const entries: RpfEntry[] = [];
    let childReferences = 0;
    for (let id = 0; id < count; id++) {
      const at = 16 + id * 16, marker = bytes.readUInt32LE(at + 4), directory = marker === 0x7fffff00;
      const nameOffset = directory ? bytes.readUInt32LE(at) : bytes.readUInt16LE(at);
      if (nameOffset >= names.length) fail('BAD_NAME_OFFSET', 'RPF 文件名索引越界。');
      const end = names.indexOf(0, nameOffset);
      if (end < 0 || end - nameOffset > 255) fail('BAD_NAME', 'RPF 文件名未终止或过长。');
      const rawName = names.subarray(nameOffset, end);
      if (rawName.some(b => b > 127)) fail('NAME_ENCODING', '当前 RPF 后端仅支持 ASCII 资源文件名。');
      const name = rawName.toString('ascii'); safeName(name, id === 0);
      if (directory) {
        const start = bytes.readUInt32LE(at + 8), length = bytes.readUInt32LE(at + 12);
        if (start > count || start + length > count) fail('BAD_CHILD_RANGE', 'RPF 子目录索引越界。');
        childReferences += length;
        if (childReferences > count - 1) fail('REFERENCE_LIMIT', 'RPF 目录引用数量异常，已阻止重复分配。');
        entries.push({ id, name, path: '', type: 'directory', offset: 0, storedSize: 0, encrypted: false, children: Array.from({ length }, (_, n) => start + n) });
      } else {
        const resource = (marker & 0x80000000) !== 0;
        let storedSize = bytes.readUIntLE(at + 2, 3);
        const offset = (bytes.readUIntLE(at + 5, 3) & 0x7fffff) * 512;
        const field1 = bytes.readUInt32LE(at + 8), field2 = bytes.readUInt32LE(at + 12);
        if (!resource && field2 > 1) fail('BAD_ENCRYPTION', 'RPF 文件加密标记无效。');
        if (resource && storedSize === 0xffffff) fail('EXTENDED_RESOURCE', '超大资源扩展头尚未验证，已阻止提取。');
        if (!resource && storedSize === 0) storedSize = field1;
        if (offset < tableEnd || storedSize <= 0 || offset + storedSize > bytes.length) fail('BAD_FILE_RANGE', 'RPF 资源数据范围无效。');
        const expandedSize = resource ? flagsSize(field1) + flagsSize(field2) : field1;
        entries.push({ id, name, path: '', type: resource ? 'resource' : 'binary', offset, storedSize, expandedSize, encrypted: !resource && field2 === 1, ...(resource ? { systemFlags: field1, graphicsFlags: field2, resourceVersion: ((field1 >>> 28) << 4) | (field2 >>> 28) } : {}) });
      }
    }
    if (entries[0].type !== 'directory') fail('BAD_ROOT', 'RPF 根节点不是目录。');
    const visited = new Set<number>();
    const walk = (id: number, parent: string, depth: number) => {
      if (depth > limits.maxDepth) fail('DEPTH_LIMIT', 'RPF 目录嵌套层数超限。');
      if (visited.has(id)) fail('DIRECTORY_CYCLE', 'RPF 包含循环或重复引用。');
      visited.add(id); const e = entries[id]; e.path = id === 0 ? '' : [parent, e.name].filter(Boolean).join('/');
      const siblings = new Set<string>();
      for (const childId of e.children ?? []) { const key = entries[childId].name.toLowerCase(); if (siblings.has(key)) fail('DUPLICATE_PATH', 'RPF 包含大小写重复路径。'); siblings.add(key); walk(childId, e.path, depth + 1); }
    };
    walk(0, '', 0);
    if (visited.size !== count) fail('ORPHAN_ENTRY', 'RPF 包含未被目录引用的条目。');
    const extents = entries.filter(e => e.type !== 'directory').sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < extents.length; i++) if (extents[i].offset < extents[i - 1].offset + extents[i - 1].storedSize) fail('OVERLAPPING_DATA', 'RPF 文件数据范围重叠。');
    return new RpfArchive(Buffer.from(bytes), entries, limits, sourceName);
  }
  list(): ReadonlyArray<Readonly<RpfEntry>> { return this.entries; }
  private get(id: number, expected: RpfEntry['type']): Readonly<RpfEntry> { if(!Number.isSafeInteger(id)||id<0)fail('ENTRY_TYPE','RPF 文件条目标识或类型无效。'); const e = this.entries[id]; if (!e || e.type !== expected) fail('ENTRY_TYPE', 'RPF 文件条目或类型无效。'); if (e.encrypted) fail('ENCRYPTED_FILE', '此文件已加密，当前后端不提供解密。'); if ((e.expandedSize ?? 0) > this.limits.maxExpandedBytes) fail('EXPANSION_LIMIT', '资源解压大小超过安全限制。'); return e; }
  extractBinary(id: number): Buffer {
    const e = this.get(id, 'binary'), raw = this.bytes.subarray(e.offset, e.offset + e.storedSize);
    if (e.storedSize === e.expandedSize && this.bytes.readUIntLE(16 + id * 16 + 2, 3) === 0) return Buffer.from(raw);
    let result: Buffer;
    try { result = inflateRawSync(raw, { maxOutputLength: Math.min(this.limits.maxExpandedBytes,Math.max(1,e.expandedSize!)) }); } catch { return fail('DECOMPRESSION_FAILED', 'RPF 文件解压失败、大小与目录记录不一致或超过安全限制。'); }
    if (result.length !== e.expandedSize) fail('SIZE_MISMATCH', 'RPF 文件解压后的大小与目录记录不一致。');
    return result;
  }
  /** Returns a standalone RSC7 envelope, not a decoded game model. */
  extractResource(id: number): Buffer {
    const e = this.get(id, 'resource');
    if (e.storedSize < 17) fail('TRUNCATED_RESOURCE', 'RPF 资源头或压缩数据不完整。');
    const raw = this.bytes.subarray(e.offset, e.offset + e.storedSize);
    if (raw.readUInt32LE(0) !== 0x37435352) fail('UNSUPPORTED_RESOURCE_HEADER', '资源头不是已验证的 RSC7 封装。');
    if (raw.readUInt32LE(4) !== e.resourceVersion || raw.readUInt32LE(8) !== e.systemFlags || raw.readUInt32LE(12) !== e.graphicsFlags) fail('RESOURCE_HEADER_MISMATCH', '资源头与 RPF 目录中的版本或页面标志不一致，已阻止提取。');
    let expanded:Buffer;
    try{expanded=inflateRawSync(raw.subarray(16),{maxOutputLength:Math.min(this.limits.maxExpandedBytes,Math.max(1,e.expandedSize!))});}
    catch{return fail('RESOURCE_DECOMPRESSION_FAILED','资源载荷解压失败、大小与页面标志不一致或超过安全限制，已阻止提取。');}
    if(!expanded.length||expanded.length!==e.expandedSize)fail('RESOURCE_SIZE_MISMATCH','资源载荷大小与页面标志不一致或为空，已阻止提取。');
    const header = Buffer.alloc(16); header.writeUInt32LE(0x37435352); header.writeUInt32LE(e.resourceVersion!, 4); header.writeUInt32LE(e.systemFlags!, 8); header.writeUInt32LE(e.graphicsFlags!, 12);
    return Buffer.concat([header, raw.subarray(16)]);
  }
  /** Rebuilds an independent unencrypted archive in memory. The caller must use its own backup transaction. */
  replaceBinaryEntries(changes: ReadonlyMap<number, Buffer>): Buffer {
    if (!changes.size) fail('EMPTY_CHANGE', '没有需要替换的 RPF 文件。');
    const replacements=new Map<number,Buffer>();
    for (const [id, data] of changes) {
      this.get(id, 'binary');
      if (!Buffer.isBuffer(data) || !data.length || data.length > this.limits.maxExpandedBytes) fail('REPLACEMENT_LIMIT', '替换文件为空或超过安全大小限制。');
      replacements.set(id,data);
    }
    if (this.entries.some(e => e.encrypted)) fail('ENCRYPTED_FILE', '档案包含加密文件，当前后端禁止重建。');
    let expandedTotal=0;
    for(const e of this.entries)if(e.type!=='directory'){
      expandedTotal+=replacements.get(e.id)?.length??e.expandedSize??0;
      if(!Number.isSafeInteger(expandedTotal)||expandedTotal>this.limits.maxExpandedBytes)fail('REBUILD_EXPANSION_LIMIT','RPF 完整重建核验的合计展开大小超过安全限制，未生成修改副本。');
    }
    // Own replacement bytes after whole-budget admission. Do not retain full
    // expanded copies of unchanged entries: their actual SHA is sufficient.
    for(const [id,data]of replacements)replacements.set(id,Buffer.from(data));
    const payloadHashes=new Map<number,string>(),digest=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
    const names: Buffer[] = [], nameOffsets: number[] = [];
    let nameBytes = 0;
    for (const e of this.entries) { nameOffsets.push(nameBytes); const name = Buffer.from(e.name + '\0', 'ascii'); names.push(name); nameBytes += name.length; }
    if (nameBytes > 0xffff || nameBytes > this.limits.maxNamesBytes) fail('NAME_TABLE_LIMIT', '重建后的 RPF 名称表超过当前写入支持范围。');
    const namesTable = Buffer.concat(names), tableSize = 16 + this.entries.length * 16 + namesTable.length;
    const blocks: { entry: Readonly<RpfEntry>; payload: Buffer; offset: number; expandedSize?: number; compressed: boolean }[] = [];
    let outputLength = Math.ceil(tableSize / 512) * 512;
    for (const e of this.entries) {
      if (e.type === 'directory') continue;
      const changed = replacements.get(e.id);
      let payload: Buffer, compressed: boolean, expandedSize = e.expandedSize;
      if (changed) {
        payloadHashes.set(e.id,digest(changed));
        expandedSize = changed.length;
        compressed = path.extname(e.name).toLowerCase() !== '.rpf';
        payload = compressed ? deflateRawSync(changed) : Buffer.from(changed);
      } else {
        // Every preserved payload must be readable, including compressed binaries.
        payloadHashes.set(e.id,digest(e.type==='resource'?this.extractResource(e.id):this.extractBinary(e.id)));
        payload = Buffer.from(this.bytes.subarray(e.offset, e.offset + e.storedSize));
        compressed = this.bytes.readUIntLE(16 + e.id * 16 + 2, 3) !== 0;
      }
      if (payload.length >= 0xffffff) fail('WRITE_SIZE_LIMIT', '单个文件超过已验证的 RPF 写入大小范围。');
      blocks.push({ entry: e, payload, offset: outputLength, expandedSize, compressed });
      outputLength = Math.ceil((outputLength + payload.length) / 512) * 512;
      if (outputLength > this.limits.maxArchiveBytes) fail('ARCHIVE_LIMIT', '重建后的 RPF 超过安全大小限制。');
    }
    const output = Buffer.alloc(outputLength);
    output.writeUInt32LE(0x52504637); output.writeUInt32LE(this.entries.length, 4); output.writeUInt32LE(namesTable.length, 8); output.writeUInt32LE(0x4e45504f, 12);
    namesTable.copy(output, 16 + this.entries.length * 16);
    for (const e of this.entries) {
      const at = 16 + e.id * 16;
      if (e.type === 'directory') { output.writeUInt32LE(nameOffsets[e.id], at); output.writeUInt32LE(0x7fffff00, at + 4); output.writeUInt32LE(e.children?.[0] ?? this.bytes.readUInt32LE(at + 8), at + 8); output.writeUInt32LE(e.children?.length ?? 0, at + 12); }
    }
    for (const block of blocks) {
      const { entry: e, payload, offset } = block, at = 16 + e.id * 16;
      output.writeUInt16LE(nameOffsets[e.id], at); output.writeUIntLE(e.type === 'resource' || block.compressed ? payload.length : 0, at + 2, 3);
      output.writeUIntLE(offset / 512 + (e.type === 'resource' ? 0x800000 : 0), at + 5, 3);
      output.writeUInt32LE(e.type === 'resource' ? e.systemFlags! : block.expandedSize!, at + 8); output.writeUInt32LE(e.type === 'resource' ? e.graphicsFlags! : 0, at + 12);
      payload.copy(output, offset);
    }
    const verified = RpfArchive.parse(output, this.sourceName, this.limits);
    for(const e of verified.entries)if(e.type!=='directory'){
      const actual=e.type==='resource'?verified.extractResource(e.id):verified.extractBinary(e.id);
      if(digest(actual)!==payloadHashes.get(e.id))fail('WRITE_VERIFY_FAILED','重建 RPF 全部载荷回读校验失败，未生成可用修改。');
    }
    return output;
  }
  inspectNested(depth = 0, budget = { remaining: this.limits.maxExpandedBytes }): { path: string; entries?: ReadonlyArray<Readonly<RpfEntry>>; error?: string; code?: string }[] {
    const results: { path: string; entries?: ReadonlyArray<Readonly<RpfEntry>>; error?: string; code?: string }[] = [];
    for (const e of this.entries) if (e.type === 'binary' && path.extname(e.name).toLowerCase() === '.rpf') {
      try {
        if (depth >= this.limits.maxDepth) fail('DEPTH_LIMIT', '嵌套 RPF 层数超限。');
        if ((e.expandedSize ?? 0) > budget.remaining) fail('EXPANSION_LIMIT', '嵌套 RPF 总大小超过安全限制。');
        const data = this.extractBinary(e.id); budget.remaining -= data.length;
        const nested = RpfArchive.parse(data, e.path, this.limits);
        results.push({ path: e.path, entries: nested.list() });
        results.push(...nested.inspectNested(depth + 1, budget).map(r => ({ ...r, path: `${e.path}!/${r.path}` })));
      } catch (error) { results.push({ path: e.path, error: error instanceof Error ? error.message : '嵌套 RPF 分析失败。', code: error instanceof RpfError ? error.code : 'READ_FAILED' }); }
    }
    return results;
  }
}
export function readRpfBuffer(bytes: Buffer, sourceName?: string, options?: Partial<RpfLimits>): RpfArchive { return RpfArchive.parse(bytes, sourceName, options); }
export async function openRpf(filename: string, options: Partial<RpfLimits> = {}): Promise<RpfArchive> {
  const limits=captureRpfLimits(options),data=await readRpfSnapshot(filename,limits.maxArchiveBytes);
  return RpfArchive.parse(data,path.basename(filename),limits);
}
export const rpfCapabilities = { backend: 'GEMS RPF7 受限引擎', list: true, extractBinary: true, extractResourceEnvelope: true, nestedRead: true, replaceBinaryInIndependentCopy: true, writeGameFiles: false, writeResources: false, decrypt: false, modelPreview: false, verifiedInGame: false } as const;
