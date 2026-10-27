// Only for UI stress fixtures: every record is produced by actual isolated file installation.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
const root=path.resolve(process.argv[2]||'');if(!root.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase()+path.sep)||!path.basename(root).startsWith('gems-ui-'))throw new Error('只允许专用临时 UI 夹具目录');
const store=await Store.open(root,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),backup=new Backup(path.join(root,'backup')),game=path.join(root,'fixture-game'),source=path.join(path.dirname(root),path.basename(root)+'-fixture-source');fs.mkdirSync(game,{recursive:true});fs.mkdirSync(source,{recursive:true});const installer=new Installer(store,backup,async()=>{});
for(let i=0;i<120;i++){const file=path.join(source,'vehicles.meta');fs.writeFileSync(file,`<CVehicleModelInfo__InitDataList><InitDatas><Item><modelName>gemsfixture${i}</modelName></Item></InitDatas></CVehicleModelInfo__InitDataList>`);fs.writeFileSync(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name:`隔离测试车辆记录 ${i} · 中文长名称检验`,files:[{source:'vehicles.meta',target:`mods/fixtures/vehicle${i}/vehicles.meta`}]}));const report=await scan(source,root);await installer.install(await installer.plan(report,game),report,{overwrite:false,binary:true});}store.close();console.log('已创建120个真实隔离事务的UI夹具；不代表游戏中的车辆。');
