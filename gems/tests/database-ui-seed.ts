import path from 'node:path';import os from 'node:os';import fs from 'node:fs';import initSqlJs from 'sql.js';
const root=path.resolve(process.argv[2]||''),mode=process.argv[3];
if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-db-ui-')||!['ambiguous','missing','normal'].includes(mode))throw new Error('数据库测试目录或场景无效');
fs.mkdirSync(path.join(root,'data'));const SQL=await initSqlJs({locateFile:()=>path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')}),db=new SQL.Database();
try{db.run('CREATE TABLE documents(kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,id));');
if(mode!=='missing'){db.run('CREATE TABLE schema_version(version INTEGER NOT NULL);INSERT INTO schema_version VALUES(1);');if(mode==='ambiguous')db.run('INSERT INTO schema_version VALUES(2)');}
db.run('INSERT INTO documents VALUES(?,?,?)',['settings','main',JSON.stringify({gamePath:'',theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true})]);
fs.writeFileSync(path.join(root,'data/gems.sqlite'),db.export());}finally{db.close();}
