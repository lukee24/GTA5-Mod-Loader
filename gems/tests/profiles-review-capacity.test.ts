import test from 'node:test';
import assert from 'node:assert/strict';
import type {DocumentChange} from '../packages/database';
import {profileFixture,approval} from './profile-fixture';

test('独立审查：42层保留恰含128条最终提交；43层超过边界在修改文件前拒绝且不截断',async t=>{
  const f=await profileFixture(t),mods=[];
  for(let i=0;i<42;i++)mods.push(await f.install('m'+i,{['mods/m'+i+'.ini']:'payload-'+i}));
  const p=f.create('full42',mods.map(m=>m.id)),plan=await f.profiles.planSwitch(p.id);
  assert.deepEqual(plan.blockers,[]);
  const original=f.store.writeBatch.bind(f.store),batches:ReadonlyArray<DocumentChange>[]=[];
  f.store.writeBatch=(changes)=>{batches.push(structuredClone(changes));original(changes);};
  await f.profiles.execute(plan.id,approval);
  assert.equal(batches.at(-1)!.length,128);
  assert.equal(batches.at(-1)!.filter(c=>c.kind==='profile-active').length,1);
  assert.equal(batches.at(-1)!.filter(c=>c.kind==='profile-switch').length,1);
  for(let i=0;i<42;i++)assert.equal(f.read('mods/m'+i+'.ini'),'payload-'+i);
  const extra=await f.install('m42',{'mods/m42.ini':'payload-42'}),larger=f.create('full43',[...mods.map(m=>m.id),extra.id]);
  const tooLarge=await f.profiles.planSwitch(larger.id),journals=f.store.list('profile-switch');
  assert.equal(tooLarge.actions.length,43);assert.ok(tooLarge.blockers.some(x=>x.includes('128')));
  await assert.rejects(f.profiles.execute(tooLarge.id,approval),/128/);
  assert.deepEqual(f.store.list('profile-switch'),journals);
  for(let i=0;i<43;i++)assert.equal(f.read('mods/m'+i+'.ini'),'payload-'+i);
});
