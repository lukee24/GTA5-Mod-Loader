import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {noLinks} from '../core/security';
import {explainError} from '../core/errors';
import {readOnlyCommand} from './windows-command';
import {scriptHookSupport, scriptHookVersionSupport, runtimeSupportEvidence} from './runtime-support';

export interface RuntimeFileEvidence {
  filename: string;
  status: 'missing' | 'present' | 'invalid' | 'unreadable';
  bytes?: number;
  sha256?: string;
  evidence: string;
}
export interface RuntimeDependency {
  id: string;
  name: string;
  requiredFor: string;
  status: 'missing' | 'unsupported' | 'unknown';
  support: 'matched' | 'not-listed' | 'unknown';
  files: RuntimeFileEvidence[];
  evidence: string;
  source?: typeof scriptHookSupport;
}
export interface RuntimeAssessment {
  checked: string;
  gameVersion: string;
  gameVersionError?: string;
  dependencies: RuntimeDependency[];
  gameplay: 'not-tested';
  summary: string;
}

// Bounded reads never execute candidate binaries or write to the game.
export const MAX_RUNTIME_BINARY_BYTES = 32 * 1024 ** 2;
const stamp = (stat: fs.BigIntStats) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].join(':');

function runtimeFile(root: string, filename: string): RuntimeFileEvidence {
  const file = path.join(root, filename);
  let fd: number | undefined;
  try {
    noLinks(root, file);
    let before: fs.BigIntStats;
    try { before = fs.lstatSync(file, {bigint: true}); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {filename, status: 'missing', evidence: '未发现 ' + filename};
      throw error;
    }
    if (!before.isFile() || before.nlink !== 1n) throw new Error('依赖候选不是独立普通文件，未读取');
    const bytes = Number(before.size);
    if (before.size > BigInt(MAX_RUNTIME_BINARY_BYTES)) throw new Error('依赖候选超过 32 MiB 诊断上限，未读取');
    fd = fs.openSync(file, 'r');
    const verify = () => {
      noLinks(root, file);
      if (stamp(before) !== stamp(fs.fstatSync(fd!, {bigint: true})) || stamp(before) !== stamp(fs.lstatSync(file, {bigint: true}))) {
        throw new Error('依赖读取期间文件或路径发生变化，请重新诊断');
      }
    };
    verify();
    const header = Buffer.alloc(64);
    const headerBytes = fs.readSync(fd, header, 0, header.length, 0);
    let peValid = false;
    if (headerBytes === header.length && header.subarray(0, 2).toString() === 'MZ') {
      const offset = header.readUInt32LE(60), pe = Buffer.alloc(6);
      peValid = offset >= 64 && offset <= bytes - pe.length && fs.readSync(fd, pe, 0, pe.length, offset) === pe.length
        && pe.readUInt32LE(0) === 0x4550 && pe.readUInt16LE(4) === 0x8664;
    }
    const hash = crypto.createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < bytes) {
      const length = Math.min(buffer.length, bytes - offset);
      const count = fs.readSync(fd, buffer, 0, length, offset);
      if (!Number.isInteger(count) || count < 1 || count > length) throw new Error('依赖读取不完整，请重新诊断');
      hash.update(buffer.subarray(0, count)); offset += count;
    }
    verify();
    return {filename, status: peValid ? 'present' : 'invalid', bytes, sha256: hash.digest('hex'),
      evidence: peValid ? '存在 Windows x64 PE 候选；SHA256 只标识本次读取字节，未核实发布者或游戏兼容性'
        : '文件不具备可识别的 Windows x64 PE 头，不能作为已就绪的加载依赖'};
  } catch (error) {
    return {filename, status: 'unreadable', evidence: explainError(error)};
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export async function readGameVersion(root: string, signal?: AbortSignal): Promise<{version: string; error?: string}> {
  signal?.throwIfAborted();
  try {
    if (process.platform !== 'win32') throw new Error('当前平台无法读取 Windows 游戏版本');
    const exe = path.join(root, 'GTA5_Enhanced.exe'); noLinks(root, exe);
    const literal = exe.replaceAll("'", "''");
    const result = await readOnlyCommand('WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-Item -LiteralPath '${literal}' -ErrorAction Stop).VersionInfo.FileVersion`], signal);
    const version = result.stdout.trim();
    if (result.stderr.trim() || !/^\d+\.\d+\.\d+\.\d+$/u.test(version)) throw new Error('无法读取精确的四段游戏版本，兼容性保持未知');
    return {version};
  } catch (error) {
    signal?.throwIfAborted();
    return {version: '未知', error: explainError(error)};
  }
}

/** "unsupported" means absent from the dated publisher support list, not a proven runtime failure.
 * A version match does not establish binary identity, ABI compatibility, or in-game success.
 */
export function inspectRuntimeDependencies(root: string, gameVersion: string, gameVersionError?: string): RuntimeAssessment {
  if (!root || !path.isAbsolute(root)) throw new Error('依赖诊断需要绝对游戏目录');
  noLinks(root, root);
  if (!fs.statSync(root).isDirectory()) throw new Error('依赖诊断需要已存在的游戏目录');
  const specs = [
    {id: 'asi-loader', name: 'ASI Loader', requiredFor: '通过 ASI 加载器运行的插件', names: ['dinput8.dll', 'dsound.dll']},
    {id: 'scripthookv', name: 'ScriptHookV', requiredFor: '调用 ScriptHookV 的 ASI 插件，例如 NativeTrainer', names: ['ScriptHookV.dll']},
    {id: 'openrpf', name: 'OpenRPF', requiredFor: '明确要求 OpenRPF 的 Enhanced mods 目录安装方式', names: ['OpenRPF.asi']},
    {id: 'scripthookvdotnet', name: 'ScriptHookVDotNet', requiredFor: '明确要求 .NET 运行时的脚本；具体 API/Enhanced 版本须另核实', names: ['ScriptHookVDotNet.asi', 'ScriptHookVDotNet2.dll', 'ScriptHookVDotNet3.dll']},
    {id: 'reshade', name: 'ReShade 注入候选', requiredFor: '明确要求 ReShade 的效果或配置；配置文件本身不能证明注入器存在', names: ['ReShade.asi', 'dxgi.dll', 'd3d11.dll']}
  ];
  const dependencies: RuntimeDependency[] = specs.map(spec => {
    const files = spec.names.map(filename => runtimeFile(root, filename));
    const present = files.filter(file => file.status === 'present');
    const support = spec.id === 'scripthookv' ? scriptHookVersionSupport(gameVersion) : 'unknown';
    const status = files.every(file => file.status === 'missing') ? 'missing'
      : spec.id === 'scripthookv' && present.length && support === 'not-listed' ? 'unsupported' : 'unknown';
    let evidence = status === 'missing' ? '未发现所列依赖候选；仅在该模组明确需要此组件时构成依赖缺失。'
      : present.length ? '发现候选文件；文件名、PE 头和哈希均不能证明它来自指定发布者，也不能证明已加载。'
        : '候选文件无法完整核验，不能认定依赖已就绪。';
    if (spec.id === 'scripthookv') evidence += ' ' + runtimeSupportEvidence(gameVersion).evidence;
    if (spec.id === 'asi-loader' && present.length > 1) evidence += ' 同时发现 dinput8.dll 和 dsound.dll 候选；作者安装说明要求排除旧加载器冲突，需人工核实文件身份，工具不自动删除。';
    if (spec.id === 'scripthookvdotnet') evidence += ' 必须核对 ASI 与脚本所需 API DLL 的同一发布包；其中一个文件存在不能证明依赖完整。';
    if (spec.id === 'openrpf') evidence += ' 不把 onigiri 或其他重定向器自动视为等价替代品。';
    return {id: spec.id, name: spec.name, requiredFor: spec.requiredFor, status, support, files, evidence,
      ...(spec.id === 'scripthookv' ? {source: scriptHookSupport} : {})};
  });
  const missing = dependencies.filter(item => item.status === 'missing').length;
  const unsupported = dependencies.filter(item => item.status === 'unsupported').length;
  return {checked: new Date().toISOString(), gameVersion, ...(gameVersionError ? {gameVersionError} : {}), dependencies, gameplay: 'not-tested',
    summary: `缺失 ${missing} 项，未列入当前支持记录 ${unsupported} 项，其余待验证；按模组说明确认所需依赖。未进行游戏内加载、功能和恢复实测。`};
}
