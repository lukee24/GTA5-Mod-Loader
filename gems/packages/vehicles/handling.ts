import {load} from 'cheerio';
import {XMLValidator} from 'fast-xml-parser';
import crypto from 'node:crypto';

import {handlingFields,type HandlingField,type HandlingChange,type HandlingModel} from './handling-fields';
export {handlingFields,type HandlingField,type HandlingChange,type HandlingModel} from './handling-fields';
const limit=4*1024**2;
const hash=(value:string)=>crypto.createHash('sha256').update(value,'utf8').digest('hex');
function number(value:unknown,integer=false):number {
 if(typeof value!=='string'||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value.trim()))throw new Error('handling 参数必须为有限十进制数值');
 const parsed=Number(value);if(!Number.isFinite(parsed)||Math.abs(parsed)>3.4028234663852886e38||integer&&(!Number.isSafeInteger(parsed)||parsed<1||parsed>2147483647))throw new Error('handling 数值超出可表达范围或挡位数不是正整数');return parsed;
}
function document(text:string){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>limit||/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(text))throw new Error('handling XML 超过4 MiB或含不受支持的声明');
 const encoding=/^\uFEFF?\s*<\?xml\b[^?]*\bencoding\s*=\s*['"]([^'"]+)['"]/i.exec(text);
 if(encoding&&!/^utf-8$/i.test(encoding[1]))throw new Error('当前 handling 副本输出只支持UTF-8，不改写其他编码声明');
 if(XMLValidator.validate(text)!==true)throw new Error('handling XML 结构无效');
 const $=load(text,{xml:{withStartIndices:true,withEndIndices:true}},false);
 const stack=$.root().contents().toArray().map(node=>({node,depth:0}));let count=0;
 while(stack.length){const {node,depth}=stack.pop()!;if(++count>100000||depth>64)throw new Error('handling XML 节点数量或嵌套超过上限');if('children'in node)for(const child of node.children)stack.push({node:child,depth:depth+1});}
 const roots=$.root().children();if(roots.length!==1||roots[0].tagName!=='CHandlingDataMgr'||roots.children('HandlingData').length!==1)throw new Error('不是受支持的 CHandlingDataMgr 文档');
 const entries=roots.children('HandlingData').children('Item');if(!entries.length||entries.length>4096)throw new Error('handling 模型数量无效或超过4096项');
 const names=new Set<string>(),models:HandlingModel[]=[];
 entries.each((_,node)=>{
  const item=$(node);if(item.attr('type')!=='CHandlingData')throw new Error('仅支持基础 CHandlingData，其他顶层类型需要独立后端');
  const nameNodes=item.children('handlingName'),name=nameNodes.text().trim();
  if(nameNodes.length!==1||nameNodes.children().length||!/^[-a-z0-9_.]{1,64}$/i.test(name)||names.has(name.toLowerCase()))throw new Error('handling 名称缺失、重复或有歧义');names.add(name.toLowerCase());
  const values:HandlingModel['values']={};
  for(const field of Object.keys(handlingFields) as HandlingField[]){const nodes=item.children(field);if(nodes.length>1)throw new Error('handling 字段重复：'+field);if(!nodes.length)continue;
   if(nodes.children().length||nodes.text().trim())throw new Error('handling 数值字段包含不受支持的内容：'+field);
   if(field==='vecCentreOfMassOffset')values[field]={x:number(nodes.attr('x')),y:number(nodes.attr('y')),z:number(nodes.attr('z'))};
   else values[field]=number(nodes.attr('value'),field==='nInitialDriveGears');
  }
  models.push({name,values});
 });
 return{$,entries,models};
}
export function readHandling(text:string):HandlingModel[]{return document(text).models;}
// Walk the opening tag and skip entire quoted values, including text resembling
// another attribute. The XML structure has already been validated above.
function attributeValue(raw:string,wanted:string){
 const space=(char:string)=>char===' '||char==='\t'||char==='\r'||char==='\n';
 let cursor=1;while(cursor<raw.length&&!space(raw[cursor])&&raw[cursor]!=='>'&&raw[cursor]!=='/')cursor++;
 while(cursor<raw.length){
  while(space(raw[cursor]))cursor++;
  if(raw[cursor]==='>'||raw[cursor]==='/')break;
  const begin=cursor;while(cursor<raw.length&&!space(raw[cursor])&&raw[cursor]!=='='&&raw[cursor]!=='>'&&raw[cursor]!=='/')cursor++;
  const name=raw.slice(begin,cursor);while(space(raw[cursor]))cursor++;
  if(!name||raw[cursor++]!=='=')break;
  while(space(raw[cursor]))cursor++;
  const quote=raw[cursor++];if(quote!=='"'&&quote!=="'")break;
  const start=cursor;while(cursor<raw.length&&raw[cursor]!==quote)cursor++;
  if(cursor>=raw.length)break;
  if(name===wanted)return{start,end:cursor,value:raw.slice(start,cursor)};
  cursor++;
 }
 throw new Error('handling 数值属性无法安全定位');
}
export function editHandling(text:string,name:string,changes:HandlingChange[]){
 const doc=document(text),model=doc.models.find(model=>model.name===name);
 if(!model)throw new Error('请选择文档中实际存在的 handling 名称');
 if(!Array.isArray(changes)||!changes.length||changes.length>64)throw new Error('handling 修改数量必须为1至64项');
 const index=doc.models.indexOf(model),item=doc.$(doc.entries[index]),edits:{start:number;end:number;value:string}[]=[],seen=new Set<string>(),applied:{field:HandlingField;axis?:'x'|'y'|'z';before:number;after:number}[]=[];
 for(const change of changes){
  if(!change||typeof change!=='object'||!Object.hasOwn(handlingFields,change.field)||typeof change.value!=='number'||!Number.isFinite(change.value))throw new Error('handling 字段或数值无效');
  const vector=change.field==='vecCentreOfMassOffset';if(vector?!['x','y','z'].includes(change.axis||''):change.axis!==undefined)throw new Error('重心须指定x/y/z，其他字段不能指定坐标轴');
  const key=change.field+':'+(change.axis||'');if(seen.has(key))throw new Error('同一 handling 字段不能重复修改');seen.add(key);
  const node=item.children(change.field).get(0);if(!node||node.startIndex===null||node.endIndex===null||node.startIndex===undefined||node.endIndex===undefined)throw new Error('字段不存在或无法定位，不自动新增：'+change.field);
  const attr=vector?change.axis!:'value',raw=text.slice(node.startIndex,node.endIndex+1);
  const match=attributeValue(raw,attr);
  const value=String(change.value);number(value,change.field==='nInitialDriveGears');
  const start=node.startIndex+match.start,end=node.startIndex+match.end;
  edits.push({start,end,value});applied.push({field:change.field,...(change.axis?{axis:change.axis}:{}),before:number(match.value),after:change.value});
 }
 let output=text;for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.value+output.slice(edit.end);
 const after=readHandling(output).find(model=>model.name===name)!;
 for(const change of applied){const value=after.values[change.field];if((change.axis?(value as {x:number;y:number;z:number})[change.axis]:value)!==change.after)throw new Error('handling 输出回读不一致');}
 return{xml:output,changes:applied,beforeSha256:hash(text),afterSha256:hash(output),validation:'数值与XML结构已检查；Enhanced兼容和游戏效果待验证'};
}
