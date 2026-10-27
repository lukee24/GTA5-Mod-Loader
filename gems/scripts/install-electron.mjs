// Recover from stalled legacy downloaders using the same official archive and package checksum.
import fs from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import crypto from 'node:crypto';
const pkg=JSON.parse(fs.readFileSync('node_modules/electron/package.json'));
const name=`electron-v${pkg.version}-win32-x64.zip`,file='artifacts/'+name;
const expected=JSON.parse(fs.readFileSync('node_modules/electron/checksums.json'))[name];
if(!expected)throw new Error('缺少官方 SHA-256 校验值');
const response=await fetch(`https://github.com/electron/electron/releases/download/v${pkg.version}/${name}`,{signal:AbortSignal.timeout(180000)});
if(!response.ok)throw new Error('Electron 下载失败：'+response.status);
await pipeline(Readable.fromWeb(response.body),fs.createWriteStream(file));
const hash=crypto.createHash('sha256');for await(const c of fs.createReadStream(file))hash.update(c);
if(hash.digest('hex')!==expected)throw new Error('Electron 官方校验失败');
console.log('官方 Electron 归档下载并通过 SHA-256 校验：'+file);
