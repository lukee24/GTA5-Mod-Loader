// Invoked only by update-process-recovery.test.ts, with its fresh temporary root.
import fs from 'node:fs';
import path from 'node:path';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
const [base,stage]=process.argv.slice(2);
if(!base||!path.isAbsolute(base)||!path.basename(base).startsWith('gems-update-crash-')||!['partial','removal','before-commit','after-commit'].includes(stage))throw new Error('Invalid fixture invocation');
const game=path.join(base,'game'),data=path.join(base,'data');fs.mkdirSync(path.join(game,'mods'),{recursive:true});
const write=(relative:string,text:string)=>fs.writeFileSync(path.join(game,relative),text);
write('mods/shared.ini','user original');write('mods/unrelated.ini','other mod original');
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
const installer=new Installer(store,new Backup(path.join(data,'backup')),async()=>{});
async function pack(name:string,files:Record<string,string>){const dir=path.join(base,name);fs.mkdirSync(dir);const entries=Object.entries(files).map(([target,text],i)=>{const source=`${i}.ini`;fs.writeFileSync(path.join(dir,source),text);return{source,target};});fs.writeFileSync(path.join(dir,'gems.mod.json'),JSON.stringify({format:1,name,files:entries}));return scan(dir,data);}
const first=await pack('old-version',{'mods/shared.ini':'old shared','mods/removed.ini':'old only'});
const initial=await installer.install(await installer.plan(first,game),first,{overwrite:true,binary:true});
const second=await pack('new-version',{'mods/shared.ini':'new shared','mods/new.ini':'new only'});
const plan=await installer.planUpdate(initial.id,second);
fs.writeFileSync(path.join(base,'identity.json'),JSON.stringify({modId:initial.id,oldTransaction:initial.transactionId}));
function pause(){fs.writeFileSync(path.join(base,'checkpoint'),stage);Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);}
installer.progress=(message)=>{if((stage==='partial'&&message==='正在更新并校验 mods/shared.ini')||(stage==='removal'&&message==='正在更新并校验 mods/removed.ini'))pause();};
const commit=store.writeBatch.bind(store);store.writeBatch=changes=>{if(stage==='before-commit')pause();commit(changes);if(stage==='after-commit')pause();};
await installer.update(plan,second,{overwrite:true,binary:true});
throw new Error('Fixture missed checkpoint');
