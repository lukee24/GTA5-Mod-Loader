import test from 'node:test';
import assert from 'node:assert/strict';
import {catalog,catalogText,MAX_CATALOG_BYTES} from '../packages/bridge';
import type {ModRecord} from '../packages/core/types';

function vehicle(id:string,brand?:string):ModRecord{return{
 id,status:'已启用',transactionId:'tx-'+id,installed:'2026-10-27T00:00:00.000Z',bytes:0,metadata:brand===undefined?undefined:{brand,favorite:true},
 report:{id,name:'用户车辆 '+id,original:'C:/fixture/'+id,created:'2026-10-27T00:00:00.000Z',categories:['车辆'],files:[],warnings:[],blockers:[],readme:'',method:'fixture',compatibility:'未验证',spawnNames:['car_'+id],dlcNames:['dlc_'+id]}
};}

test('车辆目录保留用户品牌，未填写或空白品牌使用分类后备值，输入记录不变',()=>{
 const mods=[vehicle('custom','奔驰 / 自定义品牌'),vehicle('missing'),vehicle('empty',''),vehicle('spaces','   ')],before=structuredClone(mods);
 const result=catalog(mods);
 assert.deepEqual(result.vehicles.map(v=>v.brand),['奔驰 / 自定义品牌','其他品牌','其他品牌','其他品牌']);
 assert.deepEqual(mods,before);
});

test('目录只导出启用车辆的生成引用，保持准备状态且不声称DLC加载或实时同步',()=>{
 const enabled=vehicle('enabled','测试品牌');enabled.report.spawnNames.push('second_model');
 const disabled=vehicle('disabled');disabled.status='已停用';
 const removed=vehicle('removed');removed.status='已卸载';
 const script=vehicle('script');script.report.categories=['脚本与玩法'];
 const noModel=vehicle('no-model');noModel.report.spawnNames=[];
 const result=catalog([enabled,disabled,removed,script,noModel]);
 assert.deepEqual(result.vehicles.map(v=>[v.id,v.spawnName,v.brand]),[['enabled:car_enabled','car_enabled','测试品牌'],['enabled:second_model','second_model','测试品牌']]);
 assert.equal(result.requiresGameRestart,true);
 assert.ok(result.vehicles.every(v=>v.enabled===false&&v.installState==='prepared'&&v.requiresGameRestart===true));
 assert.deepEqual(result.peds,[]);assert.deepEqual(result.properties,[]);
});

test('目录保留300字名称、145字组合标识和80字品牌，不静默裁切用户信息',()=>{
 const mod=vehicle('i'.repeat(80),'品'.repeat(80));mod.report.name='车'.repeat(300);mod.report.spawnNames=['m'.repeat(64)];
 const before=structuredClone(mod),result=JSON.parse(catalogText([mod])).vehicles[0];
 assert.equal(result.name,mod.report.name);assert.equal(result.id,mod.id+':'+mod.report.spawnNames[0]);assert.equal(result.id.length,145);assert.equal(result.brand,mod.metadata!.brand);assert.deepEqual(mod,before);
});

test('目录拒绝大小写重复模型，错误定位两个记录且不丢弃任一输入',()=>{
 const a=vehicle('a'),b=vehicle('b');a.report.spawnNames=['shared'];b.report.spawnNames=['SHARED'];const before=structuredClone([a,b]);
 assert.throws(()=>catalogText([a,b]),error=>error instanceof Error&&error.message.includes('重复')&&error.message.includes('用户车辆 a')&&error.message.includes('用户车辆 b'));
 assert.deepEqual([a,b],before);a.report.spawnNames=['within','within'];assert.throws(()=>catalogText([a]),/重复/);
});

test('2000个引用完整输出，2001个引用整次拒绝而不是截取前2000个',()=>{
 const mod=vehicle('count');mod.report.spawnNames=Array.from({length:2000},(_,i)=>'model_'+i);
 assert.equal(JSON.parse(catalogText([mod])).vehicles.length,2000);mod.report.spawnNames.push('model_2000');const before=structuredClone(mod);
 assert.throws(()=>catalogText([mod]),/2000.*未导出或截断/);assert.deepEqual(mod,before);
});

test('多字节目录pretty超2MiB时输出完整compact，可再解析且不再格式化扩容',()=>{
 const mod=vehicle('i'.repeat(80),'品'.repeat(80));mod.report.name='车'.repeat(180);mod.report.dlcNames=[];mod.report.spawnNames=Array.from({length:2000},(_,i)=>'model_'+i);
 const result=catalogText([mod]),decoded=JSON.parse(result);
 assert.ok(Buffer.byteLength(JSON.stringify(decoded,null,2))>MAX_CATALOG_BYTES);assert.ok(Buffer.byteLength(result)<=MAX_CATALOG_BYTES);
 assert.equal(result,JSON.stringify(decoded));assert.equal(decoded.vehicles.length,2000);assert.equal(decoded.vehicles[1999].spawnName,'model_1999');assert.equal(decoded.vehicles[1999].name,mod.report.name);
});

test('compact仍超2MiB则整次拒绝，不改变源记录或截短名称',()=>{
 const mod=vehicle('i'.repeat(80),'品'.repeat(80));mod.report.name='车'.repeat(200);mod.report.spawnNames=Array.from({length:2000},(_,i)=>'model_'+i);const before=structuredClone(mod);
 assert.ok(Buffer.byteLength(JSON.stringify(catalog([mod])))>MAX_CATALOG_BYTES);assert.throws(()=>catalogText([mod]),/2MiB.*未导出或截断/);assert.deepEqual(mod,before);
});

test('保存前拒绝读取端不能接受的字段，包括尾换行生成名和空白名称',()=>{
 const patches=[{name:'车'.repeat(301)},{name:'   '},{spawnNames:['car\n']},{spawnNames:['car\r']},{spawnNames:['car-1']},{spawnNames:['m'.repeat(65)]}];
 for(const patch of patches){const mod=vehicle('invalid');Object.assign(mod.report,patch);assert.throws(()=>catalogText([mod]),/目录/);}
 const id=vehicle('i'.repeat(81));id.report.spawnNames=['m'.repeat(64)];assert.throws(()=>catalogText([id]),/标识/);
 assert.throws(()=>catalogText([vehicle('brand','b'.repeat(81))]),/目录/);
});
