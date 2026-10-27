import {_electron as electron} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-shutdown-review-')),data=path.join(root,'data'),source=path.join(root,'package');fs.mkdirSync(path.join(source,'mods'),{recursive:true});for(let i=0;i<12;i++)fs.writeFileSync(path.join(source,'mods',i+'.dat'),Buffer.alloc(4*1024**2,65+i));
let app;try{
 app=await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});const page=await app.firstWindow();await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
 const exit=new Promise(resolve=>app.process().once('exit',resolve));const imported=page.evaluate(source=>window.gems.call('import',{paths:[source]}),source).catch(()=>null);
 const until=Date.now()+10000;while(!fs.existsSync(path.join(data,'imports'))&&Date.now()<until)await new Promise(r=>setTimeout(r,5));assert.ok(fs.existsSync(path.join(data,'imports')),'真实扫描尚未开始');
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close()).catch(()=>{});await Promise.race([exit,new Promise((_,reject)=>setTimeout(()=>reject(Error('退出收尾超过 30 秒')),30000).unref())]);await imported;
 const SQL=await initSqlJs(),db=new SQL.Database(fs.readFileSync(path.join(data,'gems.sqlite')));const records=db.exec("SELECT json FROM documents WHERE kind='import'");const count=records[0]?.values.length||0;assert.equal(count,1,'关闭窗口中断扫描，报告未持久化');const report=JSON.parse(records[0].values[0][0]);assert.equal(report.files.length,12);assert.equal(db.exec("SELECT json FROM documents WHERE kind='mod'").length,0);db.close();
 const evidence={checked:new Date().toISOString(),realElectronWindowClose:'passed',actualFileCount:12,actualBytes:48*1024**2,reportPersisted:true,automaticGameWrite:false};fs.writeFileSync('artifacts/shutdown-ui-current.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence,null,2));
}finally{if(app)await app.close().catch(()=>{});assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-shutdown-review-'));fs.rmSync(root,{recursive:true});}
