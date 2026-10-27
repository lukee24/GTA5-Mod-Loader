import type {PedCatalogV1,PedCatalogRecord} from '../peds/types';
import {canonicalGameRoot,digest,fail,gameRootId,hex,id,object,strings,text,token,validateEvidence,validateDependency,validateTags,pedHash,PED_BYTES,PED_LIMIT,PED_KINDS} from '../peds/validation';
export const PED_CATALOG_FILE='ped-catalog-v1.json';
export function validatePedCatalog(value:unknown):PedCatalogV1{
  const v=object(value,['schemaVersion','component','protocol','revision','gameRoot','gameRootId','targetGame','requiresGameRestart','peds','issues']);
  if(v.schemaVersion!==1||v.component!=='GEMS.PedCatalog'||v.protocol!=='gems.ped-catalog.v1'||!hex(v.revision)||v.targetGame!=='enhanced'||v.requiresGameRestart!==true||!text(v.gameRoot,32768)||canonicalGameRoot(v.gameRoot)!==v.gameRoot||gameRootId(v.gameRoot)!==v.gameRootId||!Array.isArray(v.peds)||v.peds.length>PED_LIMIT)fail('桥接根字段、路径绑定或版本无效');
  strings(v.issues,PED_LIMIT,8192);const ids=new Set<string>(),hashes=new Set<string>(),names=new Set<string>();let total=0;
  for(const raw of v.peds){const r=object(raw,['id','modId','name','modelName','hash','kind','parsedPedType','dependencyRefs','evidence','transactionId','fileState','registration','dependencies','desktopFavorite','userTags','issues']) as PedCatalogRecord;
    if(!hex(r.id)||!id(r.modId)||!text(r.name,300)||!token(r.modelName)||!hex(r.hash,8)||pedHash(r.modelName)!==r.hash||!PED_KINDS.includes(r.kind)||r.parsedPedType!==null&&!token(r.parsedPedType)||r.transactionId!==null&&!id(r.transactionId)||!['verified','disabled','uninstalled','pending','missing','changed','shadowed','unverified'].includes(r.fileState)||!['unknown','not-registered'].includes(r.registration)||!['unknown','missing','declared-only'].includes(r.dependencies)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>32||typeof r.desktopFavorite!=='boolean')fail('桥接人物字段无效');
    if(r.fileState==='verified'&&r.transactionId===null)fail('已核验文件缺少事务标识');
    if(ids.has(r.id)||names.has(r.modelName.toLowerCase())||hashes.has(r.hash))fail('人物重复或hash冲突：'+r.modelName);ids.add(r.id);names.add(r.modelName.toLowerCase());hashes.add(r.hash);
    r.evidence.forEach(validateEvidence);strings(r.issues,64,8192);validateTags(r.userTags);
    if(!Array.isArray(r.dependencyRefs)||r.dependencyRefs.length>96)fail('人物依赖超过96项');r.dependencyRefs.forEach(validateDependency);if(new Set(r.dependencyRefs.map(d=>JSON.stringify([d.kind,d.identifier]))).size!==r.dependencyRefs.length)fail('依赖重复');total+=r.dependencyRefs.length;if(total>20000)fail('依赖总量超过20000');
  }
  return v as PedCatalogV1;
}
export function pedCatalogText(value:PedCatalogV1){validatePedCatalog(value);const pretty=JSON.stringify(value,null,2);if(Buffer.byteLength(pretty)<=PED_BYTES)return pretty;const compact=JSON.stringify(value);if(Buffer.byteLength(compact)>PED_BYTES)fail('桥接目录超过2MiB，未截断或导出');return compact;}
export function pedCatalogRevision(value:Omit<PedCatalogV1,'revision'>){return digest(JSON.stringify(value));}
