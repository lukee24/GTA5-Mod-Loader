import path from 'node:path';import os from 'node:os';
import {Store} from '../packages/database';
const root=path.resolve(process.argv[2]||'');
if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-startup-ui-'))throw new Error('启动测试目录不符合隔离范围');
const store=await Store.open(path.join(root,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
try{
  const expected=process.argv[3]==='environment'?'E:/SteamLibrary/steamapps/common/Grand Theft Auto V Enhanced':'';
  if(process.argv[4]==='verify'){
    const settings=store.get<{gamePath:string;theme:string}>('settings','main');
    if(!settings||settings.gamePath!==expected||settings.theme!=='dark'||store.list('transaction').length||store.list('mod').length)throw new Error('退出后的真实数据库无法恢复预期设置或产生了不应存在的安装记录');
  }else store.put('settings','main',{gamePath:expected,theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true});
}finally{store.close();}
