import type {Store} from '../database';
import {explainError} from './errors';

/** Non-throwing observation of an operation. Critical writes belong to the caller. */
export class OperationLogger {
  issue:string|null=null;
  constructor(private store:Pick<Store,'log'>,private failurePrefix='操作日志记录失败：',private hint='请以当前页面的数据和事务记录核对操作结果。'){}
  record(kind:string,message:string){
    try{this.store.log(kind,message);this.issue=null;}
    catch(error){
      let detail='无法读取日志错误详情';try{detail=explainError(error);}catch{}
      this.issue=kind+this.failurePrefix+detail+'。'+this.hint;
      // log() may already have committed its SQL row before append failed. Never
      // manufacture a "database not saved" fallback or alter the caller's result.
      try{console.warn(this.issue);}catch{}
    }
  }
}
