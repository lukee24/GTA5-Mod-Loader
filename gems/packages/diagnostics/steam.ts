import fs from 'node:fs';
import path from 'node:path';
import {noLinks, relativeSafe, sameGamePath} from '../core/security';
import {readTextSnapshot} from '../scanner/text-snapshot';

type ObjectValue = {[key: string]: string | ObjectValue};
/** Bounded subset of Valve text KeyValues: quoted values, blocks and line comments. No code execution. */
export function parseManifest(text: string): ObjectValue {
  if (Buffer.byteLength(text) > 1024 * 1024) throw new Error('Steam 安装记录超过读取上限');
  let offset = 0, count = 0;
  function token(): {value: string; block?: true} | null {
    while (offset < text.length) {
      if (/\s/.test(text[offset])) {offset++; continue;}
      if (text.slice(offset, offset + 2) === '//') {while (offset < text.length && text[offset] !== '\n') offset++; continue;}
      break;
    }
    if (offset === text.length) return null;
    if (++count > 20000) throw new Error('Steam 安装记录项目过多');
    const first = text[offset++];
    if (first === '{' || first === '}') return {value: first, block: true};
    if (first !== '"') throw new Error('Steam 安装记录包含不支持的语法');
    let result = '';
    while (offset < text.length) {
      const ch = text[offset++];
      if (ch === '"') return {value: result};
      if (ch === '\\') {
        const escaped = text[offset++];
        if (escaped !== '"' && escaped !== '\\') throw new Error('Steam 安装记录的转义无效');
        result += escaped;
      } else result += ch;
    }
    throw new Error('Steam 安装记录不完整，请等待 Steam 完成写入');
  }
  function object(depth: number): ObjectValue {
    if (depth > 16) throw new Error('Steam 安装记录嵌套过深');
    const result: ObjectValue = Object.create(null);
    while (true) {
      const key = token();
      if (key === null) {if (depth) throw new Error('Steam 安装记录不完整'); return result;}
      if (key.block && key.value === '}') {if (!depth) throw new Error('Steam 安装记录结构无效'); return result;}
      if (key.block && key.value === '{') throw new Error('Steam 安装记录缺少字段名');
      const normalized = key.value.toLowerCase();
      if (Object.hasOwn(result, normalized)) throw new Error('Steam 安装记录包含重复字段');
      const value = token();
      if (value === null || (value.block && value.value === '}')) throw new Error('Steam 安装记录缺少字段值');
      result[normalized] = value.block ? object(depth + 1) : value.value;
    }
  }
  return object(0);
}

export interface SteamStatus {manifest: string;record:'present'|'missing';ready: boolean;build: string;evidence: string;downloaded: number | null;total: number | null}
export function inspectSteam(root: string): SteamStatus | null {
  const common = path.dirname(path.resolve(root)), steamapps = path.dirname(common);
  if (path.basename(common).toLowerCase() === 'downloading' && path.basename(steamapps).toLowerCase() === 'steamapps') throw new Error('这是 Steam 下载暂存目录，请等待部署完成后选择 common 中的游戏目录');
  if (path.basename(common).toLowerCase() !== 'common' || path.basename(steamapps).toLowerCase() !== 'steamapps') return null;
  const manifest = path.join(steamapps, 'appmanifest_3240220.acf');
  noLinks(path.parse(manifest).root, manifest);
  // A Steam-shaped directory with no deployment record is unknown, not non-Steam.
  // Never create/repair the manifest or allow missing evidence to bypass the guard.
  try {fs.lstatSync(manifest);} catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{manifest,record:'missing',ready:false,build:'未知',downloaded:null,total:null,evidence:'Steam 安装记录缺失，无法确认下载、部署或更新状态；请等待 Steam 完成部署或恢复安装记录后重新检查，暂时禁止修改游戏文件'};throw error;}
  let text:string;
  try{text=readTextSnapshot(path.parse(manifest).root,manifest,1024**2,'Steam 安装记录');}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw new Error('读取期间Steam 安装记录路径发生变化，请重新检查安装状态',{cause:error});throw error;}
  const state = parseManifest(text).appstate;
  if (!state || typeof state === 'string' || state.appid !== '3240220' || typeof state.installdir !== 'string') throw new Error('Steam 增强版安装记录无效');
  const directory = relativeSafe(state.installdir);
  if (directory.includes('/') || directory.includes('\\') || !sameGamePath(path.join(common, directory), root)) throw new Error('所选游戏目录与 Steam 增强版安装记录不一致');
  const fields: ObjectValue = state;
  function number(key: string): number | null {
    const value = fields[key];
    if (value === undefined) return null;
    if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Steam 安装记录的计数无效：' + key);
    return Number(value);
  }
  const flags = number('stateflags'), downloaded = number('bytesdownloaded'), total = number('bytestodownload');
  const staged = number('bytesstaged'), toStage = number('bytestostage'), build = number('buildid');
  const pairReady = (done: number | null, expected: number | null) => (done === null && expected === null) || (done !== null && expected !== null && done >= expected);
  // Conservative policy: only accept the observed idle installed value, never guess combined/unknown states.
  const ready = flags === 4 && build !== null && build > 0 && pairReady(downloaded, total) && pairReady(staged, toStage);
  return {manifest, record:'present',ready, build: String(build ?? '未知'), downloaded, total,
    evidence: ready ? 'Steam 安装记录处于就绪状态；仍需检查游戏文件，未执行完整性验证' : `Steam 下载、部署或更新尚未确认完成（状态值 ${flags ?? '未知'}）；暂时禁止修改游戏文件`};
}
