import type {ModRecord} from '../core/types';

export const MAX_CATALOG_VEHICLES=2000;
export const MAX_CATALOG_BYTES=2*1024*1024;

/** Match the bounded native reader before opening the save dialog. No record is silently dropped. */
export function catalog(mods:ModRecord[]){
 const vehicles:{id:string;name:string;brand:string;spawnName:string;dlcName:string;enabled:false;installState:'prepared';requiresGameRestart:true}[]=[];
 const names=new Map<string,{id:string;name:string}>();
 for(const mod of mods){
  if(mod.status!=='已启用'||!mod.report.categories.includes('车辆'))continue;
  for(const spawnName of mod.report.spawnNames){
   if(typeof spawnName!=='string'||spawnName.length<1||spawnName.length>64||/[^A-Za-z0-9_]/u.test(spawnName))throw new Error('车辆目录包含无效生成名称，请核对导入记录后再导出');
   const id=mod.id+':'+spawnName,name=mod.report.name,brand=mod.metadata?.brand?.trim()?mod.metadata.brand:'其他品牌';
   if(!id.trim()||id.length>145||typeof name!=='string'||!name.trim()||name.length>300||typeof brand!=='string'||brand.length>80)throw new Error('车辆目录名称或标识超过助手读取范围，请核对导入记录后再导出');
   const previous=names.get(spawnName.toLowerCase());
   if(previous)throw new Error(`车辆生成名称「${spawnName}」重复：${previous.name}（${previous.id}）与${name}（${mod.id}）。请核对冲突记录后再导出；没有自动选择或丢弃记录。`);
   if(vehicles.length>=MAX_CATALOG_VEHICLES)throw new Error('车辆目录超过2000个生成引用上限，未导出或截断。请减少本次启用的车辆记录后重试。');
   names.set(spawnName.toLowerCase(),{id:mod.id,name});
   vehicles.push({id,name,brand,spawnName,dlcName:mod.report.dlcNames[0]||'',enabled:false,installState:'prepared',requiresGameRestart:true});
  }
 }
 return{
  schemaVersion:1,revision:new Date().toISOString(),requiresGameRestart:true,
  vehicles,peds:[],properties:[]
 };
}

export function catalogText(mods:ModRecord[]){
 const value=catalog(mods),pretty=JSON.stringify(value,null,2);
 if(Buffer.byteLength(pretty,'utf8')<=MAX_CATALOG_BYTES)return pretty;
 const compact=JSON.stringify(value);
 if(Buffer.byteLength(compact,'utf8')<=MAX_CATALOG_BYTES)return compact;
 throw new Error('车辆目录超过助手2MiB文件上限，未导出或截断。请减少本次启用的车辆记录后重试。');
}
