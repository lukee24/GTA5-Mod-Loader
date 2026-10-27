import type {WeaponCatalogV1,WeaponCatalogRecord} from '../weapons/types';
import {canonicalGameRoot,digest,fail,gameRootId,hex,id,object,strings,text,token,validateEvidence,weaponHash,WEAPON_BYTES,WEAPON_LIMIT} from '../weapons/validation';
export const WEAPON_CATALOG_FILE='weapon-catalog-v1.json';
export function validateWeaponCatalog(value:unknown):WeaponCatalogV1{
  const v=object(value,['schemaVersion','component','protocol','revision','gameRoot','gameRootId','targetGame','requiresGameRestart','weapons','issues']);
  if(v.schemaVersion!==1||v.component!=='GEMS.WeaponCatalog'||v.protocol!=='gems.weapon-catalog.v1'||!hex(v.revision)||v.targetGame!=='enhanced'||v.requiresGameRestart!==true||!text(v.gameRoot,32768)||canonicalGameRoot(v.gameRoot)!==v.gameRoot||gameRootId(v.gameRoot)!==v.gameRootId||!Array.isArray(v.weapons)||v.weapons.length>WEAPON_LIMIT)fail('桥接根字段、路径绑定或版本无效');
  strings(v.issues,WEAPON_LIMIT,8192);const ids=new Set<string>(),hashes=new Map<string,string>(),names=new Set<string>();
  for(const raw of v.weapons){const r=object(raw,['id','modId','name','weaponName','hash','kind','evidence','transactionId','fileState','registration','dependencies','issues']) as WeaponCatalogRecord;
    if(!hex(r.id)||!id(r.modId)||!text(r.name,300)||!token(r.weaponName)||!hex(r.hash,8)||weaponHash(r.weaponName)!==r.hash||!['addon','replace','unknown'].includes(r.kind)||r.transactionId!==null&&!id(r.transactionId)||!['verified','disabled','uninstalled','pending','missing','changed','shadowed','unverified'].includes(r.fileState)||!['unknown','not-registered'].includes(r.registration)||!['unknown','missing','declared-only'].includes(r.dependencies)||!Array.isArray(r.evidence)||!r.evidence.length||r.evidence.length>32)fail('桥接武器字段无效');
    if(r.fileState==='verified'&&r.transactionId===null)fail('已核验文件缺少事务标识');
    if(ids.has(r.id)||names.has(r.weaponName.toLowerCase())||hashes.has(r.hash))fail('武器重复或hash冲突：'+r.weaponName+'；来源 '+(hashes.get(r.hash)||'重复标识')+' / '+r.modId);
    ids.add(r.id);names.add(r.weaponName.toLowerCase());hashes.set(r.hash,r.modId);r.evidence.forEach(validateEvidence);strings(r.issues,64,8192);
  }
  return v as WeaponCatalogV1;
}
export function weaponCatalogText(value:WeaponCatalogV1){validateWeaponCatalog(value);const pretty=JSON.stringify(value,null,2);if(Buffer.byteLength(pretty)<=WEAPON_BYTES)return pretty;const compact=JSON.stringify(value);if(Buffer.byteLength(compact)>WEAPON_BYTES)fail('桥接目录超过2MiB，未截断或导出');return compact;}
export function weaponCatalogRevision(value:Omit<WeaponCatalogV1,'revision'>){return digest(JSON.stringify(value));}
