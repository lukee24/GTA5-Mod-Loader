import type {ModRecord,Transaction} from '../core/types';

/** A missing enabled layer cannot be treated as unowned, even for equal hashes. */
export function assertEnabledOwnership(mods:readonly ModRecord[],transactions:readonly Transaction[]):void{
 const byId=new Map(transactions.map(tx=>[tx.id,tx]));
 for(const mod of mods){
  if(mod.status!=='已启用')continue;
  const tx=byId.get(mod.transactionId);
  if(!tx||tx.modId!==mod.id)throw new Error('启用模组的事务记录缺失或不匹配，无法确认共享文件所有权，已停止文件操作：'+mod.report.name);
 }
 // Pending and rolled-back transactions can legitimately exist while recovery
 // finishes the mod-state transition. Their state is checked by each operation.
}
