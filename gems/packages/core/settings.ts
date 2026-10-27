import type {Settings} from './types';
import type {Store} from '../database';
export interface WindowSettings {x:number;y:number;width:number;height:number;maximized:boolean}
const defaults:Settings={gamePath:'',theme:'dark',accent:'#4B8BFF',reduceMotion:false,scale:1,collapsed:false};
const editable=['theme','accent','reduceMotion','scale','collapsed'];
function object(value:unknown,keys:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('设置记录或请求字段无效，原设置已保留');
  return value as Record<string,unknown>;
}
function document(store:Store,id:'main'|'window'):unknown{
  const row=store.settingsRow(id);if(!row)return undefined;
  if(row.json===null)throw new Error('设置记录超过 64 KiB 或不是文本，原记录已保留');
  try{return JSON.parse(row.json);}catch{throw new Error('设置记录不是有效 JSON，原记录已保留');}
}
function gamePath(value:unknown):value is string{
  if(typeof value!=='string'||value.length>4096||/[\x00-\x1f\x7f]/u.test(value))return false;
  if(value==='')return true;
  if(!/^[a-z]:[\\/]/i.test(value))return false;
  const rest=value.slice(3).replace(/[\\/]+$/u,'');
  return !/[:<>"|?*]/u.test(rest)&&(!rest||rest.split(/[\\/]/u).every(part=>part.length>0&&part!=='.'&&part!=='..'&&!/[. ]$/u.test(part)));
}
function validateMain(value:unknown):Settings{
  const record=object(value,['gamePath',...editable]);
  if(!gamePath(record.gamePath)||!['dark','light'].includes(record.theme as string)||typeof record.accent!=='string'||!/^#[0-9a-f]{6}$/i.test(record.accent)||typeof record.reduceMotion!=='boolean'||typeof record.collapsed!=='boolean'||![0.9,1,1.1,1.2].includes(record.scale as number))throw new Error('设置字段无效：请核对游戏路径、主题、颜色、开关与缩放，原设置已保留');
  return {...record} as unknown as Settings;
}
export function readSettings(store:Store):Settings{
  const row=document(store,'main');return row===undefined?{...defaults}:validateMain(row);
}
export function readWindowSettings(store:Store):WindowSettings|undefined{
  const row=document(store,'window');if(row===undefined)return undefined;
  return validateWindow(row);
}
function validateWindow(row:unknown):WindowSettings{
  const r=object(row,['x','y','width','height','maximized']);
  if(!Number.isSafeInteger(r.x)||!Number.isSafeInteger(r.y)||Math.abs(r.x as number)>1000000||Math.abs(r.y as number)>1000000||!Number.isSafeInteger(r.width)||!Number.isSafeInteger(r.height)||(r.width as number)<980||(r.width as number)>16384||(r.height as number)<700||(r.height as number)>16384||typeof r.maximized!=='boolean')throw new Error('窗口设置的尺寸、位置或最大化状态无效，原设置已保留');
  return {...r} as unknown as WindowSettings;
}
// Used only after the existing native game-directory selection/environment checks.
export function bindGameSettings(store:Store,path:unknown):Settings{
  const next=validateMain({...readSettings(store),gamePath:path});store.put('settings','main',next);return next;
}
export function saveWindowSettings(store:Store,value:unknown):void{
  store.put('settings','window',validateWindow(value));
}
export function updateSettings(store:Store,args:unknown):Settings{
  const patch=object(args,editable),next=validateMain({...readSettings(store),...patch});
  store.put('settings','main',next);return next;
}
