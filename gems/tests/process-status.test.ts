import test from 'node:test';import assert from 'node:assert/strict';
import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
import {promisify} from 'node:util';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
let output='',failure:Error|null=null;const original=childProcess.execFile;
let executor:((...args:any[])=>any)|undefined;
// 本文件独立 Node 测试进程内模拟 tasklist 输出，不启动或终止任何游戏。
childProcess.execFile=((_file:any,_args:any,options:any,callback:any)=>{
  queueMicrotask(()=>callback(failure,output,''));return{pid:undefined,kill:()=>true};
}) as typeof childProcess.execFile;
Object.defineProperty(childProcess.execFile,promisify.custom,{value:(...args:any[])=>{if(executor)return executor(...args);return failure?Promise.reject(failure):Promise.resolve({stdout:output,stderr:''});}});
syncBuiltinESMExports();
const {gameRunning,guardGame,inspectEnvironment}=await import('../packages/diagnostics');
const {readOnlyCommand,systemCommand}=await import('../packages/diagnostics/windows-command');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-process-status-'));fs.mkdirSync(path.join(root,'update'));const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);fs.writeFileSync(path.join(root,'GTA5_Enhanced.exe'),pe);const rpf=Buffer.alloc(4);rpf.writeUInt32LE(0x52504637);fs.writeFileSync(path.join(root,'update/update.rpf'),rpf);return root;}
const system='"System Idle Process","0","Services","0","8 K"\r\n"System","4","Services","0","180 K"';
test.after(()=>{childProcess.execFile=original;syncBuiltinESMExports();});
test('空或异常进程检测输出必须阻止安装守卫',async()=>{
  const root=fixture();try{for(output of ['', 'INFO: unexpected result', '损坏的 CSV 输出']){failure=null;await assert.rejects(guardGame(root),/无法确认游戏进程/);}}finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-process-status-'));fs.rmSync(root,{recursive:true});}
});
test('检测命令失败仍返回未知环境证据，不能误报游戏未运行',async()=>{
  const root=fixture();try{failure=new Error('tasklist failure');const environment=await inspectEnvironment(root);assert.equal(environment.running,null);assert.ok(environment.components.some(component=>component.name==='游戏进程'&&component.status==='未知'));}finally{failure=null;assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-process-status-'));fs.rmSync(root,{recursive:true});}
});
test('准确进程名匹配，不把相似文件名当作游戏',async()=>{failure=null;output=system+'\r\n"GTA5_Enhanced.exe.evil","100","Console","1","8 K"';assert.equal(await gameRunning(),false);output=system+'\r\n"GTA5_Enhanced.exe","100","Console","1","8 K"';assert.equal(await gameRunning(),true);});
test('损坏、截断或重复 PID 的列表不证明游戏已退出',async()=>{failure=null;for(output of ['"Other.exe","100","Console","1","8 K"',system+'\r\n"broken"',system+'\r\n"Other.exe","4","Console","1","8 K"'])await assert.rejects(gameRunning(),/无法确认游戏进程/);});
test('中文/转义 CSV 和多游戏进程可读取，stderr 异常不能当作退出',async()=>{
  output=system+'\r\n"a,""b"".exe","200","控制台","1","1,000 K"\r\n"GTA5_Enhanced.exe","201","Console","1","8 K"\r\n"gta5_enhanced.EXE","202","Console","1","8 K"';assert.equal(await gameRunning(),true);
  executor=()=>Promise.resolve({stdout:system,stderr:'command warning'});try{await assert.rejects(gameRunning(),/无法确认游戏进程/);}finally{executor=undefined;}
});
test('只读命令固定在系统目录，拒绝未知命令和无效系统目录',()=>{
  assert.equal(systemCommand('tasklist.exe'),path.join(process.env.SystemRoot!,'System32/tasklist.exe'));
  assert.throws(()=>systemCommand('../arbitrary.exe' as any),/不受支持/);
  const root=process.env.SystemRoot;try{process.env.SystemRoot='relative';assert.throws(()=>systemCommand('tasklist.exe'),/系统目录/);}finally{process.env.SystemRoot=root;}
});
test('预取消检查不启动任何检测命令',async()=>{
  let calls=0;executor=()=>{calls++;return Promise.resolve({stdout:system,stderr:''});};const controller=new AbortController();controller.abort();
  try{await assert.rejects(readOnlyCommand('tasklist.exe',[],controller.signal));assert.equal(calls,0);}finally{executor=undefined;}
});
test('读取取消结束真正启动的测试子进程，不等待 10 秒命令上限',{timeout:5000},async()=>{
  let child:childProcess.ChildProcess|undefined,entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
  executor=(_file,_args,options)=>{
    // 仅本次测试执行器将固定检测命令路由到自有 Node 等待夹具，非游戏或系统策略。
    const pending=promisify(original)(process.execPath,['-e','process.stdout.write("ready");setInterval(()=>{},1000)'],options);
    child=(pending as any).child;child!.stdout!.once('data',entered);return pending;
  };
  const controller=new AbortController();try{const pending=readOnlyCommand('tasklist.exe',[],controller.signal);await started;const ended=new Promise(resolve=>child!.once('exit',resolve));controller.abort();await assert.rejects(pending);await ended;assert.equal(child!.killed,true);}finally{executor=undefined;if(child?.exitCode===null&&child.signalCode===null)child.kill();}
});
