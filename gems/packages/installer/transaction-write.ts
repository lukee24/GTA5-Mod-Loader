import type {Store} from '../database';import type {Transaction} from '../core/types';import {readTransaction,readTransactions,validateRecoveryTransaction} from './recovery-records';
export const TRANSACTION_ERROR_RESERVE=8192;
/** Check the final planned ledger before the first transaction/backup/game write. */
export function assertTransactionAppend(store:Store,prospective:Transaction){
  validateRecoveryTransaction(prospective.id,prospective);
  if(!prospective.changes.length)throw new Error('安装事务没有任何写入目标，未开始安装');
  readTransactions(store);
  if(readTransaction(store,prospective.id))throw new Error('事务记录标识已存在，未覆盖原事务');
  const sample=store.recoveryRows();if(sample.limited||sample.total>=10000)throw new Error('事务记录数量或文本已达到准入上限，未开始新安装');
  // Keep room for explainError (at most 1200 characters plus fixed context) and
  // the recovery state/error fields. This is not a disk-space reservation or lock.
  const plannedBytes=Buffer.byteLength(JSON.stringify(prospective))+TRANSACTION_ERROR_RESERVE;
  if(plannedBytes>8*1024**2)throw new Error('安装事务预计文本加恢复错误预留超过8MiB，未开始新安装');
  const existingBytes=sample.rows.reduce((n,row)=>n+Buffer.byteLength(row.json!),0);
  if(existingBytes+plannedBytes>32*1024**2)throw new Error('事务记录预计合计文本加恢复错误预留超过32MiB，未开始新安装');
  return{plannedBytes,existingBytes,errorReserve:TRANSACTION_ERROR_RESERVE};
}
