import path from 'node:path';import os from 'node:os';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {Store} from '../packages/database';
const root=path.resolve(process.argv[2]||'');if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-log-ui-'))throw new Error('日志测试目录无效');
const store=await Store.open(path.join(root,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
if(process.argv[3]==='append'){try{store.logFailure('日志','外部文件追加刷新夹具');}finally{store.db.close();}}
else{
store.put('settings','main',{gamePath:'',theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true});store.log('扫描','隔离日志夹具：正常日志双写');
// Cause an actual refused close through an independent native SQLite commit.
const native=new DatabaseSync(path.join(root,'data/gems.sqlite'));native.prepare('INSERT INTO documents VALUES(?,?,?)').run('external','log-evidence',JSON.stringify({value:'实际外部提交'}));native.close();
try{store.close();throw new Error('应拒绝旧数据库保存');}catch(error){if(!(error instanceof Error)||!error.message.includes('数据库文件已被其他程序更改'))throw error;store.logFailure('退出','退出保存失败：'+error.message);}
fs.appendFileSync(path.join(root,'data/operations.jsonl'),'not valid JSON\n');
}
