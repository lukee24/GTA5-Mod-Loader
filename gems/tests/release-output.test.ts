import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
// @ts-expect-error 实际构建工具模块，不运行Electron。
import {writeReleaseOutputs} from '../scripts/release-output.mjs';
function fixture(t:any){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-release-output-'));
 for(const dir of ['scripts','release','outside','native/game-assistant/artifacts'])fs.mkdirSync(path.join(root,dir),{recursive:true});
 for(const name of ['release-manifest.mjs','release-cli.mjs','verify-signatures.mjs','authenticode.mjs','release-artifacts.mjs','signing-policy.mjs','release-output.mjs'])if(fs.existsSync(path.join('scripts',name)))fs.copyFileSync(path.join('scripts',name),path.join(root,'scripts',name));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.0.1'}));
 // 只用于清单哈希读取的数据附件，并非有效MOD/源码ZIP。
 fs.writeFileSync(path.join(root,'release/GEMS-0.0.1-source.zip'),'自建附件数据');
 // Source-only evidence must not depend on a proprietary or prebuilt SDK/runtime.
 fs.writeFileSync(path.join(root,'release/manifest.json'),'旧清单');fs.writeFileSync(path.join(root,'release/SHA256SUMS.txt'),'旧校验值');
 t.after(()=>{assert.equal(path.dirname(root),os.tmpdir());assert.ok(path.basename(root).startsWith('gems-release-output-'));fs.rmSync(root,{recursive:true});});
 return root;
}
function run(root:string){return spawnSync(process.execPath,[path.join(root,'scripts/release-manifest.mjs'),'--source-only'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});}
for(const output of ['manifest.json','SHA256SUMS.txt'])test('真实发行CLI拒绝硬链接输出，保护外部及此前证据：'+output,t=>{
 const root=fixture(t),target=path.join(root,'release',output),external=path.join(root,'outside/user.txt'),bytes=Buffer.from('必须保留的用户文件');
 fs.writeFileSync(external,bytes);fs.unlinkSync(target);fs.linkSync(external,target);
 const other=path.join(root,'release',output==='manifest.json'?'SHA256SUMS.txt':'manifest.json'),before=fs.readFileSync(other),child=run(root);
 t.diagnostic(JSON.stringify({exit:child.status,externalChanged:!fs.readFileSync(external).equals(bytes),otherChanged:!fs.readFileSync(other).equals(before)}));
 assert.equal(child.error,undefined);assert.notEqual(child.status,0);assert.match(child.stderr,/发行证据/);assert.deepEqual(fs.readFileSync(external),bytes);assert.deepEqual(fs.readFileSync(other),before);
});
test('真实发行CLI发现第二输出是目录时，不能先覆盖第一清单',t=>{
 const root=fixture(t),target=path.join(root,'release/SHA256SUMS.txt'),file=path.join(root,'release/manifest.json'),before=fs.readFileSync(file);
 fs.unlinkSync(target);fs.mkdirSync(target);const child=run(root);
 t.diagnostic(JSON.stringify({exit:child.status,manifestChanged:!fs.readFileSync(file).equals(before)}));
 assert.equal(child.error,undefined);assert.notEqual(child.status,0);assert.match(child.stderr,/发行证据/);assert.deepEqual(fs.readFileSync(file),before);
});
function outputs(root:string){const directory=path.join(root,'release'),files=['manifest.json','SHA256SUMS.txt'].map(name=>path.join(directory,name));return{directory,files,before:files.map(file=>fs.readFileSync(file))};}
function originalOutputs(f:ReturnType<typeof outputs>){f.files.forEach((file,index)=>assert.deepEqual(fs.readFileSync(file),f.before[index]));assert.deepEqual(fs.readdirSync(f.directory).filter(name=>name.startsWith('.gems-release-')),[]);}
test('实际CLI正常生成和普通文件更新，SHA来自真实附件且无残留暂存',t=>{
 const root=fixture(t),first=run(root);assert.equal(first.error,undefined);assert.equal(first.status,0,first.stderr);
 const file=path.join(root,'release/manifest.json'),manifest=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(manifest.channel,'source-only');assert.equal(manifest.commercialReady,false);assert.equal(manifest.fullRequirementsPassed,false);
 assert.equal(fs.readFileSync(path.join(root,'release/SHA256SUMS.txt'),'utf8'),manifest.artifacts.map((entry:any)=>`${entry.sha256}  ${entry.file}`).join('\n')+'\n');
 const second=run(root);assert.equal(second.status,0,second.stderr);assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).version,'0.0.1');
 assert.deepEqual(fs.readdirSync(path.join(root,'release')).filter(name=>name.startsWith('.gems-release-')),[]);
});
test('首次无输出可保存；超8MiB输出/旧文件与非法类型在提交前拒绝',t=>{
 const root=fixture(t),f=outputs(root);f.files.forEach(file=>fs.unlinkSync(file));
 assert.deepEqual(writeReleaseOutputs(f.directory,'实际清单','实际校验值').published,['manifest.json','SHA256SUMS.txt']);
 const before=f.files.map(file=>fs.readFileSync(file));
 for(const payload of [null,{},'x'.repeat(8*1024**2+1)]){
  assert.throws(()=>writeReleaseOutputs(f.directory,'新清单',payload),/发行证据/);f.files.forEach((file,index)=>assert.deepEqual(fs.readFileSync(file),before[index]));
 }
 fs.writeFileSync(f.files[1],'x'.repeat(8*1024**2+1));assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),/8MiB/);assert.deepEqual(fs.readFileSync(f.files[0]),before[0]);assert.equal(fs.statSync(f.files[1]).size,8*1024**2+1);
 assert.throws(()=>writeReleaseOutputs('relative','a','b'),/绝对目录/);
});
test('暂存写入与fsync失败均不改两个旧输出，句柄关闭且只清理自有文件',t=>{
 const root=fixture(t),f=outputs(root),write=fs.writeFileSync,sync=fs.fsyncSync;
 for(const mode of ['write','sync']){
  let calls=0;if(mode==='write')fs.writeFileSync=((...args:any[])=>{if(typeof args[0]==='number'&&++calls===2)throw new Error('注入暂存第二文件失败');return(write as any)(...args);}) as typeof fs.writeFileSync;
  else fs.fsyncSync=((...args:any[])=>{if(++calls===2)throw new Error('注入第二次fsync失败');return(sync as any)(...args);}) as typeof fs.fsyncSync;
  try{assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),(error:any)=>{assert.match(error.message,/未提交/);assert.deepEqual(error.published,[]);return true;});}finally{fs.writeFileSync=write;fs.fsyncSync=sync;}
  originalOutputs(f);
 }
});
test('暂存之后外部改写同长度输出或新增原缺失文件，保留改动而不提交',t=>{
 const root=fixture(t),f=outputs(root),sync=fs.fsyncSync;
 for(const mode of ['same-length','created']){
  f.files.forEach((file,index)=>fs.writeFileSync(file,f.before[index]));if(mode==='created')fs.unlinkSync(f.files[1]);
  const newer=mode==='created'?Buffer.from('外部新增'):Buffer.alloc(f.before[1].length,42);let count=0;
  fs.fsyncSync=((...args:any[])=>{const result=(sync as any)(...args);if(++count===2)fs.writeFileSync(f.files[1],newer);return result;}) as typeof fs.fsyncSync;
  try{assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),/未提交/);}finally{fs.fsyncSync=sync;}
  assert.deepEqual(fs.readFileSync(f.files[0]),f.before[0]);assert.deepEqual(fs.readFileSync(f.files[1]),newer);assert.deepEqual(fs.readdirSync(f.directory).filter(name=>name.startsWith('.gems-release-')),[]);
 }
});
test('旧输出短读完整循环仍能更新，提前EOF拒绝且原输出不变',t=>{
 const root=fixture(t),f=outputs(root),read=fs.readSync;let calls=0;
 fs.readSync=((...args:any[])=>{calls++;args[3]=Math.min(2,args[3]);return(read as any)(...args);}) as typeof fs.readSync;
 try{writeReleaseOutputs(f.directory,'新清单','新校验值');assert.ok(calls>10);}finally{fs.readSync=read;}
 f.files.forEach((file,index)=>fs.writeFileSync(file,f.before[index]));calls=0;
 fs.readSync=((...args:any[])=>{if(++calls===2)return 0;args[3]=1;return(read as any)(...args);}) as typeof fs.readSync;
 try{assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),/读取不完整/);}finally{fs.readSync=read;}
 originalOutputs(f);
});
test('父目录junction不写外部；暂存中目录替换不继续提交或清理被外移文件',t=>{
 const root=fixture(t),f=outputs(root),junction=path.join(root,'linked-release');fs.symlinkSync(f.directory,junction,'junction');
 assert.throws(()=>writeReleaseOutputs(junction,'新清单','新值'),/目录包含/);originalOutputs(f);fs.unlinkSync(junction);
 const moved=path.join(root,'moved-release'),sync=fs.fsyncSync,lstat=fs.lstatSync;let calls=0,changed=false;
 fs.fsyncSync=((...args:any[])=>{calls++;return(sync as any)(...args);}) as typeof fs.fsyncSync;
 // Windows打开的临时句柄会阻止父目录改名；在第二个句柄关闭后的首次lstat边界改目录。
 (fs as any).lstatSync=((...args:any[])=>{const result=(lstat as any)(...args);if(calls===2&&!changed&&String(args[0]).includes('.gems-release-')){changed=true;fs.renameSync(f.directory,moved);fs.mkdirSync(f.directory);fs.writeFileSync(path.join(f.directory,'manifest.json'),'替换目录的外部清单');}return result;}) as typeof fs.lstatSync;
 try{assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),/未提交/);}finally{fs.fsyncSync=sync;(fs as any).lstatSync=lstat;}
 assert.ok(changed);
 assert.equal(fs.readFileSync(path.join(f.directory,'manifest.json'),'utf8'),'替换目录的外部清单');
 f.files.forEach((file,index)=>assert.deepEqual(fs.readFileSync(path.join(moved,path.basename(file))),f.before[index]));assert.equal(fs.readdirSync(moved).filter(name=>name.startsWith('.gems-release-')).length,2);
});
test('第二次rename故障明确部分提交，不假称成对原子或自动覆盖外部记录',t=>{
 const root=fixture(t),f=outputs(root),rename=fs.renameSync;let calls=0;
 fs.renameSync=((...args:any[])=>{if(++calls===2)throw new Error('注入第二次提交失败');return(rename as any)(...args);}) as typeof fs.renameSync;
 try{assert.throws(()=>writeReleaseOutputs(f.directory,'新清单','新值'),(error:any)=>{assert.match(error.message,/部分提交/);assert.deepEqual(error.published,['manifest.json']);return true;});}finally{fs.renameSync=rename;}
 assert.equal(fs.readFileSync(f.files[0],'utf8'),'新清单');assert.deepEqual(fs.readFileSync(f.files[1]),f.before[1]);assert.deepEqual(fs.readdirSync(f.directory).filter(name=>name.startsWith('.gems-release-')),[]);
});
