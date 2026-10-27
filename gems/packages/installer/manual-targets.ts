import type {Store} from '../database';
import {validateTarget} from './index';
import {MAX_FILES,relativeSafe} from '../core/security';
import type {ImportReport,FileEntry} from '../core/types';
import {readImport,saveImport} from '../scanner/import-records';
import {readMods,readMod} from './mod-records';
export const MANUAL_TARGET_BYTES=8*1024**2,MANUAL_PATH_LENGTH=4096;
const warning='安装目标由用户手动指定；文件识别不代表游戏运行兼容';
function sourcePath(value:unknown):string{
  if(typeof value!=='string'||!value||value.length>MANUAL_PATH_LENGTH)throw new Error('源文件路径无效或超过4096字符');return relativeSafe(value);
}
/** Builds a separate report; no source/cache/game writes and no compatibility upgrade. */
export function manualTargetReport(report:ImportReport,targets:unknown):ImportReport{
  if(!report||!Array.isArray(report.files)||report.files.length>MAX_FILES||!Array.isArray(report.blockers)||!Array.isArray(report.warnings)||[...report.blockers,...report.warnings].some(value=>typeof value!=='string'))throw new Error('安装目标原报告无效，已保留原记录');
  if(!Array.isArray(targets)||targets.length>MAX_FILES)throw new Error('目标清单无效或超过20000项');
  const files:FileEntry[]=[],index=new Map<string,FileEntry>();
  for(const entry of report.files){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))throw new Error('源文件记录无效');
    const file={...entry},key=sourcePath(file.path).toLowerCase();
    if(index.has(key))throw new Error('原报告源文件重复，无法确定映射');delete file.target;files.push(file);index.set(key,file);
  }
  const sources=new Set<string>(),destinations=new Set<string>();let bytes=0;
  for(const item of targets){
    if(!item||typeof item!=='object'||Array.isArray(item)||Object.keys(item).some(key=>!['path','target'].includes(key))||typeof item.path!=='string'||typeof item.target!=='string')throw new Error('目标项目无效');
    if(item.target.length>MANUAL_PATH_LENGTH)throw new Error('目标路径超过4096字符');
    bytes+=Buffer.byteLength(item.path)+Buffer.byteLength(item.target);if(bytes>MANUAL_TARGET_BYTES)throw new Error('目标路径文本总量超过8MiB');
    const source=sourcePath(item.path).toLowerCase(),file=index.get(source);
    if(!file)throw new Error('源文件不存在：'+item.path);if(sources.has(source))throw new Error('源文件重复：'+item.path);sources.add(source);
    if(item.target==='')continue;
    const target=validateTarget(item.target),key=target.toLowerCase();if(destinations.has(key))throw new Error('目标路径重复');destinations.add(key);file.target=target;
  }
  const blockers=report.blockers.filter(b=>!b.startsWith('无法确认完整安装路径'));
  if(!destinations.size)blockers.push('无法确认完整安装路径。请指定至少一个目标');
  return {...report,files,method:'用户明确指定目标',blockers,warnings:[...report.warnings.filter(value=>value!==warning),warning]};
}
export function saveManualTargets(store:Store,id:unknown,targets:unknown):ImportReport{
  if(typeof id!=='string'||!id||id.length>80||/[\x00-\x1f\x7f]/u.test(id))throw new Error('安装目标记录标识无效');
  readMods(store);const report=readImport(store,id);if(!report||readMod(store,id)?.status==='已启用')throw new Error('只能编辑尚未安装的导入');
  return saveImport(store,manualTargetReport(report,targets));
}
