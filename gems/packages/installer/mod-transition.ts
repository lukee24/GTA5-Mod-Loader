import {isDeepStrictEqual} from 'node:util';
import type {Store} from '../database';
import type {ModRecord} from '../core/types';
import {readMod,assertModWrite} from './mod-records';

function lifecycle(mod:ModRecord|undefined){
  if(!mod)return undefined;
  const {metadata,...record}=mod;
  return record;
}

/** Synchronous commit: only metadata may have changed while a file operation awaited. */
export function commitModTransition(store:Store,expected:ModRecord|undefined,next:ModRecord):ModRecord{
  const current=readMod(store,next.id);
  if(!isDeepStrictEqual(lifecycle(current),lifecycle(expected)))throw new Error('模组记录在操作期间发生变化，未覆盖最新记录；请核对事务并重新读取');
  const saved={...next,metadata:current?.metadata};
  assertModWrite(store,saved);
  store.put('mod',saved.id,saved);
  return saved;
}
