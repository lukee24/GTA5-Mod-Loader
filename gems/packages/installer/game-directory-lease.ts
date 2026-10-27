import fs from 'node:fs';
import path from 'node:path';
import {noLinks} from '../core/security';

const activeGames=new Set<string>();
function directoryKey(value:string){
  if(typeof value!=='string'||!value||value.length>32768||/[\x00-\x1f\x7f]/u.test(value)||!path.isAbsolute(value))throw new Error('游戏目录无法确认，未开始文件事务');
  const root=path.resolve(value);noLinks(root,root);
  try{
    if(!fs.lstatSync(root).isDirectory())throw new Error('游戏目录需要普通目录，未开始文件事务');
    // Canonicalize the directory before the case-insensitive Windows comparison.
    return fs.realpathSync.native(root).toLowerCase();
  }catch(cause){throw new Error('游戏目录无法读取或不是普通目录，未开始文件事务',{cause});}
}

/** In-process lease across Store objects, not an OS lock or persistent ownership registry. */
export function acquireGameDirectories(paths:ReadonlyArray<string>):()=>void{
  const keys=[...new Set(paths.map(directoryKey))];
  // Check the entire batch before acquiring any root: conflicts cannot leak a
  // partial lease or allow recovery to mutate earlier games before stopping.
  if(keys.some(key=>activeGames.has(key)))throw new Error('另一个文件事务正在操作此游戏目录，请等待完成后重试');
  for(const key of keys)activeGames.add(key);
  let released=false;
  return()=>{if(released)return;released=true;for(const key of keys)activeGames.delete(key);};
}
