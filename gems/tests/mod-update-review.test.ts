import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
import type {ModRecord, Transaction} from '../packages/core/types';
import {noLinks} from '../packages/core/security';

const approved = {overwrite: true, binary: true};
async function fixture(t: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-update-review-'));
  const game = path.join(root, '中文 game'), data = path.join(root, 'data');
  fs.mkdirSync(path.join(game, 'mods'), {recursive: true});
  const target = path.join(game, 'mods/config.ini'); fs.writeFileSync(target, 'user baseline');
  const store = await Store.open(data, path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const installer = new Installer(store, new Backup(path.join(data, 'backup')), async () => {});
  async function pack(name: string, value: string) {
    const source = path.join(root, name); fs.mkdirSync(path.join(source, 'mods'), {recursive: true});
    fs.writeFileSync(path.join(source, 'mods/config.ini'), value); return scan(source, data);
  }
  const first = await pack('v1', 'old version'), second = await pack('v2', 'new version');
  const mod = await installer.install(await installer.plan(first, game), first, approved);
  t.after(() => {
    store.db.close(); const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('gems-update-review-'));
    noLinks(path.parse(resolved).root, resolved); fs.rmSync(resolved, {recursive: true, force: true});
  });
  return {root, game, store, installer, mod, second, target};
}

test('更新执行期规范化等价游戏目录的待处理事务不能绕过冲突门禁', async t => {
  const f = await fixture(t), plan = await f.installer.planUpdate(f.mod.id, f.second);
  const previous = f.store.get<Transaction>('transaction', f.mod.transactionId)!;
  let injected = false;
  f.installer.guard = async () => {
    if (injected || !f.store.list<Transaction>('transaction').some(tx => tx.operation === 'update' && tx.state === '准备中')) return;
    injected = true;
    const pending: Transaction = {id: crypto.randomUUID(), modId: 'other-update', name: 'pending same directory',
      gamePath: f.game + path.sep, created: new Date().toISOString(), state: '准备中',
      changes: previous.changes.map(change => ({...change, before: change.after, applied: false}))};
    f.store.put('transaction', pending.id, pending);
  };
  await assert.rejects(f.installer.update(plan, f.second, approved), /另一未完成事务/u);
  assert.equal(injected, true);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'old version');
  assert.equal(f.store.get<ModRecord>('mod', f.mod.id)!.transactionId, f.mod.transactionId);
  assert.equal(f.store.get<Transaction>('transaction', f.mod.transactionId)!.state, '已完成');
});

test('更新执行期不同游戏目录的同名目标不会误报冲突', async t => {
  const f = await fixture(t), plan = await f.installer.planUpdate(f.mod.id, f.second);
  const previous = f.store.get<Transaction>('transaction', f.mod.transactionId)!;
  let injected = false;
  f.installer.guard = async () => {
    if (injected || !f.store.list<Transaction>('transaction').some(tx => tx.operation === 'update' && tx.state === '准备中')) return;
    injected = true;
    const pending: Transaction = {id: crypto.randomUUID(), modId: 'other-game', name: 'pending different directory',
      gamePath: path.join(f.root, 'other game'), created: new Date().toISOString(), state: '准备中',
      changes: previous.changes.map(change => ({...change, before: change.after, applied: false}))};
    f.store.put('transaction', pending.id, pending);
  };
  await f.installer.update(plan, f.second, approved);
  assert.equal(injected, true); assert.equal(fs.readFileSync(f.target, 'utf8'), 'new version');
  await f.installer.disable(f.mod.id, true);
  assert.equal(fs.readFileSync(f.target, 'utf8'), 'user baseline');
});
