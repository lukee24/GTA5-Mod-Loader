// Only a dedicated test child: exit after an actual database rename, without orderly shutdown.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {PassThrough} from 'node:stream';import type {IncomingMessage} from 'node:http';import {Store} from '../packages/database';import {Downloads} from '../packages/marketplace/downloads';
const root=path.resolve(process.argv[2]||'');if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-download-atomic-'))throw new Error('仅允许独立临时中断测试目录');
const payload=fs.readFileSync(path.join(root,'fixture.zip')),store=await Store.open(root,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm')),file=path.join(root,'gems.sqlite'),rename=fs.renameSync;
fs.renameSync=((from:any,to:any)=>{rename(from,to);if(String(to)===file&&store.list('import').length)process.exit(73);}) as typeof fs.renameSync;
const queue=new Downloads(store,root,()=>{},async()=>{const stream=new PassThrough();Object.assign(stream,{headers:{'content-length':String(payload.length)},statusCode:200});queueMicrotask(()=>stream.end(payload));return stream as unknown as IncomingMessage;});
queue.add({name:'中断隔离包.zip',pageUrl:'https://github.com/fixture-author/gems-fixture/releases/tag/v1',downloadUrl:'https://github.com/fixture-author/gems-fixture/releases/download/v1/fixture.zip',size:payload.length,digest:null});
setTimeout(()=>process.exit(74),8000);
