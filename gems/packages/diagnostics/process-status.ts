/** tasklist /FO CSV /NH full snapshot; absence is accepted only from a structurally valid list. */
export function parseProcessStatus(stdout:string):boolean{
  const unknown=()=>new Error('无法确认游戏进程状态，请重新检查后再修改文件');
  if(typeof stdout!=='string'||stdout.length>4*1024**2||!stdout.trim())throw unknown();
  const lines=stdout.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  if(lines.length>65536)throw unknown();
  const pids=new Set<number>();let system=false,running=false;
  for(const line of lines){
    const row=/^"((?:[^"\r\n]|"")+)","(\d+)","((?:[^"\r\n]|"")*)","(\d+)","((?:[^"\r\n]|"")+)"$/.exec(line);
    if(!row)throw unknown();
    const pid=Number(row[2]),session=Number(row[4]),name=row[1].replaceAll('""','"');
    if(!Number.isSafeInteger(pid)||pid>0xffffffff||!Number.isSafeInteger(session)||session>0xffffffff||pids.has(pid))throw unknown();
    pids.add(pid);
    if((pid===0&&name==='System Idle Process')||(pid===4&&name==='System'))system=true;
    if(name.toLowerCase()==='gta5_enhanced.exe')running=true;
  }
  // A positive game row is sufficient to block writes; a negative needs a full-list system marker.
  if(!running&&!system)throw unknown();
  return running;
}
