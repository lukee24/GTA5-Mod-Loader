import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {Store} from '../packages/database';import {saveImport} from '../packages/scanner/import-records';
import type {ImportReport,ModRecord,Transaction} from '../packages/core/types';
export const xml=(name='gems_ped_test')=>`<CPedModelInfo__InitDataList><InitDatas><Item><Name>${name}</Name><Pedtype>CIVMALE</Pedtype></Item></InitDatas></CPedModelInfo__InitDataList>`;
export async function fixture(){
  const root=fs.mkdtempSync(path.join(path.resolve(os.tmpdir()),'gems-ped-')),data=path.join(root,'数据 缓存'),game=path.join(root,'游戏 Enhanced');fs.mkdirSync(data);fs.mkdirSync(game);fs.writeFileSync(path.join(game,'GTA5_Enhanced.exe'),'synthetic executable marker; never launched');
  const cleanup=()=>{const target=path.resolve(root),base=path.resolve(os.tmpdir());if(!target.startsWith(base+path.sep)||!path.basename(target).startsWith('gems-ped-'))throw new Error('Unsafe fixture cleanup');fs.rmSync(target,{recursive:true,force:true});};
  let store:Store;try{store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));}catch(error){cleanup();throw error;}
  const add=(id='ped-a',content=xml(),kind:'mod'|'import'='mod')=>{
    const folder=path.join(data,'imports',id);fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,'peds.meta');fs.writeFileSync(file,content);const hash=crypto.createHash('sha256').update(content).digest('hex');
    const report:ImportReport={id,name:'测试人物 '+id,original:path.join(root,id),created:'2026-10-27T00:00:00.000Z',categories:['人物'],files:[{path:'peds.meta',source:file,size:Buffer.byteLength(content),hash,binary:false,target:'mods/'+id+'/peds.meta'}],warnings:[],blockers:[],readme:'',method:'测试明确映射',compatibility:'未实测',spawnNames:[],dlcNames:[]};
    saveImport(store,report);
    if(kind==='mod'){const target=path.join(game,'mods',id,'peds.meta');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);const tx:Transaction={id:'tx-'+id,name:report.name,modId:id,gamePath:game,created:report.created,state:'已完成',changes:[{target:report.files[0].target!,before:null,after:hash,applied:true}]};const mod:ModRecord={id,report,transactionId:tx.id,status:'已启用',installed:report.created,bytes:Buffer.byteLength(content)};store.writeBatch([{operation:'put',kind:'mod',id,value:mod},{operation:'put',kind:'transaction',id:tx.id,value:tx}]);}
    return report;
  };
  const close=()=>{try{store.close();}finally{cleanup();}};return{root,data,game,store,add,close};
}
