import type {Store} from '../database';import type {Transaction} from '../core/types';
import {readTransactions,validateRecoveryTransaction} from './recovery-records';
import {TRANSACTION_ERROR_RESERVE} from './transaction-write';
const capacity=(scope:string)=>new Error('事务更新超过'+scope+'容量准入上限（含恢复错误预留），未保存并保留原记录');
/** Existing-row update admission: the same read limits must remain valid after writing. */
export function assertTransactionUpdate(store:Store,record:Transaction){
  validateRecoveryTransaction(record.id,record);readTransactions(store);
  const sample=store.recoveryRows();if(sample.limited)throw capacity('10000条或32MiB');
  const existing=sample.rows.find(row=>row.id===record.id);
  if(!existing||existing.json===null)throw new Error('事务更新的原记录缺失或无法核对，未创建或覆盖记录');
  const bytes=Buffer.byteLength(JSON.stringify(record));
  // Reserve replacement error text, not an additional copy of the current error.
  const plannedBytes=Math.max(bytes,Buffer.byteLength(JSON.stringify({...record,error:undefined}))+TRANSACTION_ERROR_RESERVE);
  if(plannedBytes>8*1024**2)throw capacity('单条8MiB');
  const existingBytes=sample.rows.reduce((n,row)=>{if(row.json===null)throw capacity('完整记录');return n+Buffer.byteLength(row.json);},0);
  const total=existingBytes-Buffer.byteLength(existing.json)+plannedBytes;
  if(total>32*1024**2)throw capacity('合计32MiB');
  return{bytes,plannedBytes,existingBytes,total,errorReserve:TRANSACTION_ERROR_RESERVE};
}
