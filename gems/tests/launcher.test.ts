import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../packages/database';
import {SteamLauncher,STEAM_ENHANCED_LAUNCH} from '../packages/launcher';
import {acquireGameDirectories} from '../packages/installer/game-directory-lease';
import {validateGame} from '../packages/diagnostics';

async function fixture() {
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'gems-launch-test-'));
  const game=path.join(base,'steamapps/common/中文 Enhanced'), data=path.join(base,'data');
  fs.mkdirSync(path.join(game,'update'),{recursive:true});
  const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);
  fs.writeFileSync(path.join(game,'GTA5_Enhanced.exe'),pe);
  const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);fs.writeFileSync(path.join(game,'update/update.rpf'),rpf);
  const manifest=path.join(base,'steamapps/appmanifest_3240220.acf');
  fs.writeFileSync(manifest,'"AppState" { "appid" "3240220" "installdir" "中文 Enhanced" "StateFlags" "4" "buildid" "1234" }');
  let store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const sent:string[]=[];let running=false, failure=false;
  const hooks={running:async()=>{if(failure)throw new Error('无法确认游戏进程');return running;}};
  const launcher=new SteamLauncher(store,async uri=>{sent.push(uri);},hooks);
  return {base,game,manifest,store,launcher,sent,hooks,setRunning:(value:boolean)=>{running=value;},setFailure:()=>{failure=true;},
    reopen:async()=>{store.close();store=await Store.open(data,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));return new SteamLauncher(store,async uri=>{sent.push(uri);},hooks);},
    close:()=>{store.close();assert.equal(path.dirname(path.resolve(base)),path.resolve(os.tmpdir()));assert.ok(path.basename(base).startsWith('gems-launch-test-'));fs.rmSync(base,{recursive:true,force:true});}};
}

