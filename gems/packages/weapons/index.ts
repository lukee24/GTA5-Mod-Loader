import type {Store} from '../database';
import type {ImportReport} from '../core/types';
import {readImport,readImports} from '../scanner/import-records';
import {readMod,readMods} from '../installer/mod-records';
import {analyzeReportWeaponReferences} from './meta';
import {fail,inputDigest,sourceKey,strictJson,validateAnalysis,WEAPON_BYTES,WEAPON_KIND} from './validation';
import type {WeaponSource,WeaponIndexView,WeaponReferencesV1} from './types';
export type * from './types';
export {prepareWeaponCatalog,verifyWeaponCatalogSnapshot} from './catalog';

/** Read admission also bounds caches written by other sessions/tools, before batch parsing. */
export function assertWeaponIndexCollection(store:Store){
  const row=store.db.exec("SELECT COUNT(*),COALESCE(SUM(length(CAST(json AS BLOB))),0),COALESCE(SUM(CASE WHEN typeof(json)='text' THEN 0 ELSE 1 END),0) FROM documents WHERE kind='weapon-references-v1'")[0]?.values[0];
  const total=Number(row?.[0]||0),bytes=Number(row?.[1]||0);if(total>10000||bytes>32*1024**2||Number(row?.[2]||0))fail('派生索引集合超过10000条/32MiB或格式无效，已保留原记录');return{total,bytes};
}

export function sourceReport(store:Store,source:WeaponSource):ImportReport{
  sourceKey(source);const report=source.kind==='import'?readImport(store,source.id):readMod(store,source.id)?.report;
  if(!report)fail('来源记录不存在');return report;
}
function storedIndex(store:Store,source:WeaponSource):WeaponReferencesV1|null{
  const statement=store.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=2097152 THEN json ELSE NULL END AS json FROM documents WHERE kind=? AND id=?");
  try{statement.bind([WEAPON_KIND,sourceKey(source)]);if(!statement.step())return null;const json=statement.getAsObject().json;if(typeof json!=='string')fail('已有索引超过容量或格式无效，已保留');const result=validateAnalysis(strictJson(json));if(sourceKey(result.source)!==sourceKey(source))fail('已有索引来源不匹配，已保留');return result;}finally{statement.free();}
}
export function readWeaponReferenceIndex(store:Store,source:WeaponSource):WeaponIndexView{
  const report=sourceReport(store,source);try{const analysis=storedIndex(store,source);return{source:{...source},name:report.name,status:!analysis?'unindexed':analysis.inputDigest===inputDigest(report)&&analysis.reportId===report.id?'current':'stale',analysis,issues:analysis?analysis.issues:[]};}
  catch(error){return{source:{...source},name:report.name,status:'invalid',analysis:null,issues:[(error as Error).message]};}
}
/** Success writes a separate derived document; every failure preserves the old document. */
export function analyzeWeaponReferences(store:Store,source:WeaponSource):WeaponIndexView{
  assertWeaponIndexCollection(store);
  const report=sourceReport(store,source),before=inputDigest(report),old=storedIndex(store,source);
  const analysis=analyzeReportWeaponReferences(store.root,report,source);
  if(inputDigest(sourceReport(store,source))!==before)fail('分析期间来源记录变化，旧索引未覆盖');
  const stats=store.db.exec("SELECT COUNT(*),COALESCE(SUM(length(CAST(json AS BLOB))),0) FROM documents WHERE kind='weapon-references-v1'")[0]?.values[0];
  const total=Number(stats?.[0]||0),bytes=Number(stats?.[1]||0),newBytes=Buffer.byteLength(JSON.stringify(analysis)),oldBytes=old?Buffer.byteLength(JSON.stringify(old)):0;
  if(newBytes>WEAPON_BYTES||!old&&total>=10000||bytes-oldBytes+newBytes>32*1024**2)fail('派生索引容量超限，旧索引未覆盖');
  store.put(WEAPON_KIND,sourceKey(source),analysis);return readWeaponReferenceIndex(store,source);
}
export function listWeaponReferenceIndexes(store:Store):WeaponIndexView[]{
  assertWeaponIndexCollection(store);
  const mods=readMods(store),imports=readImports(store),modIds=new Set(mods.map(m=>m.id));
  if(mods.length+imports.filter(r=>!modIds.has(r.id)).length>10000)fail('分析来源超过10000条');
  return [...mods.map(m=>({kind:'mod' as const,id:m.id})),...imports.filter(r=>!modIds.has(r.id)).map(r=>({kind:'import' as const,id:r.id}))].map(source=>readWeaponReferenceIndex(store,source));
}
