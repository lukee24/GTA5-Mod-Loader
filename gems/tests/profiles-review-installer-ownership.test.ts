import test from 'node:test';
import assert from 'node:assert/strict';
import type {ModRecord,Transaction} from '../packages/core/types';
import {profileFixture,installApproval} from './profile-fixture';

for(const corruption of ['missing','wrong-mod-id'] as const){
  test(`独立关联审查：${corruption} 的启用上层不能被普通停用遗漏`,async t=>{
    const f=await profileFixture(t),lower=await f.install('lower',{'mods/shared.ini':'same'}),upper=await f.install('upper',{'mods/shared.ini':'same'});
    const tx=f.store.get<Transaction>('transaction',upper.transactionId)!;
    if(corruption==='missing')f.store.remove('transaction',upper.transactionId);
    else f.store.put('transaction',tx.id,{...tx,modId:'unrelated-valid-id'});
    const beforeMods=f.store.list('mod'),beforeTransactions=f.store.list('transaction');
    await assert.rejects(f.installer.disable(lower.id),/事务|所有权|记录/);
    assert.equal(f.read('mods/shared.ini'),'same');
    assert.deepEqual(f.store.list('mod'),beforeMods);
    assert.deepEqual(f.store.list('transaction'),beforeTransactions);
  });

  test(`独立关联审查：预览后出现 ${corruption} 的启用所有权必须阻止新安装`,async t=>{
    const f=await profileFixture(t),upper=await f.install('upper',{'mods/shared.ini':'same'}),report=await f.pack('new',{'mods/shared.ini':'new'});
    const plan=await f.installer.plan(report,f.game),tx=f.store.get<Transaction>('transaction',upper.transactionId)!;
    assert.deepEqual(plan.blockers,[]);
    if(corruption==='missing')f.store.remove('transaction',upper.transactionId);
    else f.store.put('transaction',tx.id,{...tx,modId:'unrelated-valid-id'});
    const beforeMods=f.store.list('mod'),beforeTransactions=f.store.list('transaction');
    await assert.rejects(f.installer.install(plan,report,installApproval),/事务|所有权|记录/);
    assert.equal(f.read('mods/shared.ini'),'same');
    assert.deepEqual(f.store.list('mod'),beforeMods);
    assert.deepEqual(f.store.list('transaction'),beforeTransactions);
  });
}

test('独立关联审查：正常中断停用的启用记录仍可恢复，不能被所有权准入永久阻断',async t=>{
  const f=await profileFixture(t),mod=await f.install('two',{'mods/shared.ini':'two','mods/second.ini':'second'});
  let interrupted=false;
  f.installer.progress=(message)=>{if(!interrupted&&message.startsWith('正在恢复')){interrupted=true;f.setRunning(true);}};
  await assert.rejects(f.installer.disable(mod.id),/游戏仍在运行/);
  const pending=f.store.get<Transaction>('transaction',mod.transactionId)!;
  assert.equal(pending.state,'恢复待处理');
  assert.equal(f.store.get<ModRecord>('mod',mod.id)!.status,'已启用');
  assert.equal(pending.changes.filter(change=>change.applied).length,1);
  f.setRunning(false);f.installer.progress=()=>{};
  const result=await f.installer.recover();
  assert.ok(result.some(message=>message.includes('已回滚')));
  assert.equal(f.read('mods/shared.ini'),'original shared');
  assert.equal(f.store.get<Transaction>('transaction',mod.transactionId)!.state,'已回滚');
  assert.equal(f.store.get<ModRecord>('mod',mod.id)!.status,'已停用');
});

test('独立关联审查：最后一次安装写入后所有权丢失不能发布成功，新事务须保留待恢复',async t=>{
  const f=await profileFixture(t),upper=await f.install('upper',{'mods/shared.ini':'same'}),report=await f.pack('next',{'mods/shared.ini':'new'}),plan=await f.installer.plan(report,f.game);
  const oldTx=f.store.get<Transaction>('transaction',upper.transactionId)!;
  f.installer.progress=message=>{if(message.startsWith('正在写入'))f.store.put('transaction',oldTx.id,{...oldTx,modId:'externally-changed-owner'});};
  await assert.rejects(f.installer.install(plan,report,installApproval),/事务|所有权|记录/);
  assert.equal(f.store.get<ModRecord>('mod',report.id),undefined);
  const pending=f.store.list<Transaction>('transaction').find(tx=>tx.modId===report.id)!;
  assert.equal(pending.state,'恢复待处理');
  assert.equal(pending.changes[0].applied,true);
  f.store.put('transaction',oldTx.id,oldTx);f.installer.progress=()=>{};
  await f.installer.recover();
  assert.equal(f.read('mods/shared.ini'),'same');
  assert.equal(f.store.get<Transaction>('transaction',pending.id)!.state,'已回滚');
});

test('独立关联审查：最后一次恢复后所有权丢失不能把停用标为完成',async t=>{
  const f=await profileFixture(t),mod=await f.install('one',{'mods/shared.ini':'one'}),other=await f.install('other',{'mods/other.ini':'other'}),oldTx=f.store.get<Transaction>('transaction',other.transactionId)!;
  f.installer.progress=message=>{if(message.startsWith('正在恢复'))f.store.put('transaction',oldTx.id,{...oldTx,modId:'externally-changed-owner'});};
  await assert.rejects(f.installer.disable(mod.id),/事务|所有权|记录/);
  assert.equal(f.store.get<ModRecord>('mod',mod.id)!.status,'已启用');
  assert.equal(f.store.get<Transaction>('transaction',mod.transactionId)!.state,'恢复待处理');
  assert.equal(f.read('mods/shared.ini'),'original shared');
  f.store.put('transaction',oldTx.id,oldTx);f.installer.progress=()=>{};
  await f.installer.recover();
  assert.equal(f.store.get<ModRecord>('mod',mod.id)!.status,'已停用');
  assert.equal(f.store.get<Transaction>('transaction',mod.transactionId)!.state,'已回滚');
});
