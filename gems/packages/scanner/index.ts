import fs from 'node:fs';
import path from 'node:path';
import {safeXml} from './xml';
import {readTextSnapshot} from './text-snapshot';
import {parseOiv,applyOiv} from './oiv';
export {safeXml} from './xml';
import type {Category,FileEntry,ImportReport} from '../core/types';
import {relativeSafe,noLinks,inside,inspectFileHash,MAX_FILES,MAX_BYTES,executable} from '../core/security';
import {extractZip} from './archive';
import {extractSevenZip} from './sevenzip';
import {inspectResourceHeader} from '../converter';
import {readGemsManifest,applyGemsManifest} from './manifest';
export const MAX_SCAN_ENTRIES=MAX_FILES*2;
export async function walk(root:string):Promise<{file:string;relative:string;size:number}[]>{
 const out:{file:string;relative:string;size:number}[]=[],seen=new Set<string>();let total=0,entries=0;
 async function visit(dir:string,depth=0){
  if(depth>64)throw new Error('目录嵌套超过安全限制');noLinks(root,dir);
  const directory=fs.opendirSync(dir,{bufferSize:32});
  try{let item;while((item=directory.readSync())){
   if(++entries>MAX_SCAN_ENTRIES)throw new Error('目录条目超过'+MAX_SCAN_ENTRIES+'项安全扫描限制（含文件和空目录）');
   const file=path.join(dir,item.name);noLinks(root,file);
   if(item.isDirectory())await visit(file,depth+1);
   else if(item.isFile()){
    const relative=relativeSafe(path.relative(root,file));if(seen.has(relative.toLowerCase()))throw new Error('目录包含大小写重复路径');seen.add(relative.toLowerCase());
    const size=fs.statSync(file).size;total+=size;
    if(out.length>=MAX_FILES||total>MAX_BYTES)throw new Error('模组超过安全扫描限制');out.push({file,relative,size});
   }else throw new Error('包含非普通文件，拒绝导入');
  }}finally{directory.closeSync();}
 }
 await visit(root);return out;
}
function categories(files:FileEntry[]):Category[]{const found=new Set<Category>();for(const f of files){const p=f.path.toLowerCase();if(/vehicles\.meta|handling\.meta|\.yft$/.test(p))found.add('车辆');if(/peds\.meta|pedpersonality|\.ydd$/.test(p))found.add('人物');if(/weapons\.meta|weapon|^w_/.test(p))found.add('武器');if(/\.ymap$|\.ytyp$|mlo|interior/.test(p))found.add('地图与房产');if(/\.(asi|dll|cs|lua)$/.test(p)||p.startsWith('scripts/'))found.add('脚本与玩法');if(/reshade|visualsettings|timecycle|weather|vegetation/.test(p))found.add('图形与环境');if(/\.awc$/.test(p))found.add('音效');}return found.size?[...found]:['其他'];}
export async function scan(source:string,root:string,progress:(message:string)=>void=()=>{}):Promise<ImportReport>{
  source=path.resolve(source);root=path.resolve(root);noLinks(path.parse(source).root,source);const stat=fs.statSync(source);if(stat.isDirectory()&&(root.toLowerCase()===source.toLowerCase()||root.toLowerCase().startsWith(source.toLowerCase()+path.sep)||source.toLowerCase().startsWith(root.toLowerCase()+path.sep)))throw new Error('导入目录不能包含或位于 GEMS 用户数据目录，避免递归复制');const id=crypto.randomUUID(),work=path.join(root,'imports',id),contents=path.join(work,'contents');noLinks(root,contents);fs.mkdirSync(contents,{recursive:true});
  try{
    progress('正在保留原始文件');
    if(stat.isDirectory()){const files=await walk(source);for(const f of files){const target=inside(contents,f.relative);noLinks(source,f.file);noLinks(contents,target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(f.file,target,fs.constants.COPYFILE_EXCL);}}
    else if(stat.isFile()){if(stat.size>MAX_BYTES)throw new Error('原始文件超过容量限制');const original=path.join(work,'original'+path.extname(source));noLinks(root,original);fs.copyFileSync(source,original,fs.constants.COPYFILE_EXCL);if(/\.(zip|oiv|oivs)$/i.test(source)){progress('正在安全解压');await extractZip(original,contents);}else if(/\.(rar|7z)$/i.test(source)){progress('正在核验归档目录并逐条解压');await extractSevenZip(original,contents);}else fs.copyFileSync(original,inside(contents,path.basename(source)),fs.constants.COPYFILE_EXCL);}else throw new Error('只能导入普通文件或文件夹');
    const files:FileEntry[]=[];const warnings:string[]=[],blockers:string[]=[];let readme='';let name=path.basename(source,path.extname(source)),author:string|undefined,version:string|undefined,sourceUrl:string|undefined;
    progress('正在计算 SHA-256 并分析目录');
    for(const f of await walk(contents)){const evidence=await inspectFileHash(f.file,{expectedBytes:f.size});const entry:FileEntry={path:f.relative,source:f.file,size:evidence.bytes,hash:evidence.hash,binary:executable(f.relative)};
      if(/\.(yft|ytd|ydr|ydd|ymap|ytyp|ybn|ycd|ymt|ymf)$/i.test(f.relative)){const buffer=Buffer.alloc(Math.min(f.size,16));const fd=fs.openSync(f.file,'r');try{fs.readSync(fd,buffer,0,buffer.length,0);}finally{fs.closeSync(fd);}const result=inspectResourceHeader(buffer,f.relative);entry.resource=result.edition==='legacy-header'?'Legacy 资源头；需要真实转换':result.edition==='enhanced-header'?'Enhanced 资源头；结构及游戏兼容性待验证':'未知资源头或版本';if(!result.headerValid)blockers.push('资源头损坏或当前不支持：'+f.relative);if(result.edition==='legacy-header')blockers.push('检测到 Legacy 资源：'+f.relative+'；实际转换后端未接入，已阻止自动安装');}
      if(/(?:readme|install|说明)/i.test(path.basename(f.relative))&&/\.(txt|md)$/i.test(f.relative)&&f.size<512*1024&&readme.length<512*1024)readme+=(f.relative+'\n'+fs.readFileSync(f.file,'utf8')+'\n\n').slice(0,512*1024-readme.length);
      const structured=f.relative.match(/(?:^|\/)(mods\/[^]+|scripts\/[^]+)$/i);if(structured)entry.target=relativeSafe(structured[1]);files.push(entry);
    }
    const manifest=files.find(f=>f.path.toLowerCase()==='gems.mod.json'),isOiv=/\.(oiv|oivs)$/i.test(source),dual=!!manifest&&isOiv;
    if(dual)blockers.push('OIV 包含双重安装清单，无法确认唯一安装方式；自动安装已阻止');
    if(manifest&&!isOiv){if(manifest.size>1024*1024)throw new Error('GEMS 清单过大');const m=readGemsManifest(contents,manifest.source,manifest.hash);applyGemsManifest(m,files);name=m.name||name;author=m.author;version=m.version;sourceUrl=m.sourceUrl;warnings.push('安装计划来自模组内 GEMS 清单，请检查每个目标路径');}
    if(isOiv){
      const assembly=files.find(f=>f.path.toLowerCase()==='assembly.xml');
      if(!assembly){for(const file of files)delete file.target;blockers.push('OIV 缺少 assembly.xml');}
      else{const plan=parseOiv(readTextSnapshot(contents,assembly.source,4*1024**2,'XML',assembly.hash),name);name=plan.name;author=plan.author;version=plan.version;blockers.push(...plan.blockers);if(dual)plan.operations=[];applyOiv(plan,files);if(!blockers.length)warnings.push('仅支持 OIV 顶层明确文件添加；RPF 操作未启用');}
    }
    const spawnNames:string[]=[],dlcNames:string[]=[];
    for(const f of files){if(/vehicles\.meta$/i.test(f.path)&&f.size<4*1024**2){try{const parsed=safeXml(fs.readFileSync(f.source,'utf8'));function visit(v:any){if(!v||typeof v!=='object')return;for(const [key,value]of Object.entries(v)){if(key==='modelName'&&typeof value==='string'&&/^[a-z0-9_]{1,64}$/i.test(value))spawnNames.push(value);else if(Array.isArray(value))value.forEach(visit);else visit(value);}}visit(parsed);}catch{warnings.push('vehicles.meta 无法安全解析');}}
      if(/(?:^|\/)dlc\.rpf$/i.test(f.path)){const segment=f.path.split('/');dlcNames.push(segment.at(-2)||'未知 DLC');}}
    if(dlcNames.length)blockers.push('发现 DLC：当前尚未验证 RPF 加载列表写入，不能自动注册或声称已启用');
    if(files.some(f=>/\.rpf$/i.test(f.path)))warnings.push('RPF 内容、加密状态及资源兼容性需要在 RPF 浏览器进一步检查');
    if(!files.some(f=>f.target))blockers.push('无法确认完整安装路径。请提供明确的 mods / scripts 目录结构或 GEMS 安装清单');
    if(files.some(f=>f.binary))warnings.push('含可执行脚本或插件，文件哈希不代表安全无毒；安装时需要额外确认');
    const report:ImportReport={id,name,original:source,created:new Date().toISOString(),categories:categories(files),files,warnings,blockers,readme:readme.slice(0,512*1024),method:dual?'双重安装清单（未执行）':isOiv?'OIV 有限操作':manifest?'GEMS 清单':'明确目录结构',compatibility:'无法确定；尚未进行游戏加载验证',author,version,sourceUrl,spawnNames:[...new Set(spawnNames)],dlcNames:[...new Set(dlcNames)]};return report;
  }catch(e){fs.writeFileSync(path.join(work,'failure.txt'),String(e),'utf8');throw e;}
}
