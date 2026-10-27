import {XMLParser,XMLValidator} from 'fast-xml-parser';

export const XML_BYTES=4*1024**2,XML_DEPTH=64,XML_ELEMENTS=50000;
/** Admission budget only. Syntax and tag pairing still use XMLValidator.
 * Scan once, skipping comments/CDATA/PI and quoted attribute values, before
 * either third-party validator or parser allocates a structural representation.
 */
function structureBudget(text:string){
 let cursor=0,depth=0,elements=0;
 while(cursor<text.length){
  const start=text.indexOf('<',cursor);if(start<0)break;
  let terminator:string|undefined,prefix=0;
  if(text.startsWith('<!--',start)){terminator='-->';prefix=4;}
  else if(text.startsWith('<![CDATA[',start)){terminator=']]>';prefix=9;}
  else if(text.startsWith('<?',start)){terminator='?>';prefix=2;}
  if(terminator){const end=text.indexOf(terminator,start+prefix);if(end<0)throw new Error('XML 结构无效');cursor=end+terminator.length;continue;}
  if(text[start+1]==='!')throw new Error('XML 含不受支持的声明');
  let end=start+1,quote='';
  for(;end<text.length;end++){
   const char=text[end];
   if(quote){if(char===quote)quote='';}
   else if(char==='"'||char==="'")quote=char;
   else if(char==='>')break;
  }
  if(end===text.length)throw new Error('XML 结构无效');
  if(text[start+1]==='/')depth--;
  else{if(++elements>XML_ELEMENTS)throw new Error('XML 元素超过'+XML_ELEMENTS+'项安全限制');if(++depth>XML_DEPTH)throw new Error('XML 嵌套超过'+XML_DEPTH+'层安全限制');if(text[end-1]==='/')depth--;}
  if(depth<0)throw new Error('XML 结构无效');cursor=end+1;
 }
}
export function safeXml(text:string){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>XML_BYTES||/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('XML 含不受支持的实体声明或超过容量限制');
 structureBudget(text);
 if(XMLValidator.validate(text)!==true)throw new Error('XML 结构无效');
 return new XMLParser({ignoreAttributes:false,processEntities:false}).parse(text);
}
