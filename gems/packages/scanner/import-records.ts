import type {Store} from '../database';import type {ImportReport} from '../core/types';import {validateImportReport} from '../core/import-report';
const error=()=>new Error('导入记录的字段、结构、标识或容量无法确认，已停止保存并保留原记录');
function id(value:unknown){return typeof value==='string'&&value.length>0&&value.length<=80&&/^[-a-z0-9_]+$/i.test(value);}
export function readImports(store:Store):ImportReport[]{
  const sample=store.importRows();if(sample.limited)throw new Error('导入记录超过10000条或合计32MiB准入上限，已停止保存并保留原记录');
  return sample.rows.map(row=>{try{if(row.json===null)throw error();return validateImportReport(row.id,JSON.parse(row.json));}catch{throw error();}});
}
export function readImport(store:Store,key:unknown):ImportReport|undefined{
  if(!id(key))throw error();const row=store.importRow(key as string);if(!row)return undefined;
  try{if(row.json===null)throw error();return validateImportReport(key,JSON.parse(row.json));}catch{throw error();}
}
/** Only validates, so a caller can atomically save a report and its download receipt together. */
export function assertImportWrite(store:Store,report:ImportReport){
  validateImportReport(report?.id,report);readImports(store);const sample=store.importRows(),existing=sample.rows.find(row=>row.id===report.id),bytes=Buffer.byteLength(JSON.stringify(report));
  const total=sample.rows.reduce((sum,row)=>sum+Buffer.byteLength(row.json!),0)-(existing?Buffer.byteLength(existing.json!):0)+bytes;
  if(bytes>8*1024**2||total>32*1024**2||!existing&&sample.total>=10000)throw error();
}
export function saveImport(store:Store,report:ImportReport){assertImportWrite(store,report);store.put('import',report.id,report);return report;}
