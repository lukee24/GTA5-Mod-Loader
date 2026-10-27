import fs from 'node:fs';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {crc32} from 'node:zlib';
import {inside, noLinks, MAX_BYTES} from '../core/security';
import {stableFile, verifiedSevenZipBackend, runSevenZip} from './sevenzip-backend';
import {parseSevenZipListing, SEVENZIP_LIST_BYTES} from './sevenzip-listing';

function formatOf(source: string) {
  const fd = fs.openSync(source, 'r'), signature = Buffer.alloc(8);
  try {fs.readSync(fd, signature, 0, 8, 0);} finally {fs.closeSync(fd);}
  if (/\.7z$/iu.test(source) && signature.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c]))) return '7z';
  if (/\.rar$/iu.test(source) && signature.equals(Buffer.from([0x52,0x61,0x72,0x21,0x1a,0x07,0x01,0x00]))) return 'rar5';
  if (/\.rar$/iu.test(source) && signature.subarray(0,7).equals(Buffer.from([0x52,0x61,0x72,0x21,0x1a,0x07,0x00]))) return 'rar';
  throw new Error('归档扩展名与 7Z / RAR 文件头不匹配或文件已损坏；不支持自解压程序');
}
function removeOwnedStage(stage: string, identity: fs.BigIntStats) {
  noLinks(path.parse(stage).root, stage); const current = fs.lstatSync(stage, {bigint: true});
  if (!current.isDirectory() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('解压缓存目录身份变化，已保留现场');
  function check(directory: string) {for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {const file = path.join(directory, entry.name); noLinks(stage, file); if (entry.isDirectory()) check(file);}}
  check(stage); fs.rmSync(stage, {recursive: true});
}

export async function extractSevenZip(source: string, destination: string): Promise<void> {
  source = path.resolve(source); destination = path.resolve(destination);
  const archive = stableFile(source); if (archive.bytes > MAX_BYTES) throw new Error('归档原文件超过容量限制');
  const format = formatOf(source), backend = await verifiedSevenZipBackend();
  const deadline = Date.now() + 10 * 60 * 1000;
  // RAR's handler rejects the 7Z-specific memory property. Its declared dictionary
  // is separately bounded by the listing parser before any file stream is decoded.
  const flags = ['-sccUTF-8','-spd','-ssc','-r-','-bd','-bsp0','-bse2','-mmt1',...(format === '7z' ? ['-mmemuse=512m'] : []), '-pGEMS_REJECT_ENCRYPTED_ARCHIVE', '-t' + format];
  const list = async (selector?: string) => {
    archive.assert();
    const bytes = await runSevenZip(backend, ['l','-slt','-ba',...flags,...(selector ? ['-i!' + selector] : []),'--',source], SEVENZIP_LIST_BYTES, Math.min(30000, deadline - Date.now()));
    archive.assert();
    let text: string; try {text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);} catch {throw new Error('归档目录不是有效 UTF-8，拒绝猜测文件名');}
    return parseSevenZipListing(text, archive.bytes);
  };
  const entries = await list(); if (!entries.length) throw new Error('归档没有可导入条目');
  noLinks(path.parse(destination).root, destination);
  const destinationIdentity = fs.lstatSync(destination, {bigint: true});
  if (!destinationIdentity.isDirectory() || fs.readdirSync(destination).length) throw new Error('归档目标必须是新的空隔离目录');
  const parent = path.dirname(destination), stage = path.join(parent, 'archive-stage-' + crypto.randomUUID());
  noLinks(parent, stage); fs.mkdirSync(stage); const identity = fs.lstatSync(stage, {bigint: true}); let published = false;
  try {
    for (const entry of entries) {
      archive.assert(); const target = inside(stage, entry.path); noLinks(stage, target);
      if (entry.directory) {fs.mkdirSync(target, {recursive: true}); continue;}
      // Exact re-listing rejects ambiguous technical output / absent zero-byte selectors.
      const selected = await list(entry.selector);
      if (selected.length !== 1 || !isDeepStrictEqual(selected[0], entry)) throw new Error('归档精确条目选择与原目录不一致');
      fs.mkdirSync(path.dirname(target), {recursive: true}); noLinks(stage, target);
      const fd = fs.openSync(target, 'wx'); let bytes = 0, crc = 0;
      try {
        await runSevenZip(backend, ['x','-so','-y','-bb0','-bso0',...flags,'-i!' + entry.selector,'--',source], entry.size, deadline - Date.now(), chunk => {
          let offset = 0; while (offset < chunk.length) {const written = fs.writeSync(fd, chunk, offset, chunk.length - offset); if (!written) throw new Error('隔离缓存写入不完整'); offset += written;}
          bytes += chunk.length; crc = crc32(chunk, crc);
        });
        if (bytes !== entry.size || crc !== entry.crc) throw new Error('归档条目长度或 CRC 校验失败');
      } finally {fs.closeSync(fd);}
      archive.assert();
    }
    archive.assert(); backend.assert(); noLinks(parent, destination); noLinks(parent, stage);
    const currentDestination = fs.lstatSync(destination, {bigint: true}), currentStage = fs.lstatSync(stage, {bigint: true});
    if (currentDestination.dev !== destinationIdentity.dev || currentDestination.ino !== destinationIdentity.ino || currentStage.dev !== identity.dev || currentStage.ino !== identity.ino) throw new Error('隔离缓存目录身份在解压期间变化，已保留现场');
    if (fs.readdirSync(destination).length) throw new Error('隔离目标在解压期间被修改');
    fs.rmdirSync(destination); fs.renameSync(stage, destination); published = true;
  } finally {if (!published && fs.existsSync(stage)) removeOwnedStage(stage, identity);}
}
