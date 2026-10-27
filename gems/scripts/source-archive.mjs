import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishSourceArchive} from './source-output.mjs';
import {repositoryEntryAllowed} from './source-policy.mjs';

import {parseSourceOptions,readSourceVersion,sourceArchiveHelp} from './source-input.mjs';
const options=parseSourceOptions(process.argv.slice(2));
if(options.help){console.log(sourceArchiveHelp);process.exit(0);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=readSourceVersion(root);
const {default:yazl}=await import('yazl');
const zip=new yazl.ZipFile();
let count=0;
function add(dir,prefix){
 for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(entry.isSymbolicLink())continue;
  const full=path.join(dir,entry.name),relative=prefix?prefix+'/'+entry.name:entry.name;
  // 文件与目录均在读取前检查，凭据目录不递归。
  if(!repositoryEntryAllowed(relative,entry.isDirectory()))continue;
  if(entry.isDirectory())add(full,relative);
  else if(entry.isFile()){
   if(fs.lstatSync(full).nlink!==1)throw new Error('源码归档拒绝非独立文件');
   zip.addFile(full,relative,{mtime:new Date('2026-01-01T00:00:00Z')});count++;
  }
 }
}
add(root,'gems');
// Only a repository whose gems/ is this project may contribute root documents.
if(path.basename(root)==='gems') {
 const repository=path.dirname(root);
 for(const entry of fs.readdirSync(repository,{withFileTypes:true})){
  if(entry.name==='gems'||entry.isSymbolicLink()||!repositoryEntryAllowed(entry.name,entry.isDirectory()))continue;
  const full=path.join(repository,entry.name);
  if(entry.isDirectory())add(full,entry.name);
  else if(entry.isFile()){
   if(fs.lstatSync(full).nlink!==1)throw new Error('源码归档拒绝非独立文件');
   zip.addFile(full,entry.name,{mtime:new Date('2026-01-01T00:00:00Z')});count++;
  }
 }
}
fs.mkdirSync(path.join(root,'release'),{recursive:true});
const output=path.join(root,'release',`GEMS-${version}-source.zip`);
const completion=publishSourceArchive(output,zip.outputStream);
zip.end();await completion;
console.log(`源码归档：${output}，${count} 个文件；排除本机证据、游戏资产、第三方二进制与编译产物。`);
