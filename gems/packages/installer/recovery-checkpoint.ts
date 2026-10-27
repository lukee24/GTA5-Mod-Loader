import {isDeepStrictEqual} from 'node:util';
import type {Store} from '../database';
import type {Transaction} from '../core/types';
import {validateRecoveryTransaction} from './recovery-records';
import {assertTransactionUpdate} from './transaction-update';

const changed=(operation:'恢复'|'安装',cause?:unknown)=>new Error('事务记录在'+operation+'期间发生变化，已停止'+operation+'并保留最新记录；请重新核对',{cause});
/** Optimistic checkpoint for this Store's ledger. It is not a disk or process lock. */
export class RecoveryCheckpoint {
  private expected:Transaction;
  private expectedJson:string;
  constructor(private store:Store,initial:Transaction,private operation:'恢复'|'安装'='恢复'){
    validateRecoveryTransaction(initial.id,initial);
    this.expectedJson=JSON.stringify(initial);
    this.expected=JSON.parse(this.expectedJson) as Transaction;
  }
  assertCurrent(){
    try{
      // Always read the current bounded SQL row. Exact text equality to a validated
      // private baseline avoids repeatedly parsing/validating every file target.
      const row=this.store.recoveryRow(this.expected.id);
      if(!row||row.json===null)throw changed(this.operation);
      if(row.json===this.expectedJson)return;
      // Formatting may differ without changing semantics. Admit the whole record
      // before caching its text; changed or invalid records never advance baseline.
      const current=validateRecoveryTransaction(this.expected.id,JSON.parse(row.json));
      if(!isDeepStrictEqual(current,this.expected))throw changed(this.operation);
      this.expectedJson=row.json;
    }catch(error){throw changed(this.operation,error);}
  }
  save(next:Transaction){
    this.assertCurrent();
    const captured=JSON.parse(JSON.stringify(next)) as Transaction;
    validateRecoveryTransaction(this.expected.id,captured);assertTransactionUpdate(this.store,captured);
    this.store.put('transaction',captured.id,captured);
    this.expected=captured;
    this.expectedJson=JSON.stringify(captured);
  }
}
