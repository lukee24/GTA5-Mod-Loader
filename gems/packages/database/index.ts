import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, {type Database} from 'sql.js';
import {atomicWrite,noLinks} from '../core/security';
import {readDatabase,validateDatabase,MAX_DATABASE_BYTES} from './validation';
import {bytesHash,databaseFileHash,noDatabaseJournals} from './file-state';
export type DocumentChange={operation:'put';kind:string;id:string;value:unknown}|{operation:'remove';kind:string;id:string};
export const MAX_BATCH_CHANGES=128,MAX_BATCH_BYTES=16*1024**2;
export class Store {
  private constructor(public db:Database, public root:string,private reopen:(bytes:Uint8Array)=>Database,private expectedFileHash:string|null){}
  static async open(root:string,wasm:string){
    noLinks(path.parse(path.resolve(root)).root,root);fs.mkdirSync(root,{recursive:true});
    const file=path.join(root,'gems.sqlite');noLinks(root,file);
    noDatabaseJournals(root);
    const existing=fs.existsSync(file),bytes=existing?readDatabase(file):undefined;
    const SQL=await initSqlJs({locateFile:()=>wasm});let db:Database|undefined;
    try{
      db=new SQL.Database(bytes);
      if(existing)validateDatabase(db);
      else db.run('CREATE TABLE documents(kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE TABLE schema_version(version INTEGER NOT NULL); INSERT INTO schema_version VALUES(1);');
      db.run('PRAGMA foreign_keys=ON');
      const expectedHash=bytes?bytesHash(bytes):null;
      // WASM initialization yields: refuse new journals or a changed/deleted file
      // before exposing an old in-memory snapshot. This is not an OS file lock.
      noDatabaseJournals(root);
      if(existing&&databaseFileHash(root)!==expectedHash)throw new Error('打开数据库期间文件已被更改或移除，已停止打开并保留磁盘文件');
      const store=new Store(db,root,bytes=>new SQL.Database(bytes),expectedHash);
      // An existing database is validated read-only; never guess a migration or rewrite it on open.
      if(!existing)store.flush();return store;
    }catch(error){db?.close();throw error;}
  }
  get<T>(kind:string,id:string):T|undefined{const s=this.db.prepare('SELECT json FROM documents WHERE kind=? AND id=?');try{s.bind([kind,id]);return s.step()?JSON.parse(s.getAsObject().json as string):undefined;}finally{s.free();}}
  // Bound desktop settings before allocating/parsing JSON; malformed rows remain untouched.
  settingsRow(id:'main'|'window'){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=65536 THEN json ELSE NULL END AS json FROM documents WHERE kind='settings' AND id=?");
    try{s.bind([id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  sourceCount(){return Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='market-source'")[0]?.values[0][0]||0);}
  sourceRows(){
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=200 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=16384 THEN json ELSE NULL END AS json FROM documents WHERE kind='market-source' ORDER BY rowid DESC LIMIT 51");
    const rows:{id:string|null;json:string|null}[]=[];
    try{while(s.step()){const r=s.getAsObject();rows.push({id:r.id as string|null,json:r.json as string|null});}return{total:this.sourceCount(),rows};}finally{s.free();}
  }
  sourceRow(kind:'market-source'|'market-settings',id:string){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=16384 THEN json ELSE NULL END AS json FROM documents WHERE kind=? AND id=?");
    try{s.bind([kind,id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  list<T>(kind:string):T[]{const s=this.db.prepare('SELECT json FROM documents WHERE kind=? ORDER BY rowid DESC');const out:T[]=[];try{s.bind([kind]);while(s.step())out.push(JSON.parse(s.getAsObject().json as string));return out;}finally{s.free();}}
  recoveryRows(){
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='transaction'")[0]?.values[0][0]||0);
    if(total>10000)return{total,rows:[],limited:true};
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='transaction' ORDER BY rowid DESC LIMIT 10000");
    const rows:{id:string|null;json:string|null}[]=[];let bytes=0;
    try{while(s.step()){const r=s.getAsObject(),json=r.json as string|null;bytes+=typeof json==='string'?Buffer.byteLength(json):0;if(bytes>32*1024**2)return{total,rows:[],limited:true};rows.push({id:r.id as string|null,json});}return{total,rows,limited:false};}finally{s.free();}
  }
  recoveryRow(id:string){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='transaction' AND id=?");
    try{s.bind([id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  modRows(){
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='mod'")[0]?.values[0][0]||0);
    if(total>10000)return{total,rows:[],limited:true};
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='mod' ORDER BY rowid DESC LIMIT 10000");
    const rows:{id:string|null;json:string|null}[]=[];let bytes=0;
    try{while(s.step()){const r=s.getAsObject(),json=r.json as string|null;bytes+=typeof json==='string'?Buffer.byteLength(json):0;if(bytes>32*1024**2)return{total,rows:[],limited:true};rows.push({id:r.id as string|null,json});}return{total,rows,limited:false};}finally{s.free();}
  }
  modRow(id:string){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='mod' AND id=?");
    try{s.bind([id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  importRows(){
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='import'")[0]?.values[0][0]||0);
    if(total>10000)return{total,rows:[],limited:true};
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='import' ORDER BY rowid DESC LIMIT 10000");
    const rows:{id:string|null;json:string|null}[]=[];let bytes=0;
    try{while(s.step()){const r=s.getAsObject(),json=r.json as string|null;bytes+=typeof json==='string'?Buffer.byteLength(json):0;if(bytes>32*1024**2)return{total,rows:[],limited:true};rows.push({id:r.id as string|null,json});}return{total,rows,limited:false};}finally{s.free();}
  }
  importRow(id:string){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='import' AND id=?");
    try{s.bind([id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  snapshotRows(){
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='snapshot'")[0]?.values[0][0]||0);
    if(total>10000)return{total,rows:[],limited:true};
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='snapshot' ORDER BY rowid DESC LIMIT 10000");
    const rows:{id:string|null;json:string|null}[]=[];let bytes=0;
    try{while(s.step()){const r=s.getAsObject(),json=r.json as string|null;bytes+=typeof json==='string'?Buffer.byteLength(json):0;if(bytes>32*1024**2)return{total,rows:[],limited:true};rows.push({id:r.id as string|null,json});}return{total,rows,limited:false};}finally{s.free();}
  }
  snapshotRow(id:string){
    const s=this.db.prepare("SELECT CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=8388608 THEN json ELSE NULL END AS json FROM documents WHERE kind='snapshot' AND id=?");
    try{s.bind([id]);return s.step()?{json:s.getAsObject().json as string|null}:undefined;}finally{s.free();}
  }
  // Download admission bounds SQL row bytes before JSON parsing; keep malformed documents untouched.
  downloadRows(){
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='download'")[0]?.values[0][0]||0),limit=total>10000?200:10000;
    const statement=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=80 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=65536 THEN json ELSE NULL END AS json FROM documents WHERE kind='download' ORDER BY rowid DESC LIMIT ?");
    const rows:{id:string|null;json:string|null}[]=[];let bytes=0,truncated=false;
    try{statement.bind([limit]);while(statement.step()){const row=statement.getAsObject(),json=row.json as string|null;bytes+=typeof json==='string'?Buffer.byteLength(json):0;if(bytes>16*1024**2){truncated=true;break;}rows.push({id:row.id as string|null,json});}return{total,rows,truncated};}finally{statement.free();}
  }
  // Log input is bounded before parsing; an oversized/corrupt record must not break State.
  logRows(limit:number,maxBytes:number){
    if(!Number.isSafeInteger(limit)||limit<1||limit>1001||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>65536)throw new Error('日志读取范围无效');
    const total=Number(this.db.exec("SELECT COUNT(*) FROM documents WHERE kind='log'")[0]?.values[0][0]||0);
    const s=this.db.prepare("SELECT CASE WHEN typeof(id)='text' AND length(CAST(id AS BLOB))<=512 THEN id ELSE NULL END AS id,CASE WHEN typeof(json)='text' AND length(CAST(json AS BLOB))<=? THEN json ELSE NULL END AS json FROM documents WHERE kind='log' ORDER BY rowid DESC LIMIT ?");
    const rows:{id:string|null;json:string|null}[]=[];
    try{s.bind([maxBytes,limit]);while(s.step()){const row=s.getAsObject();rows.push({id:row.id as string|null,json:row.json as string|null});}return{total,rows};}finally{s.free();}
  }
  private commit(apply:()=>void){const before=this.db.export();try{apply();this.flush();}catch(error){this.db.close();this.db=this.reopen(before);throw error;}}
  private mutate(statement:string,args:string[]){this.commit(()=>{this.db.run(statement,args);});}
  put(kind:string,id:string,value:unknown){this.mutate('INSERT INTO documents(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json',[kind,id,JSON.stringify(value)]);}
  remove(kind:string,id:string){this.mutate('DELETE FROM documents WHERE kind=? AND id=?',[kind,id]);}
  /** Bounded document changes, validated before mutation; one SQL transaction and one file commit. */
  writeBatch(changes:ReadonlyArray<DocumentChange>){
    if(!Array.isArray(changes)||changes.length<1||changes.length>MAX_BATCH_CHANGES)throw new Error('批量数据库操作需要 1 至 128 项');
    // Capture identities/count before JSON serialization can invoke caller-owned hooks.
    const inputs:DocumentChange[]=changes.map(change=>{
      if(!change)throw new Error('批量数据库记录的类型或标识无效');
      const {operation,kind,id}=change;
      if(!['put','remove'].includes(operation)||[kind,id].some(key=>typeof key!=='string'||!key.length||key.length>1024||/[\x00-\x1f\x7f]/u.test(key)))throw new Error('批量数据库记录的类型或标识无效');
      return operation==='put'?{operation,kind,id,value:change.value}:{operation,kind,id};
    });
    const keys=new Set<string>(),statements:{sql:string;args:string[]}[]=[];let bytes=0;
    for(const change of inputs){
      const key=change.kind+'\0'+change.id;if(keys.has(key))throw new Error('批量数据库操作存在重复目标');keys.add(key);
      if(change.operation==='put'){
        const json=JSON.stringify(change.value);if(typeof json!=='string')throw new Error('批量记录不是可保存的 JSON');
        bytes+=Buffer.byteLength(json);if(bytes>MAX_BATCH_BYTES)throw new Error('批量数据库内容超过 16 MiB 上限');
        statements.push({sql:'INSERT INTO documents(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json',args:[change.kind,change.id,json]});
      }else statements.push({sql:'DELETE FROM documents WHERE kind=? AND id=?',args:[change.kind,change.id]});
    }
    this.commit(()=>{
      this.db.run('BEGIN IMMEDIATE');
      try{for(const statement of statements)this.db.run(statement.sql,statement.args);this.db.run('COMMIT');}
      catch(error){try{this.db.run('ROLLBACK');}catch{}throw error;}
    });
  }
  flush(){
    const check=()=>{noDatabaseJournals(this.root);if(databaseFileHash(this.root)!==this.expectedFileHash)throw new Error('数据库文件已被其他程序更改或移除，已停止保存并保留磁盘文件；请重启后重新核对');};
    check();const bytes=this.db.export();if(bytes.byteLength>MAX_DATABASE_BYTES)throw new Error('数据库超过 256 MiB 安全上限，未保存此操作');
    atomicWrite(path.join(this.root,'gems.sqlite'),bytes,check);this.expectedFileHash=bytesHash(bytes);
  }
  log(kind:string,message:string){const file=path.join(this.root,'operations.jsonl');noLinks(this.root,file);if(fs.existsSync(file)&&fs.lstatSync(file).nlink>1)throw new Error('拒绝向日志硬链接追加内容');const id=crypto.randomUUID();const entry={id,time:new Date().toISOString(),kind,message};this.put('log',id,entry);noLinks(this.root,file);fs.appendFileSync(file,JSON.stringify(entry)+'\n');}
  logFailure(kind:string,message:string){const file=path.join(this.root,'operations.jsonl');noLinks(this.root,file);if(fs.existsSync(file)&&fs.lstatSync(file).nlink>1)throw new Error('拒绝向日志硬链接追加内容');fs.appendFileSync(file,JSON.stringify({id:crypto.randomUUID(),time:new Date().toISOString(),kind,message,scope:'数据库未保存，仅文件日志'})+'\n');}
  close(){try{this.flush();}finally{this.db.close();}}
}
