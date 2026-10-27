import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {Store} from '../packages/database';
const root=path.resolve(process.argv[2]||''),mode=process.argv[3];if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-download-admission-ui-')||!['null','json','atomic','normal','onlybad'].includes(mode))throw new Error('下载准入测试范围无效');
const store=await Store.open(path.join(root,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
try{
 store.put('settings','main',{gamePath:'',theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true});
 if(mode==='null'||mode==='onlybad')store.put('download','broken',null);if(mode==='json'){store.db.run('INSERT INTO documents VALUES(?,?,?)',['download','broken','{broken']);store.flush();}
 if(mode!=='onlybad')for(const id of ['first','second'])store.put('download',id,{id,name:id+'.zip',sourceUrl:'https://github.com/fixture-author/mod/releases/tag/v1',created:new Date().toISOString(),status:'下载中',received:10,size:100,extra:{note:'历史字段原样保留'}});
 if(mode==='atomic'){store.db.run("CREATE TRIGGER fixture_recovery_denied BEFORE INSERT ON documents WHEN NEW.kind='download' AND NEW.id='first' AND json_extract(NEW.json,'$.status')='已中断' BEGIN SELECT RAISE(ABORT,'隔离中断整理拒绝'); END;");store.flush();}
 const rows=store.db.exec("SELECT id,json FROM documents WHERE kind='download' ORDER BY id")[0].values;fs.writeFileSync(path.join(root,'baseline.json'),JSON.stringify(rows));const source=path.join(root,'source','mods');fs.mkdirSync(source,{recursive:true});fs.writeFileSync(path.join(source,'admission.ini'),'value=1');
}finally{store.close();}
