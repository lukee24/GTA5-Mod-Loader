import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
import {guardGame} from '../packages/diagnostics';
import {noLinks} from '../packages/core/security';
import type {Transaction} from '../packages/core/types';

const data=path.resolve(process.argv[2]||'');
if(path.dirname(data).toLowerCase()!==path.resolve(os.tmpdir()).toLowerCase()||!path.basename(data).startsWith('gems-ui-'))throw new Error('仅允许本次 UI 临时数据目录');
noLinks(os.tmpdir(),data);const game=path.join(data,'fixture-game');
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
try{
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'gems-recovery-fixture-'));fs.mkdirSync(path.join(source,'mods'));fs.writeFileSync(path.join(source,'mods/recovery.ini'),'recovery fixture');
 const report=await scan(source,data);report.name='隔离中断恢复测试';
 const installer=new Installer(store,new Backup(path.join(data,'backup')),guardGame);
 const mod=await installer.install(await installer.plan(report,game),report,{overwrite:false,binary:false});
 const tx=store.get<Transaction>('transaction',mod.transactionId)!;
 // 使用真实安装事务模拟进程在恢复中断退出；外部修改必须保留并显示待处理。
 tx.state='恢复待处理';store.put('transaction',tx.id,tx);fs.writeFileSync(path.join(game,'mods/recovery.ini'),'external edit');
 console.log('已建立真实隔离安装事务的中断恢复夹具；不修改实际游戏。');
}finally{store.close();}
