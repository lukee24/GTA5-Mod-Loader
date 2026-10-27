import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {inspectFileHash, noLinks} from '../core/security';

// Extracted from the official 26.05 x64 distribution whose published asset SHA256
// is fd99e86f57d8f429ef5ed045bf98315af962e2309b0f1ba87a147a44c71647d0.
// Hash matching identifies the reviewed bytes; it does not prove an archive is safe.
export const SEVENZIP_RELEASE = {
  version: '26.05', checked: '2026-10-27',
  source: 'https://github.com/ip7z/7zip/releases/expanded_assets/26.05',
  hashes: {'7z.exe': '94205cfc054dd3bbeb978905bc619a65b3f04e9e73bb2717841110b6f46d962e',
    '7z.dll': '78bf6b668d75801e3aa180b4ccb16e6d8395fba80dec8a065055bb6f8dfabb82'}
} as const;
export const fileStamp = (stat: fs.BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].join(':');
export function stableFile(file: string) {
  noLinks(path.parse(file).root, file);
  const before = fs.lstatSync(file, {bigint: true});
  if (!before.isFile() || before.nlink !== 1n) throw new Error('归档或后端必须是独立普通文件');
  return {bytes: Number(before.size), assert() {noLinks(path.parse(file).root, file); if (fileStamp(fs.lstatSync(file, {bigint: true})) !== fileStamp(before)) throw new Error('归档或后端文件在读取期间发生变化，已停止导入');}};
}
export async function verifiedSevenZipBackend() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('RAR / 7Z 当前仅验证 Windows x64 的 7-Zip 26.05 后端');
  const resources = (process as NodeJS.Process & {resourcesPath?: string}).resourcesPath;
  const configured = process.env.GEMS_7ZIP_DIRECTORY;
  const candidates = configured ? [configured] : [resources && path.join(resources, 'tools', '7zip-26.05'),
    process.env.ProgramW6432 && path.join(process.env.ProgramW6432, '7-Zip'), process.env.ProgramFiles && path.join(process.env.ProgramFiles, '7-Zip')].filter((value): value is string => !!value);
  const directory = candidates.find(value => path.isAbsolute(value) && fs.existsSync(path.join(value, '7z.exe')));
  if (!directory) throw new Error('缺少已验证的 7-Zip 26.05 x64 后端；请按归档后端说明安装或配置，不能使用 PATH 中的未知程序');
  const absolute = path.resolve(directory); noLinks(path.parse(absolute).root, absolute);
  const directoryStat = fs.lstatSync(absolute, {bigint: true});
  if (!directoryStat.isDirectory()) throw new Error('7-Zip 后端目录无效');
  const files: ReturnType<typeof stableFile>[] = [];
  for (const [name, hash] of Object.entries(SEVENZIP_RELEASE.hashes)) {
    const file = path.join(absolute, name), snapshot = stableFile(file);
    if ((await inspectFileHash(file)).hash !== hash) throw new Error('7-Zip 后端字节未通过本版本核验；仅接受已验证的 26.05 x64 EXE / DLL，其他版本需单独核验');
    snapshot.assert(); files.push(snapshot);
  }
  const assert = () => {
    noLinks(path.parse(absolute).root, absolute);
    const now = fs.lstatSync(absolute, {bigint: true});
    if (now.dev !== directoryStat.dev || now.ino !== directoryStat.ino || !now.isDirectory()) throw new Error('7-Zip 后端目录身份发生变化');
    for (const name of ['Codecs', 'Formats']) if (fs.existsSync(path.join(absolute, name))) throw new Error('不加载额外的 7-Zip Codecs / Formats 插件目录');
    files.forEach(file => file.assert());
  };
  assert(); return {directory: absolute, exe: path.join(absolute, '7z.exe'), assert};
}
export type SevenZipBackend = Awaited<ReturnType<typeof verifiedSevenZipBackend>>;

/** Fixed executable, argv only, closed stdin, bounded stdout/stderr and deadline. */
export async function runSevenZip(backend: SevenZipBackend, args: string[], maximum: number, timeout: number, consume?: (chunk: Buffer) => void): Promise<Buffer> {
  backend.assert();
  if (!Number.isSafeInteger(maximum) || maximum < 0 || timeout <= 0) throw new Error('归档读取预算无效或已耗尽');
  return new Promise((resolve, reject) => {
    const systemRoot = process.env.SystemRoot;
    const child = spawn(backend.exe, args, {cwd: backend.directory, shell: false, windowsHide: true,
      env: {...process.env, PATH: systemRoot ? path.join(systemRoot, 'System32') : ''}, stdio: ['ignore', 'pipe', 'pipe']});
    const chunks: Buffer[] = []; let bytes = 0, stderrBytes = 0, error: Error | undefined; const stderr: Buffer[] = [];
    const stop = (cause: Error) => {error ??= cause; child.kill();};
    const timer = setTimeout(() => stop(new Error('归档后端超过时间限制，已停止导入')), Math.min(timeout, 120000));
    child.on('error', cause => {error ??= cause;});
    child.stdout.on('error', cause => stop(cause)); child.stderr.on('error', cause => stop(cause));
    child.stdout.on('data', (chunk: Buffer) => {
      if (error) return;
      bytes += chunk.length;
      if (bytes > maximum) {stop(new Error('归档输出超过声明或安全容量限制')); return;}
      try {if (consume) consume(chunk); else chunks.push(chunk);} catch (cause) {stop(cause instanceof Error ? cause : new Error(String(cause)));}
    });
    child.stderr.on('data', (chunk: Buffer) => {stderrBytes += chunk.length; if (stderrBytes > 65536) stop(new Error('归档错误输出超过安全限制')); else stderr.push(chunk);});
    child.on('close', code => {
      clearTimeout(timer);
      try {backend.assert();} catch (cause) {error ??= cause as Error;}
      if (error) {reject(error); return;}
      const detail = Buffer.concat(stderr).toString('utf8').replace(/[\x00-\x1f\x7f]/gu, ' ').trim().slice(0, 600);
      if (code !== 0 || detail) {reject(new Error('归档损坏、加密或后端拒绝读取（退出码 ' + code + '）' + (detail ? '：' + detail : ''))); return;}
      resolve(Buffer.concat(chunks));
    });
  });
}
