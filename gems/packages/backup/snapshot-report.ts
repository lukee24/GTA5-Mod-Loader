import path from 'node:path';import type {Backup} from './index';import type {ImportReport} from '../core/types';import type {SnapshotRecord} from './snapshot-plan';import {validateSnapshot} from './snapshot-plan';import {inspectFileHash,noLinks,sameGamePath,executable} from '../core/security';import {validateImportReport} from '../core/import-report';
/** Verify actual backup content before creating a report. No game or database writes. */
export async function snapshotReport(snapshot:SnapshotRecord,backup:Backup,data:string,game:string):Promise<ImportReport>{
  validateSnapshot(snapshot?.id,snapshot);if(!sameGamePath(snapshot.gamePath,game))throw new Error('快照与当前游戏目录不匹配');if(!snapshot.entries.length)throw new Error('空快照没有可恢复的文件记录');
  const files:ImportReport['files']=[];
  for(const entry of snapshot.entries){
    const source=backup.file(entry.hash);
    try{
      noLinks(backup.root,source);
      const evidence=await inspectFileHash(source);
      if(evidence.hash!==entry.hash)throw new Error('内容不一致');
      files.push({path:entry.path,target:entry.path,source,hash:evidence.hash,size:evidence.bytes,binary:executable(entry.path)});
    }catch(error){throw new Error('快照备份缺失、超限或校验失败，未生成恢复计划：'+entry.path,{cause:error});}
  }
  const report:ImportReport={id:crypto.randomUUID(),name:'快照恢复 '+snapshot.created,original:path.resolve(data),created:new Date().toISOString(),categories:['其他'],files,warnings:['只恢复已保存文件；不会删除之后新增文件，不能视为完整时间点还原'],blockers:[],readme:'',method:'已校验快照',compatibility:'游戏内待测试',spawnNames:[],dlcNames:[]};
  if(files.some(file=>/^[^/]+\.dll$/i.test(file.path)))report.warnings.push('根目录 DLL 可能包含原始游戏组件；请核对游戏版本和恢复目标，不能认定全部属于 MOD 插件');
  return validateImportReport(report.id,report);
}
