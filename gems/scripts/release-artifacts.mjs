import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {authenticode} from './authenticode.mjs';
import {signingProblems} from './signing-policy.mjs';

export function isCodeArtifact(file) { return typeof file === 'string' && /\.(exe|dll|asi)$/iu.test(file); }
export function releaseSignatureTargets(version) {
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/iu.test(version)) throw new Error('发行版本标识无效。');
  return [
    {file:'win-unpacked/GEMS.exe',minimumBytes:1024**2},
    {file:`GEMS-${version}-x64-setup.exe`,minimumBytes:1024**2},
    {file:`GEMS-${version}-x64-portable.exe`,minimumBytes:1024**2},
    {file:'../native/game-assistant/artifacts/GEMS.GameAssistant.dll',minimumBytes:16*1024}
  ];
}
function regularPath(file) {
  const absolute=path.resolve(file),root=path.parse(absolute).root;let cursor=root;
  for (const segment of absolute.slice(root.length).split(path.sep)) {
    cursor=path.join(cursor,segment);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new Error('发行文件路径包含符号链接或目录连接，已停止生成证据。');
  }
  const stat=fs.lstatSync(absolute,{bigint:true});
  if (!stat.isFile() || stat.nlink !== 1n) throw new Error('发行文件不是独立普通文件，已停止生成证据。');
  return stat;
}
function fingerprint(stat) { return [stat.dev,stat.ino,stat.size,stat.mtimeNs,stat.ctimeNs,stat.nlink].join(':'); }

/** Hash and inspect the same observed file. This detects changes; it is not an OS lock. */
export async function readReleaseArtifact(file,{minimumBytes=0,publisher,requireSigned=false}={}) {
  const before=regularPath(file),code=isCodeArtifact(file);
  if (before.size < BigInt(minimumBytes) || before.size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`缺少完整发行文件：${path.basename(file)}。`);
  if (requireSigned && (!code || !publisher?.trim())) throw new Error('签名检查需要受支持的程序类型与明确发布者。');
  const fd=fs.openSync(file,'r');
  try {
    if (fingerprint(fs.fstatSync(fd,{bigint:true})) !== fingerprint(before)) throw new Error('打开发行文件时路径发生变化，已停止生成证据。');
    const buffer=Buffer.alloc(1024**2);
    const readHash=()=>{
      const hash=crypto.createHash('sha256');let bytes=0;
      while (bytes < Number(before.size)) {
        const count=fs.readSync(fd,buffer,0,Math.min(buffer.length,Number(before.size)-bytes),bytes);
        if (!count) throw new Error('读取发行文件不完整，已停止生成证据。');
        hash.update(buffer.subarray(0,count));bytes+=count;
      }
      return {bytes,sha256:hash.digest('hex')};
    };
    const initial=readHash(),bytes=initial.bytes;
    const check=()=>{
      if (bytes !== Number(before.size) || fingerprint(fs.fstatSync(fd,{bigint:true})) !== fingerprint(before)
        || fingerprint(regularPath(file)) !== fingerprint(before)) throw new Error('读取或核对签名期间发行文件发生变化，已停止生成证据。');
    };
    check();
    const signature=code && process.platform === 'win32' ? authenticode(file) : undefined;
    const confirmed=readHash();
    check();
    if (confirmed.sha256 !== initial.sha256) throw new Error('读取或核对签名期间发行文件内容发生变化，已停止生成证据。');
    const problems=code ? !signature ? ['未执行 Windows Authenticode 检查']
      : !publisher?.trim() ? ['未配置发布者身份，未进行完整签名策略验收'] : signingProblems(signature,publisher.trim()) : [];
    if (requireSigned && problems.length) throw new Error(`${path.basename(file)}：${problems.join('；')}。`);
    return {bytes,sha256:initial.sha256,...(code ? {authenticode:signature?.status || 'not-checked',signature:signature || null,
      signingPolicy:{publisherConfigured:!!publisher?.trim(),passed:!!publisher?.trim() && problems.length === 0,problems}} : {})};
  } finally { fs.closeSync(fd); }
}

/** A Valid OS status alone is not proof of the expected publisher or timestamp. */
export function codeSigningSummary(artifacts,publisher) {
  const code=artifacts.filter(artifact=>isCodeArtifact(artifact.file));
  if (!code.length) return 'no-code-artifact-delivered';
  if (code.some(artifact=>!artifact.signature || artifact.authenticode==='not-checked' || artifact.authenticode!==artifact.signature.status)) return 'incomplete-signature-check';
  if (publisher?.trim() && code.every(artifact=>signingProblems(artifact.signature,publisher.trim()).length === 0)) return 'verified-authenticode';
  if (code.every(artifact=>artifact.signature.status==='Valid')) return 'authenticode-valid-publisher-unverified';
  if (code.every(artifact=>artifact.signature.status==='NotSigned')) return 'unsigned-development';
  return 'see-artifact-signatures';
}
