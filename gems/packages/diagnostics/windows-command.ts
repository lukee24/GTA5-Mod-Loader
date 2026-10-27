import path from 'node:path';import fs from 'node:fs';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {noLinks} from '../core/security';
type Command='tasklist.exe'|'WindowsPowerShell/v1.0/powershell.exe';
export function systemCommand(command:Command){
  if(!['tasklist.exe','WindowsPowerShell/v1.0/powershell.exe'].includes(command))throw new Error('不受支持的 Windows 环境检测命令');
  const root=process.env.SystemRoot;
  if(!root||!path.isAbsolute(root))throw new Error('无法确认 Windows 系统目录，已停止环境命令');
  const file=path.join(root,'System32',command);noLinks(root,file);
  if(!fs.statSync(file).isFile())throw new Error('Windows 环境检测命令不可用');
  return file;
}
export async function readOnlyCommand(command:Command,args:string[],signal?:AbortSignal){
  signal?.throwIfAborted();
  // Absolute OS path avoids searching a mod/current directory or PATH. No shell or package commands.
  return promisify(execFile)(systemCommand(command),args,{windowsHide:true,timeout:10000,maxBuffer:4*1024**2,encoding:'utf8',signal});
}
