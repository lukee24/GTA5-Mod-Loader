// Copy only the exact, unmodified 7-Zip 26.05 x64 files verified for this build.
// Fetches the pinned corresponding source archive; never executes an installer,
// searches PATH, or changes global 7-Zip.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args.length && (args.length!==2 || args[0]!=='--from' || !path.isAbsolute(args[1])))throw new Error('用法：node scripts/prepare-archive-tools.mjs [--from <7-Zip 26.05 绝对目录>]');
const expected={
 '7z.exe':'94205cfc054dd3bbeb978905bc619a65b3f04e9e73bb2717841110b6f46d962e',
 '7z.dll':'78bf6b668d75801e3aa180b4ccb16e6d8395fba80dec8a065055bb6f8dfabb82',
 'License.txt':'519ac0a4bded9c18ea02e0afb71f663d8c47373bd9facd3ac96a79f51d77765d',
 'History.txt':'da10132b33d6674f9338c830714678c95caa420bbd5069d381136eafe6a435f1'
};
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),destination=path.join(root,'tools/7zip-26.05');
function noLinks(file){let current=path.resolve(file);while(true){try{if(fs.lstatSync(current).isSymbolicLink())throw new Error('工具准备目录不接受链接：'+current);}catch(error){if(error.code!=='ENOENT')throw error;}const parent=path.dirname(current);if(parent===current)break;current=parent;}}
function bytes(file,hash){noLinks(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.nlink!==1||stat.size>3*1024**2)throw new Error('工具不是受限普通文件：'+file);const data=fs.readFileSync(file);if(crypto.createHash('sha256').update(data).digest('hex')!==hash)throw new Error('工具版本或内容不匹配26.05：'+path.basename(file));return data;}
const alreadyPrepared=Object.keys(expected).every(name=>fs.existsSync(path.join(destination,name)));
const source=args[1]||process.env.GEMS_7ZIP_DIRECTORY||(alreadyPrepared?destination:path.join(process.env.ProgramFiles||'C:\\Program Files','7-Zip'));
if(!path.isAbsolute(source))throw new Error('7-Zip 来源必须是绝对目录');
const files=Object.entries(expected).map(([name,hash])=>({name,hash,data:bytes(path.join(source,name),hash)}));
noLinks(destination);fs.mkdirSync(destination,{recursive:true});noLinks(destination);
for(const file of files){const target=path.join(destination,file.name);if(fs.existsSync(target))bytes(target,file.hash);else fs.writeFileSync(target,file.data,{flag:'wx'});}
const notice='7-Zip 26.05 x64, unmodified upstream files.\nCopyright (C) 1999-2026 Igor Pavlov.\nSee License.txt for LGPL, BSD and unRAR terms; these files are not covered by GEMS MIT license.\nSource release: https://github.com/ip7z/7zip/releases/download/26.05/7z2605-src.tar.xz\nDownload page: https://www.7-zip.org/download.html\nBinary release: https://github.com/ip7z/7zip/releases/download/26.05/7z2605-x64.exe\nBinary installer SHA256: fd99e86f57d8f429ef5ed045bf98315af962e2309b0f1ba87a147a44c71647d0\n';
const sourceFile=path.join(destination,'SOURCE.txt');if(fs.existsSync(sourceFile)){noLinks(sourceFile);if(fs.readFileSync(sourceFile,'utf8')!==notice)throw new Error('来源说明已存在且不同，保留原文件');}else fs.writeFileSync(sourceFile,notice,{flag:'wx'});
const sourceArchive=path.join(destination,'7z2605-src.tar.xz'),sourceHash='0b6080b8c3e7a579161d2d495224c0e51c467576cb4c7048b0ab485ef44cc22e';
if(fs.existsSync(sourceArchive))bytes(sourceArchive,sourceHash);
else {
 const response=await fetch('https://github.com/ip7z/7zip/releases/download/26.05/7z2605-src.tar.xz',{signal:AbortSignal.timeout(60000)});
 if(!response.ok||!response.body)throw new Error('7-Zip 对应源码下载失败：'+response.status);
 let total=0;const chunks=[];for await(const chunk of response.body){total+=chunk.length;if(total>3*1024**2)throw new Error('7-Zip 对应源码超过固定容量');chunks.push(chunk);}
 const data=Buffer.concat(chunks);if(crypto.createHash('sha256').update(data).digest('hex')!==sourceHash)throw new Error('7-Zip 对应源码与官方发布摘要不一致');
 noLinks(sourceArchive);fs.writeFileSync(sourceArchive,data,{flag:'wx'});
}
// Print only the two fixed entries from the verified source archive. No archive
// paths are extracted onto the filesystem and no shell is involved.
const tar=path.join(process.env.SystemRoot||'C:\\Windows','System32','tar.exe');
for(const [entry,name] of [['DOC/copying.txt','LGPL-2.1.txt'],['DOC/unRarLicense.txt','unRarLicense.txt']]){
 const data=execFileSync(tar,['-xOf',sourceArchive,entry],{windowsHide:true,maxBuffer:128*1024,timeout:10000});
 if(!data.length)throw new Error('对应源码中的许可文本为空：'+entry);
 const target=path.join(destination,name);noLinks(target);
 if(fs.existsSync(target)){const stat=fs.lstatSync(target);if(!stat.isFile()||stat.nlink!==1||stat.size!==data.length||!fs.readFileSync(target).equals(data))throw new Error('许可文本已存在且不同，保留原文件：'+name);}
 else fs.writeFileSync(target,data,{flag:'wx'});
}
console.log('已准备7-Zip 26.05固定后端、对应源码及完整许可；未运行安装程序或修改全局软件。');
