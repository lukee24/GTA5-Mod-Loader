import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {Store} from '../packages/database';import {Backup} from '../packages/backup';import {Installer} from '../packages/installer';import {Profiles} from '../packages/profiles';import {scan} from '../packages/scanner';
export const approval={confirmed:true,binary:true},installApproval={overwrite:true,binary:true};
export async function profileFixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-profile-')),game=path.join(root,'中文 game'),data=path.join(root,'data');fs.mkdirSync(path.join(game,'mods'),{recursive:true});
 const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),backup=new Backup(path.join(data,'backup'));let selectedGame=game,running=false;
 const guard=async()=>{if(running)throw new Error('游戏仍在运行或状态未知');};const installer=new Installer(store,backup,guard),profiles=new Profiles(installer,()=>selectedGame,guard);
 const put=(target:string,text:string)=>{const file=path.join(game,target);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);};const read=(target:string)=>fs.readFileSync(path.join(game,target),'utf8');
 async function pack(name:string,files:Record<string,string>){const source=path.join(root,name);fs.mkdirSync(source);const entries=[];for(const [i,[target,text]]of Object.entries(files).entries()){const file='source-'+i+'.ini';fs.writeFileSync(path.join(source,file),text);entries.push({source:file,target});}fs.writeFileSync(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name,version:name,files:entries}));return scan(source,data);}
 async function install(name:string,files:Record<string,string>){const report=await pack(name,files);return installer.install(await installer.plan(report,game),report,installApproval);}
 const create=(name:string,modIds:string[])=>profiles.create({name,gamePath:game,modIds});
 const activate=async(id:string)=>profiles.execute((await profiles.planSwitch(id)).id,approval);
 put('mods/shared.ini','original shared');put('mods/private.ini','user unowned');
 t.after(()=>{store.db.close();assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-profile-'));fs.rmSync(root,{recursive:true,force:true});});
 return{root,game,data,store,backup,installer,profiles,guard,put,read,pack,install,create,activate,setGame:(value:string)=>{selectedGame=value;},setRunning:(value:boolean)=>{running=value;}};
}
