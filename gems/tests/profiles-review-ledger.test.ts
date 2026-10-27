import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type {ModRecord} from '../packages/core/types';
import {digest} from '../packages/profiles/planning';
import {profileFixture,approval} from './profile-fixture';

test('独立审查：启用覆盖层丢失事务时，空方案必须阻止改写仍被该层拥有的同内容目标',async t=>{
  const f=await profileFixture(t);
  await f.install('lower',{'mods/shared.ini':'same'});
  const upper=await f.install('upper',{'mods/shared.ini':'same'}),off=f.create('off',[]);
  f.store.remove('transaction',upper.transactionId);
  const plan=await f.profiles.planSwitch(off.id);
  assert.ok(plan.blockers.length>0,'缺失上层事务不能让启用模组从所有权目录中被静默遗漏');
  await assert.rejects(f.profiles.execute(plan.id,approval));
  assert.equal(f.read('mods/shared.ini'),'same');
  assert.equal(f.store.get<ModRecord>('mod',upper.id)!.status,'已启用');
  assert.equal(f.store.list('profile-switch').length,0);
});

test('独立审查：无法读取的active记录不能被方案切换覆盖并绕过准入',async t=>{
  const f=await profileFixture(t);await f.install('one',{'mods/shared.ini':'one'});
  const off=f.create('off',[]),key=digest(path.resolve(f.game).toLowerCase());
  const corrupted={profileId:off.id,gamePath:f.game,switchId:'broken',unexpected:true};
  f.store.put('profile-active',key,corrupted);
  assert.throws(()=>f.profiles.state(),/配置方案记录/);
  await assert.rejects(async()=>{const plan=await f.profiles.planSwitch(off.id);await f.profiles.execute(plan.id,approval);},/配置方案记录/);
  assert.equal(f.read('mods/shared.ini'),'one');
  assert.deepEqual(f.store.get('profile-active',key),corrupted);
});

test('独立审查：先前普通停用的完整共享恢复链仍可切换到只启用上层的方案',async t=>{
  const f=await profileFixture(t),a=await f.install('A',{'mods/shared.ini':'A'}),b=await f.install('B',{'mods/shared.ini':'B'});
  const onlyB=f.create('B only',[b.id]);
  await f.installer.disable(b.id);await f.installer.disable(a.id);
  assert.equal(f.read('mods/shared.ini'),'original shared');
  const plan=await f.profiles.planSwitch(onlyB.id);
  assert.deepEqual(plan.blockers,[],'完整且未被外部修改的原始基线应可由既有恢复链确认');
  await f.profiles.execute(plan.id,approval);
  assert.equal(f.read('mods/shared.ini'),'B');
  await f.installer.disable(b.id);
  assert.equal(f.read('mods/shared.ini'),'original shared');
});

test('独立审查：全部正常停用后外部改成历史中间层字节，不能把它重新认作原始基线',async t=>{
  const f=await profileFixture(t),a=await f.install('A',{'mods/shared.ini':'A'}),b=await f.install('B',{'mods/shared.ini':'B'}),onlyB=f.create('B only',[b.id]);
  await f.installer.disable(b.id);await f.installer.disable(a.id);
  assert.equal(f.read('mods/shared.ini'),'original shared');
  f.put('mods/shared.ini','A');
  const plan=await f.profiles.planSwitch(onlyB.id);
  assert.ok(plan.blockers.length>0,'历史中间层哈希相同并不代表完整停用后的基线没有被外部更改');
  await assert.rejects(f.profiles.execute(plan.id,approval));
  assert.equal(f.read('mods/shared.ini'),'A');
  assert.equal(f.store.list('profile-switch').length,0);
});
