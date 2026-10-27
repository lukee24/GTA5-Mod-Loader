import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {Store} from '../packages/database';import {Installer} from '../packages/installer';import {Backup} from '../packages/backup';import {scan} from '../packages/scanner';import type {Transaction} from '../packages/core/types';
const root=path.resolve(process.argv[2]||'');if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-db-ui-'))throw new Error('日志故障桌面夹具目录无效');
const data=path.join(root,'data'),game=path.join(root,'offline-fixture-game'),source=path.join(root,'source');fs.mkdirSync(game);fs.mkdirSync(source);fs.writeFileSync(path.join(source,'config.ini'),'隔离文件，不代表游戏加载');fs.writeFileSync(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name:'隔离文件安装记录（不代表游戏）',files:[{source:'config.ini',target:'mods/config.ini'}]}));
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));store.put('settings','main',{gamePath:'',theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true});
// Offline seed only: create real files/backup/SQL.js records. The desktop itself uses
// its unchanged production guard and refuses recovery in this invalid game directory.
const installer=new Installer(store,new Backup(path.join(data,'backup')),async()=>{}),report=await scan(source,data),record=await installer.install(await installer.plan(report,game),report,{overwrite:false,binary:false}),tx=store.get<Transaction>('transaction',record.transactionId)!;
tx.state='恢复待处理';store.put('transaction',tx.id,tx);store.close();
fs.unlinkSync(path.join(data,'operations.jsonl'));fs.writeFileSync(path.join(root,'protected.txt'),'不应被日志追加的私人文件');fs.linkSync(path.join(root,'protected.txt'),path.join(data,'operations.jsonl'));
