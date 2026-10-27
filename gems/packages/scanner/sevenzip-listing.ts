import {relativeSafe, MAX_FILES, MAX_BYTES} from '../core/security';
export interface SevenZipEntry {path: string; selector: string; directory: boolean; size: number; crc: number | null;}
export const SEVENZIP_LIST_BYTES = 8 * 1024 ** 2;
const fields = new Set(['Path','Folder','Size','Packed Size','Modified','Created','Accessed','Attributes','CRC','Encrypted','Method','Block','Alternate Stream','Solid','Split Before','Split After','Host OS','Characteristics','Symbolic Link','Hard Link','Copy Link','Volume Index','Checksum','NT Security','Anti','Comment','Version']);
/** Strict technical-list parser; a second exact-entry listing also verifies selection before extraction. */
export function parseSevenZipListing(text: string, sourceBytes: number): SevenZipEntry[] {
  if (Buffer.byteLength(text) > SEVENZIP_LIST_BYTES || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(text)) throw new Error('归档目录输出过大或含不可识别控制字符');
  const result: SevenZipEntry[] = [], names = new Map<string, boolean>(); let total = 0;
  for (const block of text.replaceAll('\r\n', '\n').replace(/^\n+|\n+$/gu, '').split(/\n\n+/u).filter(Boolean)) {
    const values = new Map<string, string>();
    for (const line of block.split('\n')) {
      const match = /^([A-Za-z][A-Za-z0-9 ]*) = (.*)$/u.exec(line);
      if (!match || !fields.has(match[1]) || values.has(match[1])) throw new Error('归档目录字段含歧义、重复或未支持信息');
      values.set(match[1], match[2]);
    }
    const raw = values.get('Path'); if (!raw) throw new Error('归档条目缺少路径');
    const relative = relativeSafe(raw);
    const attributes = values.get('Attributes') || '';
    const mode = /^([DRAHSCIONT_ ]+?)(?: ([d-][rwxstST-]{9}))?$/u.exec(attributes);
    if (!mode) throw new Error('归档条目类型或链接属性无法安全确认');
    const directory = mode[1].includes('D') || mode[2]?.startsWith('d') === true;
    if (values.has('Folder') && values.get('Folder') !== (directory ? '+' : '-')) throw new Error('归档目录属性不一致');
    if (relative.length > 4096 || relative.split('/').length - (directory ? 0 : 1) > 64) throw new Error('归档路径长度或目录嵌套超过安全限制');
    if (values.get('Encrypted') !== '-' || ['Symbolic Link','Hard Link','Copy Link','NT Security','Volume Index','Comment'].some(name => !!values.get(name))
      || ['Alternate Stream','Split Before','Split After','Anti'].some(name => values.has(name) && !['','-'].includes(values.get(name)!))) throw new Error('不支持加密、链接、分卷、备用数据流或特殊归档条目');
    const method = values.get('Method') || '';
    for (const match of method.matchAll(/:(\d+)([kKmMgG])(?:\b|$)/gu)) {
      const dictionary = Number(match[1]) * 1024 ** ({k:1,m:2,g:3}[match[2].toLowerCase()]!);
      if (!Number.isSafeInteger(dictionary) || dictionary > 512 * 1024 ** 2) throw new Error('归档声明字典超过 512 MiB 解码预算');
    }
    for (const match of method.matchAll(/(?:LZMA2?|m[0-5]):(\d+)(?=$|[ :])/gu)) if (Number(match[1]) > 29) throw new Error('归档声明字典超过 512 MiB 解码预算');
    const sizeText = values.get('Size') || ''; const size = Number(sizeText);
    if (!/^\d+$/u.test(sizeText) || !Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES || directory && size !== 0) throw new Error('归档条目尺寸声明无效或超过安全限制');
    total += size;
    if (result.length >= MAX_FILES || !Number.isSafeInteger(total) || total > MAX_BYTES || total > 1024 ** 2 && total / Math.max(1, sourceBytes) > 300) throw new Error('归档超过文件数量、容量或异常压缩比例限制');
    // 7Z omits the CRC field value for a zero-byte regular stream; its CRC is zero.
    const crcText = values.get('CRC') || (!directory && size === 0 ? '00000000' : '');
    if ((!directory && !/^[0-9a-fA-F]{8}$/u.test(crcText)) || directory && crcText && crcText !== '00000000') throw new Error('归档条目缺少可核验的 CRC');
    const normalized = relative.toLowerCase(); if (names.has(normalized)) throw new Error('归档包含重复或大小写冲突路径'); names.set(normalized, directory);
    result.push({path: relative, selector: raw, directory, size, crc: directory ? null : parseInt(crcText, 16)});
  }
  for (const entry of result) {
    const parts = entry.path.toLowerCase().split('/'); parts.pop();
    while (parts.length) {if (names.get(parts.join('/')) === false) throw new Error('归档文件与目录路径冲突'); parts.pop();}
  }
  return result;
}
