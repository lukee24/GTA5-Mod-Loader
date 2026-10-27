import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../packages/database';
import {Backup} from '../packages/backup';
import {Installer} from '../packages/installer';
import {scan} from '../packages/scanner';
import {noLinks} from '../packages/core/security';

const [base,stage] = process.argv.slice(2);
if (!base || path.dirname(path.resolve(base)) !== path.resolve(os.tmpdir()) || !path.basename(base).startsWith('gems-process-crash-')) throw new Error('仅允许专用临时夹具目录。');
noLinks(path.parse(base).root,base);
const game=path.join(base,'game'),data=path.join(base,'data'),source=path.join(base,'package');
fs.mkdirSync(path.join(game,'mods'),{recursive:true});
fs.mkdirSync(path.join(source,'mods'),{recursive:true});
for(let i=0;i<4;i++){
  fs.writeFileSync(path.join(game,'mods',`file-${i}.ini`),'原配置 '+i);
  fs.writeFileSync(path.join(source,'mods',`file-${i}.ini`),'新配置 '+i);
}
const store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
const backup=new Backup(path.join(data,'backup'));
// 普通文件安装后端完整运行；这是隔离目录，不调用真实游戏进程。
const installer=new Installer(store,backup,async()=>{});
const report=await scan(source,data);
if(stage==='reenable-commit'){
  await installer.install(await installer.plan(report,game),report,{overwrite:true,binary:true});
  await installer.disable(report.id);
}
function checkpoint(){
  fs.writeFileSync(path.join(base,'checkpoint'),'已完成实际写入，等待父测试终止本子进程');
  // 暂停在确切边界，父测试发送真正的进程终止；不抛异常、不执行 finally 回滚。
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
}
if(stage==='partial-write')installer.progress=(_,current)=>{if(current===1)checkpoint();};
else{
  const put=store.put.bind(store);
  store.put=(kind,id,value)=>{put(kind,id,value);if(kind==='transaction'&&(value as {state?:string}).state==='已完成')checkpoint();};
}
if(stage==='reenable-commit')await installer.enable(report.id,{overwrite:true,binary:true});
else await installer.install(await installer.plan(report,game),report,{overwrite:true,binary:true});
throw new Error('测试未到达中断边界。');
