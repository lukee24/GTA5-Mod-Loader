// Private test child: parent kills this process at a durable transaction boundary.
import fs from 'node:fs';import path from 'node:path';
import {Store} from '../packages/database';import {Backup} from '../packages/backup';import {Installer} from '../packages/installer';import {Profiles} from '../packages/profiles';import {scan} from '../packages/scanner';
const [root,mode]=process.argv.slice(2);if(!root||!path.isAbsolute(root)||!path.basename(root).startsWith('gems-profile-crash-')||!['before-file','first-file','before-commit','after-commit'].includes(mode))throw new Error('invalid crash fixture');
const game=path.join(root,'game'),data=path.join(root,'data');fs.mkdirSync(path.join(game,'mods'),{recursive:true});fs.writeFileSync(path.join(game,'mods/shared.ini'),'original');fs.writeFileSync(path.join(game,'mods/private.ini'),'untouched');
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),backup=new Backup(path.join(data,'backup')),guard=async()=>{},installer=new Installer(store,backup,guard),profiles=new Profiles(installer,()=>game,guard);
async function install(name:string,files:Record<string,string>){const source=path.join(root,name);fs.mkdirSync(source);const entries=[];for(const [i,[target,text]]of Object.entries(files).entries()){const file=i+'.ini';fs.writeFileSync(path.join(source,file),text);entries.push({source:file,target});}fs.writeFileSync(path.join(source,'gems.mod.json'),JSON.stringify({format:1,name,files:entries}));const report=await scan(source,data);return installer.install(await installer.plan(report,game),report,{overwrite:true,binary:true});}
await install('A',{'mods/a.ini':'a','mods/shared.ini':'A'});await install('B',{'mods/b.ini':'b'});const p=profiles.create({name:'empty',gamePath:game,modIds:[]}),plan=await profiles.planSwitch(p.id);
fs.writeFileSync(path.join(root,'before.json'),JSON.stringify({mods:store.list('mod'),transactions:store.list('transaction'),profileId:p.id}));
function boundary():never{fs.writeSync(1,'PROFILE_BOUNDARY\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);throw new Error('unexpected wakeup');}
const put=store.put.bind(store);store.put=(kind,id,value)=>{put(kind,id,value);if(mode==='before-file'&&kind==='profile-switch'&&(value as any).files.some((f:any)=>f.applied))boundary();};
installer.progress=message=>{if(mode==='first-file'&&message.startsWith('正在切换'))boundary();};
const batch=store.writeBatch.bind(store);store.writeBatch=changes=>{if(mode==='before-commit')boundary();batch(changes);if(mode==='after-commit')boundary();};
await profiles.execute(plan.id,{confirmed:true,binary:true});throw new Error('parent did not interrupt expected boundary');
