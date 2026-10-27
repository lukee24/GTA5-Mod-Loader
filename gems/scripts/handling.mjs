// Development CLI. Output is an independent workspace copy, never a game-directory write.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {readHandling} from '../packages/vehicles/handling.ts';import {saveHandlingCopy} from '../packages/vehicles/handling-copy.ts';import {noLinks} from '../packages/core/security.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),[, ,command,source,model,patch]=process.argv;
if(!['read','edit'].includes(command)||!source)throw new Error('用法：npm run handling -- read 文件；或 edit 文件 模型名 修改JSON文件');
function text(file,max=4*1024**2){const absolute=path.resolve(file);noLinks(path.parse(absolute).root,absolute);const fd=fs.openSync(absolute,'r');try{const stat=fs.fstatSync(fd);if(!stat.isFile()||stat.size>max)throw new Error('输入不是普通文件或超过读取上限');const bytes=Buffer.alloc(stat.size);if(fs.readSync(fd,bytes,0,bytes.length,0)!==bytes.length)throw new Error('输入读取不完整');return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}finally{fs.closeSync(fd);}}
const input=text(source);
if(command==='read')console.log(JSON.stringify({models:readHandling(input),scope:'实际XML；单位、Enhanced兼容和游戏效果未验证'},null,2));
else{if(!model||!patch)throw new Error('请提供实际模型名和修改JSON文件');console.log(JSON.stringify(saveHandlingCopy(path.join(root,'artifacts'),input,model,JSON.parse(text(patch,65536))),null,2));}