test('启动只发送固定 Steam Enhanced URI；中文空格目录与游戏字节保持，未声称加载通过',async()=>{
  const f=await fixture();try{
    const before=fs.readFileSync(path.join(f.game,'GTA5_Enhanced.exe'));
    const result=await f.launcher.request(f.game);
    assert.deepEqual(f.sent,[STEAM_ENHANCED_LAUNCH]);assert.equal(result.phase,'pending');assert.equal(result.gameplayVerified,false);
    assert.match(result.message,/尚未确认/);assert.deepEqual(fs.readFileSync(path.join(f.game,'GTA5_Enhanced.exe')),before);
    assert.throws(()=>f.launcher.assertWritable(),/启动结果尚未确认/);
    await assert.rejects(f.launcher.request(f.game),/启动结果尚未确认/);assert.equal(f.sent.length,1);
  }finally{f.close();}
});
test('请求后无进程继续等待；观察运行与退出仅记录进程，不能产生游戏通过',async()=>{
  const f=await fixture();try{
    await f.launcher.request(f.game);assert.equal((await f.launcher.refresh())?.phase,'pending');
    f.setRunning(true);const running=await f.launcher.refresh();assert.equal(running?.phase,'running');assert.equal(running?.gameplayVerified,false);
    await assert.rejects(f.launcher.acknowledgeStopped(),/游戏仍在运行/);
    f.setRunning(false);assert.equal((await f.launcher.refresh())?.phase,'exited');f.launcher.assertWritable();
  }finally{f.close();}
});
test('退出应用重新打开仍保留启动预留；用户取消且进程不存在后才能解除',async()=>{
  const f=await fixture();try{
    await f.launcher.request(f.game);const restarted=await f.reopen();assert.throws(()=>restarted.assertWritable(),/尚未确认/);
    assert.equal((await restarted.acknowledgeStopped())?.phase,'cancelled');restarted.assertWritable();
    await restarted.request(f.game);assert.equal(f.sent.length,2);
  }finally{f.close();}
});
test('外部启动接口报错保留不确定记录，失败后的再次启动被拒绝',async()=>{
  const f=await fixture();try{
    const launcher=new SteamLauncher(f.store,async()=>{throw new Error('URI handler unavailable');},f.hooks);
    await assert.rejects(launcher.request(f.game),/发送失败或结果未知/);assert.equal(launcher.status()?.phase,'uncertain');
    assert.throws(()=>launcher.assertWritable(),/尚未确认/);assert.equal((await launcher.refresh())?.phase,'uncertain');
    await launcher.acknowledgeStopped();launcher.assertWritable();
  }finally{f.close();}
});
test('进程检测未知拒绝启动和取消，不能清除跨重启预留',async()=>{
  const f=await fixture();try{
    await f.launcher.request(f.game);f.setFailure();
    await assert.rejects(f.launcher.refresh(),/无法确认/);await assert.rejects(f.launcher.acknowledgeStopped(),/无法确认/);
    assert.equal(f.launcher.status()?.phase,'pending');assert.equal(f.sent.length,1);
  }finally{f.close();}
});
test('启动前已运行、目录不存在、Steam部署未完成均不发送请求',async()=>{
  const f=await fixture();try{
    f.setRunning(true);await assert.rejects(f.launcher.request(f.game),/已检测到/);f.setRunning(false);
    await assert.rejects(f.launcher.request(path.join(f.base,'missing')));
    fs.writeFileSync(f.manifest,fs.readFileSync(f.manifest,'utf8').replace('"StateFlags" "4"','"StateFlags" "1026"'));
    await assert.rejects(f.launcher.request(f.game),/尚未确认完成/);assert.deepEqual(f.sent,[]);assert.equal(f.launcher.status(),null);
  }finally{f.close();}
});
test('没有匹配 Steam 记录的可识别目录不调用猜测的启动程序',async()=>{
  const f=await fixture();try{
    const other=path.join(f.base,'other');fs.cpSync(f.game,other,{recursive:true});
    await assert.rejects(f.launcher.request(other),/当前只支持/);assert.deepEqual(f.sent,[]);
  }finally{f.close();}
});
test('文件事务持有游戏目录时拒绝启动并允许完成后重试',async()=>{
  const f=await fixture();try{
    const release=acquireGameDirectories([f.game]);try{await assert.rejects(f.launcher.request(f.game),/另一个文件事务/);}finally{release();}
    assert.deepEqual(f.sent,[]);await f.launcher.request(f.game);assert.equal(f.sent.length,1);
  }finally{f.close();}
});
test('持久化预留失败时零外部调用；修复存储后可重试',async()=>{
  const f=await fixture();try{
    const put=f.store.put.bind(f.store);f.store.put=()=>{throw new Error('backup storage failed');};
    await assert.rejects(f.launcher.request(f.game),/storage failed/);assert.deepEqual(f.sent,[]);
    f.store.put=put;await f.launcher.request(f.game);assert.equal(f.sent.length,1);
  }finally{f.close();}
});
test('损坏或伪造加载成功的持久化记录拒绝读取和写入许可，原记录保留',async()=>{
  const f=await fixture();try{
    await f.launcher.request(f.game);const state=f.launcher.status()!;
    for(const invalid of [{...state,gameplayVerified:true},{...state,phase:'passed'},{...state,gamePath:'relative'},{...state,extra:'x'}]){
      f.store.put('game-launch','current',invalid);assert.throws(()=>f.launcher.status(),/字段无效/);assert.throws(()=>f.launcher.assertWritable());
      assert.deepEqual(f.store.get('game-launch','current'),invalid);
    }
    f.store.db.run("UPDATE documents SET json='{' WHERE kind='game-launch'");assert.throws(()=>f.launcher.status(),/无法读取/);
  }finally{f.close();}
});
test('等待进程检查期间 Steam记录发生改变，在派发前再次验证拒绝启动',async()=>{
  const f=await fixture();try{
    const launcher=new SteamLauncher(f.store,async uri=>{f.sent.push(uri);},{validate:validateGame,running:async()=>{
      fs.writeFileSync(f.manifest,fs.readFileSync(f.manifest,'utf8').replace('"StateFlags" "4"','"StateFlags" "1026"'));return false;
    }});
    await assert.rejects(launcher.request(f.game),/尚未确认完成/);assert.deepEqual(f.sent,[]);assert.equal(launcher.status(),null);
  }finally{f.close();}
});
