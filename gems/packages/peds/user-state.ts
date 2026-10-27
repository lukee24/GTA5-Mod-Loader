import type {Store} from '../database';
import {readPedReferenceIndex} from './index';
import {fail,hex,object,PED_USER_KIND,sourceKey,strictJson,USER_TAGS,validateTags,validateUserState} from './validation';
import type {PedIdentity,PedSource,PedUserPatch,PedUserState} from './types';
export function assertPedUserCollection(store:Store){
  const row=store.db.exec("SELECT COUNT(*),COALESCE(SUM(length(CAST(json AS BLOB))),0),COALESCE(SUM(CASE WHEN typeof(json)='text' THEN 0 ELSE 1 END),0) FROM documents WHERE kind='ped-user-state-v1'")[0]?.values[0];
  const total=Number(row?.[0]||0),bytes=Number(row?.[1]||0);if(total>10000||bytes>8*1024**2||Number(row?.[2]||0))fail('偏好集合超过10000条/8MiB或格式无效');return{total,bytes};
}
function key(identity:PedIdentity){object(identity,['source','referenceId']);if(!hex(identity.referenceId))fail('偏好引用身份无效');return sourceKey(identity.source)+':'+identity.referenceId;}
function current(store:Store,source:PedSource){const view=readPedReferenceIndex(store,source);if(view.status!=='current'||!view.analysis)fail('仅当前人物索引可读取或修改偏好');return view.analysis.references;}
function stored(store:Store,identity:PedIdentity):{state:PedUserState;bytes:number;exists:boolean}{
  const documentId=key(identity),q=store.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=4096 THEN json ELSE NULL END AS json FROM documents WHERE kind=? AND id=?");
  try{q.bind([PED_USER_KIND,documentId]);if(!q.step())return{state:{schema:'gems.ped-user-state',schemaVersion:1,source:{...identity.source},referenceId:identity.referenceId,favorite:false,tags:[],updatedAt:null},bytes:0,exists:false};
    const json=q.getAsObject().json;if(typeof json!=='string')fail('已有偏好超过4KiB或格式无效，已保留');const state=validateUserState(strictJson(json,4096),true);
    if(key({source:state.source,referenceId:state.referenceId})!==documentId)fail('已有偏好身份不匹配，已保留');return{state,bytes:Buffer.byteLength(json),exists:true};
  }finally{q.free();}
}
export function readPedUserState(store:Store,identity:PedIdentity):PedUserState{key(identity);assertPedUserCollection(store);if(!current(store,identity.source).some(r=>r.referenceId===identity.referenceId))fail('偏好引用不属于当前来源');return stored(store,identity).state;}
export function listPedUserStates(store:Store,source:PedSource):PedUserState[]{sourceKey(source);assertPedUserCollection(store);return current(store,source).map(r=>stored(store,{source,referenceId:r.referenceId}).state);}
export function setPedUserState(store:Store,identity:PedIdentity,patch:PedUserPatch):PedUserState{
  key(identity);const p=object(patch,[],['favorite','tags']);if(!Object.keys(p).length||p.favorite!==undefined&&typeof p.favorite!=='boolean'||Object.prototype.hasOwnProperty.call(p,'favorite')&&p.favorite===undefined||Object.prototype.hasOwnProperty.call(p,'tags')&&p.tags===undefined)fail('偏好修改无效');
  if(p.tags!==undefined)validateTags(p.tags);const stats=assertPedUserCollection(store);if(!current(store,identity.source).some(r=>r.referenceId===identity.referenceId))fail('偏好引用不属于当前来源');
  const old=stored(store,identity),state:PedUserState={...old.state,source:{...identity.source},favorite:p.favorite??old.state.favorite,tags:USER_TAGS.filter(t=>(p.tags??old.state.tags).includes(t)),updatedAt:new Date().toISOString()};
  validateUserState(state,true);const bytes=Buffer.byteLength(JSON.stringify(state));if(!old.exists&&stats.total>=10000||stats.bytes-old.bytes+bytes>8*1024**2)fail('偏好集合容量超限，旧记录已保留');
  store.put(PED_USER_KIND,key(identity),state);return state;
}
