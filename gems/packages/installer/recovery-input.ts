import type {Transaction} from '../core/types';
import {sameGamePath} from '../core/security';
import {validateRecoveryTransaction} from './recovery-records';

/** Capture before awaiting or consulting callbacks. The caller's object is never executed. */
export function captureRecoveryInput(value:Transaction):Transaction{
  let request:Transaction;
  try{request=structuredClone(value);}catch(error){throw new Error('恢复输入无法建立独立快照，未开始恢复',{cause:error});}
  return validateRecoveryTransaction(request?.id,request);
}

/** Shape validation is insufficient: every operation must match the saved ledger. */
export function assertRecoveryMatch(request:Transaction,persisted:Transaction|undefined):asserts persisted is Transaction{
  if(persisted?.operation!==request.operation)throw new Error('事务记录与恢复输入不匹配，请重新读取记录；未开始恢复');
  if(!persisted||persisted.id!==request.id||persisted.modId!==request.modId||!sameGamePath(persisted.gamePath,request.gamePath)||persisted.created!==request.created||persisted.name!==request.name||persisted.trustedRestore!==request.trustedRestore||persisted.state!==request.state||persisted.error!==request.error||persisted.changes.length!==request.changes.length||persisted.changes.some((change,i)=>{
    const input=request.changes[i];
    return change.target!==input.target||change.before!==input.before||change.after!==input.after||change.applied!==input.applied;
  }))throw new Error('事务记录与恢复输入不匹配，请重新读取记录；未开始恢复');
}
