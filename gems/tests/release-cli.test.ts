import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
// @ts-expect-error 与实际CLI共用的JavaScript参数解释器，不运行Electron。
import {parseManifestOptions,parseSignedBuildOptions,parseSignatureOptions} from '../scripts/release-cli.mjs';

function fixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-release-cli-'));
 fs.mkdirSync(path.join(root,'scripts'));fs.mkdirSync(path.join(root,'release'));
 for(const name of ['release-cli.mjs','release-manifest.mjs','release-output.mjs','signed-build.mjs','verify-signatures.mjs','release-artifacts.mjs','authenticode.mjs','signing-policy.mjs'])fs.copyFileSync(path.join('scripts',name),path.join(root,'scripts',name));
 // 非法包JSON、没有附件/开发依赖：参数与帮助必须在读取/构建前结束。
 fs.writeFileSync(path.join(root,'package.json'),'not-json');
 for(const file of ['manifest.json','SHA256SUMS.txt'])fs.writeFileSync(path.join(root,'release',file),'原证据：'+file);
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-release-cli-'));fs.rmSync(root,{recursive:true});});
 return root;
}
function child(root:string,script:string,args:string[]){return spawnSync(process.execPath,[path.join(root,'scripts',script),...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});}

function rejectManifest(t:any,args:string[]){
 const root=fixture(t),paths=['manifest.json','SHA256SUMS.txt'].map(file=>path.join(root,'release',file));
 const before=paths.map(file=>fs.readFileSync(file));
 const run=child(root,'release-manifest.mjs',args);
 const changed=paths.map((file,index)=>!fs.readFileSync(file).equals(before[index]));
 assert.equal(run.error,undefined);assert.notEqual(run.status,0,'未知或矛盾选项不能生成成功清单');assert.match(run.stderr,/发行参数/);assert.deepEqual(changed,[false,false]);
 assert.equal(fs.readFileSync(path.join(root,'package.json'),'utf8'),'not-json');
}
test('实际CLI签名选项拼写错误必须拒绝，不能成功降为source-only',t=>rejectManifest(t,['--source-only','--requre-signed']));
test('实际CLI未知赋值与位置参数必须拒绝，原发行证据保持',t=>{
 for(const args of [['--source-only','--publisher=测试身份'],['--source-only','unexpected']])rejectManifest(t,args);
});
test('清单支持三种显式选项及无参数，不把签名混入不完整交付',()=>{
 assert.deepEqual(parseManifestOptions([]),{help:false,sourceOnly:false,installerUnavailable:false,requireSigned:false});
 for(const [flag,field] of [['--source-only','sourceOnly'],['--installer-unavailable','installerUnavailable'],['--require-signed','requireSigned']]){
  const result=parseManifestOptions([flag]);assert.equal(result[field],true);assert.equal(Object.isFrozen(result),true);
 }
 for(const args of [['--source-only','--require-signed'],['--installer-unavailable','--require-signed'],['--source-only','--installer-unavailable']]){
  assert.throws(()=>parseManifestOptions(args),/发行参数冲突/);assert.throws(()=>parseManifestOptions([...args].reverse()),/发行参数冲突/);
 }
});
test('所有解释器拒绝超量/异常参数，不回显疑似秘密值',()=>{
 for(const parse of [parseManifestOptions,parseSignedBuildOptions,parseSignatureOptions]){
  for(const args of [null,{},'--help',[null],[''],['x\n'],['x'.repeat(32769)],Array(17).fill('--help')])assert.throws(()=>parse(args),/发行参数/);
  const marker='不应该出现的凭据值';try{parse(['--secret='+marker]);assert.fail('必须拒绝');}catch(error){assert.match((error as Error).message,/发行参数/);assert.ok(!(error as Error).message.includes(marker));}
  assert.throws(()=>parse(['--help','--help']),/发行参数/);
 }
});
test('签名构建只允许实际预检选项，拼写错误不会进入构建',()=>{
 assert.deepEqual(parseSignedBuildOptions([]),{help:false,preflight:false});assert.deepEqual(parseSignedBuildOptions(['--preflight']),{help:false,preflight:true});
 for(const args of [['--prefligt'],['--preflight','--preflight'],['--preflight=true'],['--preflight','other']])assert.throws(()=>parseSignedBuildOptions(args),/发行参数/);
});
test('指定程序的签名参数严格绑定路径，缺值/多值/其他开关不得吞掉',()=>{
 assert.deepEqual(parseSignatureOptions([]),{help:false});
 for(const file of ['C:/测试目录/含空格 GEMS.exe','relative.dll','--file.dll/../safe']){
  if(file.startsWith('-'))assert.throws(()=>parseSignatureOptions(['--file',file]),/发行参数/);
  else assert.deepEqual(parseSignatureOptions(['--file',file]),{help:false,file});
 }
 for(const args of [['--file'],['--file',' '],['--file','--help'],['--file','--require-signed'],['--file','a.exe','extra'],['--file=a.exe'],['a.exe'],['--file','a.exe','--file','b.exe']])assert.throws(()=>parseSignatureOptions(args),/发行参数/);
});
test('其他发行CLI实际子进程先拒绝未知参数，不加载构建器或检查证书',t=>{
 const root=fixture(t);
 for(const [script,args] of [['signed-build.mjs',['--prefligt']],['signed-build.mjs',['--preflight','--help']],['verify-signatures.mjs',['--file','--help']],['verify-signatures.mjs',['--file','missing.exe','extra']]] as [string,string[]][]){
  const run=child(root,script,args);assert.equal(run.error,undefined);assert.equal(run.status,1,run.stderr);assert.match(run.stderr,/发行参数/);assert.equal(run.stdout,'');
 }
 assert.equal(fs.readdirSync(path.join(root,'release')).length,2);assert.equal(fs.existsSync(path.join(root,'artifacts')),false);
});
test('三种CLI单独帮助均成功且不需要包JSON/附件/签名身份，不写原证据',t=>{
 const root=fixture(t),files=['manifest.json','SHA256SUMS.txt'],before=files.map(file=>fs.readFileSync(path.join(root,'release',file)));
 for(const script of ['release-manifest.mjs','signed-build.mjs','verify-signatures.mjs']){
  const run=child(root,script,['--help']);assert.equal(run.error,undefined);assert.equal(run.status,0,run.stderr);assert.equal(run.stderr,'');assert.match(run.stdout,/用法/);
 }
 files.forEach((file,index)=>assert.deepEqual(fs.readFileSync(path.join(root,'release',file)),before[index]));assert.equal(fs.existsSync(path.join(root,'artifacts')),false);
 for(const parse of [parseManifestOptions,parseSignedBuildOptions,parseSignatureOptions])assert.deepEqual(parse(['--help']),{help:true});
});
test('实际CLI重复或冗余交付选项必须拒绝，不能忽略参数',t=>{
 for(const args of [['--source-only','--source-only'],['--source-only','--installer-unavailable']])rejectManifest(t,args);
});
