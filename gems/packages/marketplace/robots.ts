import {clientUserAgent} from './client-identity';
export const robotsBytesLimit=512*1024;
const patternLimit=4096,recordLimit=4096,pathLimit=8192,workLimit=8_000_000;
interface Rule {allow:boolean;pattern:string;anchored:boolean;specificity:number;}
interface Group {agents:string[];rules:Rule[];startedRules:boolean;}

function invalid(){return new Error('站点抓取规则格式无法确认，停止自动读取');}
function normalized(value:string,pattern=false):string{
  let output='';
  for(let i=0;i<value.length;){
    const char=value[i];
    if(char==='%'){
      const hex=value.slice(i+1,i+3);if(!/^[0-9a-f]{2}$/i.test(hex))throw invalid();
      const byte=Number.parseInt(hex,16),decoded=String.fromCharCode(byte);
      output+=/[a-z0-9_.~-]/i.test(decoded)?decoded:'%'+hex.toUpperCase();i+=3;
    }else{
      const code=value.codePointAt(i)!;if(code>=0xd800&&code<=0xdfff)throw invalid();
      const point=String.fromCodePoint(code);i+=point.length;
      if(code>127||point==='$'||point==='*'&&!pattern)output+=[...Buffer.from(point)].map(byte=>'%'+byte.toString(16).toUpperCase().padStart(2,'0')).join('');else output+=point;
    }
  }
  return output;
}
function parse(text:string):Group[]{
  if(Buffer.byteLength(text)>robotsBytesLimit)throw new Error('站点抓取规则超过512 KiB读取上限');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw invalid();
  const groups:Group[]=[];let group:Group|undefined,records=0,recognized=false,content=false;
  for(const line of text.replace(/^\uFEFF/,'').split(/\r\n|\r|\n/)){
    const clean=line.split('#',1)[0].trim();if(!clean)continue;content=true;
    const colon=clean.indexOf(':');if(colon<1)throw invalid();
    const key=clean.slice(0,colon).trim().toLowerCase(),value=clean.slice(colon+1).trim();
    if(!/^[a-z][a-z-]*$/.test(key))throw invalid();
    if(key==='user-agent'){
      recognized=true;if(!/^(?:[a-z_-]+|\*)$/i.test(value))throw invalid();
      if(++records>recordLimit)throw new Error('站点抓取规则项目超过上限');
      if(!group||group.startedRules){group={agents:[],rules:[],startedRules:false};groups.push(group);}group.agents.push(value.toLowerCase());
    }else if(key==='allow'||key==='disallow'){
      recognized=true;if(!group)continue;group.startedRules=true;
      if(++records>recordLimit)throw new Error('站点抓取规则项目超过上限');
      if(!value)continue;
      if(!value.startsWith('/')||/\s/.test(value))throw invalid();
      const anchored=value.endsWith('$'),literal=anchored?value.slice(0,-1):value;
      if(literal.includes('$'))throw invalid(); // Literal dollars must use %24, never regex syntax.
      const pattern=normalized(literal,true);if(pattern.length>patternLimit)throw new Error('站点抓取规则路径超过上限');
      group.rules.push({allow:key==='allow',pattern,anchored,specificity:pattern.replaceAll('*','').length});
    }else if(key==='sitemap')recognized=true;
    // Extension records are not followed and never terminate a group.
  }
  if(content&&!recognized)throw invalid();return groups;
}
function matches(rule:Rule,path:string):boolean{
  let row=new Uint8Array(path.length+1);row[0]=1;
  for(const token of rule.pattern){
    if(token==='*'){for(let i=1;i<=path.length;i++)row[i]|=row[i-1];}
    else{const next=new Uint8Array(path.length+1);for(let i=1;i<=path.length;i++)if(row[i-1]&&path[i-1]===token)next[i]=1;row=next;}
  }
  return rule.anchored?row[path.length]===1:row.some(value=>value===1);
}
/** Bounded RFC 9309-inspired matching; unsupported/oversized input rejects instead of partially allowing. */
export function robotsAllows(text:string,url:string):boolean{
  const groups=parse(text);if(url.length>pathLimit)throw new Error('抓取规则匹配地址超过上限');
  const uri=new URL(url);if(uri.pathname==='/robots.txt')return true;
  const path=normalized(uri.pathname+uri.search);if(path.length>pathLimit)throw new Error('抓取规则匹配地址超过上限');
  const specific=groups.filter(group=>group.agents.includes(clientUserAgent.toLowerCase())),selected=specific.length?specific:groups.filter(group=>group.agents.includes('*'));
  let budget=workLimit,best=-1,allowed=true;
  for(const {rules} of selected)for(const rule of rules){
    budget-=(path.length+1)*rule.pattern.length;if(budget<0)throw new Error('站点抓取规则超过匹配计算上限，停止自动读取');
    if(matches(rule,path)&&(rule.specificity>best||rule.specificity===best&&rule.allow)){best=rule.specificity;allowed=rule.allow;}
  }
  return allowed;
}
