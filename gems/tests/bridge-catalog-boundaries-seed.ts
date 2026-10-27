import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {Store} from '../packages/database';
import {validateModRecord,readMods} from '../packages/installer/mod-records';
import {validateRecoveryTransaction} from '../packages/installer/recovery-records';
import {assertEnabledOwnership} from '../packages/installer/ownership-integrity';
import type {ModRecord,Transaction} from '../packages/core/types';

const root=path.resolve(process.argv[2]),mode=process.argv[3],action=process.argv[4]||'seed';
assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-bridge-boundaries-'));
const data=path.join(root,'data'),wasm=path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
function mod(id:string,name:string,spawnNames:string[]):ModRecord{return{id,transactionId:'fixture-tx',status:'已启用',installed:'2026-10-27T00:00:00.000Z',bytes:0,metadata:{brand:'品'.repeat(80)},report:{id,name,original:path.join(root,'not-installed-source'),created:'2026-10-27T00:00:00.000Z',categories:['车辆'],files:[],warnings:[],blockers:[],readme:'',method:'validated record fixture, not installed',compatibility:'未验证',spawnNames,dlcNames:[]}};}
if(action==='seed'){
 assert.ok(['long','compact','duplicate','count','bytes'].includes(mode));assert.equal(fs.existsSync(path.join(data,'gems.sqlite')),false);
 let mods:ModRecord[];
 if(mode==='long')mods=[mod('i'.repeat(80),'车'.repeat(300),['m'.repeat(64)])];
 else if(mode==='duplicate')mods=[mod('first','重复包甲',['shared']),mod('second','重复包乙',['SHARED'])];
 else mods=[mod('i'.repeat(80),'车'.repeat(mode==='bytes'?200:mode==='compact'?180:4),Array.from({length:mode==='count'?2001:2000},(_,i)=>'model_'+i))];
 const store=await Store.open(data,wasm);
 const transactions:Transaction[]=mods.map((item,index)=>{item.transactionId='fixture-tx-'+index;return{id:item.transactionId,modId:item.id,name:item.report.name,gamePath:path.join(root,'unbound-synthetic-game'),created:item.installed,state:'已完成',changes:[{target:'mods/fixture-'+index+'.ini',before:null,after:'a'.repeat(64),applied:true}]};});
 try{for(const item of mods){validateModRecord(item.id,item);store.put('mod',item.id,item);}for(const tx of transactions){validateRecoveryTransaction(tx.id,tx);store.put('transaction',tx.id,tx);}assertEnabledOwnership(mods,transactions);assert.equal(readMods(store).length,mods.length);}finally{store.close();}
 fs.writeFileSync(path.join(root,'fixture.json'),JSON.stringify({root,data,mode,mods,transactions,scope:'合法ModRecord与匹配事务直接播种；事务是合成记录，没有执行安装或创建受管文件/绑定游戏路径，不代表真实模组安装'}));
 console.log(JSON.stringify({mode,records:mods.length,spawnReferences:mods.reduce((sum,item)=>sum+item.report.spawnNames.length,0),validated:true}));
}else{
 assert.equal(action,'inspect');assert.equal(JSON.parse(fs.readFileSync(path.join(root,'fixture.json'),'utf8')).mode,mode);
 const store=await Store.open(data,wasm);
 try{
  const mods=readMods(store),rows=store.db.exec("SELECT kind,id,json FROM documents WHERE kind<>'log' AND NOT(kind='settings' AND id='window') ORDER BY kind,id")[0]?.values||[];
  const logs=store.list<{kind:string;message:string}>('log');
  console.log(JSON.stringify({records:mods.length,modSha256:crypto.createHash('sha256').update(JSON.stringify(mods)).digest('hex'),nonLogSha256:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),logs:logs.map(({kind,message})=>({kind,message}))}));
 }finally{store.db.close();} // Independent read only; do not rewrite an open application's database.
}
