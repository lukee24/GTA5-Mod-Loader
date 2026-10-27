import {handlingFields,type HandlingField,type HandlingModel,type HandlingChange} from './handling-fields';
export interface HandlingRow {key:string;label:string;field:HandlingField;axis?:'x'|'y'|'z';before:number;}
export function handlingRows(model:HandlingModel):HandlingRow[]{
 const rows:HandlingRow[]=[];
 for(const field of Object.keys(handlingFields) as HandlingField[]){const value=model.values[field];if(value===undefined)continue;
  if(typeof value==='number')rows.push({key:field,label:handlingFields[field],field,before:value});
  else for(const axis of ['x','y','z'] as const)rows.push({key:field+'.'+axis,label:handlingFields[field]+' '+axis.toUpperCase()+' 轴',field,axis,before:value[axis]});
 }return rows;
}
export function handlingDraft(rows:HandlingRow[],draft:Record<string,string>){
 const changes:HandlingChange[]=[],issues:string[]=[];
 for(const row of rows){const raw=draft[row.key]??String(row.before),value=Number(raw);
  if(raw.length>128||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(raw.trim())||!Number.isFinite(value)||Math.abs(value)>3.4028234663852886e38||row.field==='nInitialDriveGears'&&(!Number.isSafeInteger(value)||value<1||value>2147483647))issues.push(row.label+'：请输入可表达的有限数值，挡位数须为正整数');
  else if(value!==row.before)changes.push({field:row.field,...(row.axis?{axis:row.axis}:{}),value});
 }
 return{changes,issues,dirty:issues.length>0||changes.length>0};
}
