import type {Store,DocumentChange} from '../database';
import {repositoryName} from './providers';

export interface SavedSource {
  format:1;id:string;repository:string;label:string;added:string;lastChecked:string|null;lastAssetCount:number|null;
}
const SOURCE_KIND='market-source',SETTINGS_KIND='market-settings';
export const SOURCE_LIMIT=50;
function sourceId(value:unknown){return repositoryName(value).toLowerCase();}
function validDate(value:unknown){return typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace(/(?:\.(\d{1,3}))?Z$/,(_,fraction:string)=>'.'+(fraction||'').padEnd(3,'0')+'Z');}
function labelText(value:unknown,fallback:string){if(value===undefined)return fallback;if(typeof value!=='string'||value.length>80||/[\x00-\x1f\x7f]/.test(value))throw new Error('来源名称需要为 80 字以内的普通文字');return value.trim()||fallback;}
function readSource(value:unknown,key:unknown):SavedSource {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(field=>!['format','id','repository','label','added','lastChecked','lastAssetCount'].includes(field)))throw new Error('来源记录格式损坏');
  const source=value as SavedSource;
  if(source.format!==1||source.id!==key||repositoryName(source.repository)!==source.repository||sourceId(source.repository)!==source.id||typeof source.label!=='string'||!source.label.trim()||source.label!==labelText(source.label,source.repository)||!validDate(source.added)||source.lastChecked!==null&&!validDate(source.lastChecked)||source.lastAssetCount!==null&&(!Number.isSafeInteger(source.lastAssetCount)||source.lastAssetCount<0||source.lastAssetCount>800))throw new Error('来源记录格式或版本不受支持');
  return source;
}
// 只保存用户来源收藏与读取时间，不保存账户凭据、不后台抓取、不缓存可下载文件 URL。
export class SourceLibrary {
  constructor(private store:Store){}
  private saved(id:string){
    const row=this.store.sourceRow(SOURCE_KIND,id);if(!row)return undefined;
    try{if(row.json===null)throw new Error();return readSource(JSON.parse(row.json),id);}catch{throw new Error('来源收藏记录损坏、超限或版本不受支持；原记录已保留');}
  }
  view(){
    const sources:SavedSource[]=[],issues:string[]=[];
    const sample=this.store.sourceRows();if(sample.total>SOURCE_LIMIT)issues.push('已保存来源超过50条显示限制；仅读取最近51条样本，请保留原数据后检查');
    for(const row of sample.rows){
      try{if(row.json===null)throw new Error();const source=readSource(JSON.parse(row.json),row.id);if(sources.length<SOURCE_LIMIT)sources.push(source);}catch{issues.push('发现损坏、超限或未知版本的来源收藏；原记录已保留，没有执行网址');}
    }
    let repository='';const row=this.store.sourceRow(SETTINGS_KIND,'main');
    if(row){try{if(row.json===null)throw new Error();const settings=JSON.parse(row.json);if(!settings||typeof settings!=='object'||Array.isArray(settings)||Object.keys(settings).some(key=>!['format','repository'].includes(key))||settings.format!==1||typeof settings.repository!=='string')throw new Error();repository=settings.repository?repositoryName(settings.repository):'';}catch{issues.push('上次使用的来源记录无效；请重新选择来源');}}
    return {sources,repository,issues:[...new Set(issues)]};
  }
  remember(value:unknown){const repository=value===''?'':repositoryName(value);this.store.put(SETTINGS_KIND,'main',{format:1,repository});return repository;}
  save(value:unknown,label?:unknown){
    const repository=repositoryName(value),id=sourceId(repository),old=this.saved(id);
    if(!old&&this.store.sourceCount()>=SOURCE_LIMIT)throw new Error('最多保存 50 个来源，请先移除不需要的收藏');
    const source:SavedSource={format:1,id,repository:old?.repository||repository,label:labelText(label,old?.label||repository),added:old?.added||new Date().toISOString(),lastChecked:old?.lastChecked||null,lastAssetCount:old?.lastAssetCount??null};
    this.store.writeBatch([{operation:'put',kind:SOURCE_KIND,id,value:source},{operation:'put',kind:SETTINGS_KIND,id:'main',value:{format:1,repository:source.repository}}]);return source;
  }
  select(value:unknown){const source=this.saved(sourceId(value));if(source===undefined)throw new Error('来源收藏不存在');return this.remember(source.repository);}
  remove(value:unknown){
    const id=sourceId(value),source=this.saved(id);if(source===undefined)throw new Error('来源收藏不存在');
    this.store.writeBatch([...(this.view().repository.toLowerCase()===id?[{operation:'put' as const,kind:SETTINGS_KIND,id:'main',value:{format:1,repository:''}}]:[]),{operation:'remove',kind:SOURCE_KIND,id}]);return id;
  }
  recordRead(value:unknown,count:number,checked:string){
    const repository=repositoryName(value);if(!Number.isSafeInteger(count)||count<0||count>800||!validDate(checked))throw new Error('来源读取记录无效');
    const source=this.saved(sourceId(repository));
    const sourceChanges:DocumentChange[]=[];if(source!==undefined)sourceChanges.push({operation:'put',kind:SOURCE_KIND,id:source.id,value:{...source,lastChecked:checked,lastAssetCount:count}});
    this.store.writeBatch([...sourceChanges,{operation:'put',kind:SETTINGS_KIND,id:'main',value:{format:1,repository}}]);
  }
}
