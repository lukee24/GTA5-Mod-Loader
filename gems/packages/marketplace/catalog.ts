import {load} from 'cheerio';
import {robotsAllows,robotsBytesLimit} from './robots';
export {robotsAllows} from './robots';
import {awaitAbort} from '../core/await-abort';
import {previewDimensions} from './preview';
export {previewDimensions} from './preview';
import type {Transport} from './network';
import {trustedResponse} from './network';
import {classify,vehicleBrands} from './taxonomy';
import {catalogCategories,catalogKinds,catalogFacets as visibleFacets} from './catalog-ui';
export {catalogCategories,catalogKinds} from './catalog-ui';

const brandTags=['mercedes-benz','mercedes-benz','bmw','audi','porsche','ferrari','lamborghini','mclaren','aston-martin','rolls-royce','bentley','bugatti','pagani','corvette','range-rover','cadillac','xiaomi','toyota','lexus','nissan','honda','ford','chevrolet','dodge','tesla'];
const tagNames:Record<string,string>={'Car':'汽车','Bike':'摩托车','Aircraft':'飞机','Helicopter':'直升机','Boat':'船舶','Truck':'卡车','Bus':'巴士','Tank':'军用载具','Add-On':'新增载具','Replace':'替换资源','Enhanced':'作者标注增强版','Clothing':'服装','Skin':'皮肤','Weapon':'武器','MLO':'室内场景','Ymap':'场景地图','Graphics':'画质','Sound':'声音','Template':'贴图模板','Tuning':'改装','Livery':'涂装','Featured':'站点精选','Script Hook':'脚本接口','Trainer':'修改器','Mission':'任务'};
export interface CatalogQuery {category:string;kind:string;brand:string;page:number}
export interface CatalogItem {id:string;site:'gta5mods'|'github';name:string;author:string;version:string;pageUrl:string;imageUrl:string|null;categories:string[];brands:string[];vehicleTypes:string[];tags:string[];compatibility:string;downloads:number|null;rating:number|null;assetId?:string}
export interface CatalogPage {query:CatalogQuery;items:CatalogItem[];hasNext:boolean;checked:string;sourceUrl:string;notices:string[]}
export function catalogQuery(input:any):CatalogQuery {
  const query={category:input?.category??'车辆',kind:input?.kind??'全部载具',brand:input?.brand??'全部品牌',page:input?.page??1};
  if(!Object.hasOwn(catalogCategories,query.category)||!Object.hasOwn(catalogKinds,query.kind)||query.brand!=='全部品牌'&&!vehicleBrands.includes(query.brand)||!Number.isSafeInteger(query.page)||query.page<1||query.page>20)throw new Error('目录类别、品牌、载具类别或页码无效');
  if(query.category!=='车辆'){query.kind='全部载具';query.brand='全部品牌';}if(!['全部载具','汽车'].includes(query.kind))query.brand='全部品牌';return query;
}
export function catalogUrl(query:CatalogQuery){query=catalogQuery(query);const category=catalogCategories[query.category as keyof typeof catalogCategories],tags=query.category==='车辆'?[catalogKinds[query.kind as keyof typeof catalogKinds],query.brand==='全部品牌'?'':brandTags[vehicleBrands.indexOf(query.brand)]].filter(Boolean):[];return'https://www.gta5-mods.com/'+category+(tags.length?'/tags/'+tags.join('+'):'')+(query.page===1?'':'/'+query.page);}
function websiteUrl(value:string,base:string,image=false){const u=new URL(value,base);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search||u.href.length>2000||u.hostname!==(image?'img.gta5-mods.com':'www.gta5-mods.com'))throw new Error('目录包含不受支持的来源网址');if(image&&!/^\/q75-w500-h333-cfill\/images\/.+\.(jpe?g|png|webp)$/i.test(u.pathname))throw new Error('预览图片地址不受支持');return u.href;}
export function parseCatalog(html:string,query:CatalogQuery):CatalogPage{
  query=catalogQuery(query);if(Buffer.byteLength(html)>4*1024**2)throw new Error('模组目录页面超过4 MiB上限');const sourceUrl=catalogUrl(query),$=load(html),nodes=$('.file-list-obj');if(nodes.length>60)throw new Error('模组目录条目超过单页上限');if(!nodes.length&&!/no (files|results|mods) (found|available)/i.test($('body').text()))throw new Error('网站目录结构已变化或需要验证，无法读取真实模组列表');
  const items:CatalogItem[]=[],ids=new Set<string>();nodes.each((_,node)=>{const row=$(node),link=row.find('.details .name a').first(),name=link.text().trim().slice(0,240);if(!name||!link.attr('href'))throw new Error('目录条目缺少名称或来源');const pageUrl=websiteUrl(link.attr('href')!,sourceUrl);if(!/^\/(vehicles|player|weapons|maps|scripts|misc|tools)\/[a-z0-9_-]+$/i.test(new URL(pageUrl).pathname))throw new Error('目录条目来源路径无效');const id='gta5mods:'+new URL(pageUrl).pathname;if(ids.has(id))return;ids.add(id);const tags=row.find('.categories li').map((_,node)=>$(node).text().trim().slice(0,80)).get().slice(0,24),inferred=classify(name+' '+tags.join(' ')),rawImage=row.find('a.preview img').attr('src');let imageUrl:string|null=null;try{if(rawImage)imageUrl=websiteUrl(rawImage,sourceUrl,true);}catch{/* Unsafe/unavailable images stay absent, never execute markup. */}
    const downloadsText=row.find('[title$=" Downloads"]').first().attr('title')||'',downloadMatch=/^((?:[0-9]{1,3}(?:,[0-9]{3})+)|[0-9]+) Downloads$/i.exec(downloadsText),downloadValue=downloadMatch?Number(downloadMatch[1].replaceAll(',','')):NaN,ratingText=row.find('[title$=" star rating"]').first().attr('title')||'',ratingMatch=/^([0-9](?:\.[0-9]+)?) star rating$/i.exec(ratingText),ratingValue=ratingMatch?Number(ratingMatch[1]):NaN;
    items.push({id,site:'gta5mods',name,author:row.find('.details .bottom a').text().trim().slice(0,120)||'未注明',version:row.find('.details .version').text().trim().slice(0,80)||'未注明',pageUrl,imageUrl,categories:[query.category],brands:inferred.brands,vehicleTypes:[...new Set([...tags.filter(tag=>['Car','Bike','Aircraft','Helicopter','Boat','Truck','Bus','Tank'].includes(tag)).map(tag=>tagNames[tag]),...inferred.vehicleTypes])],tags:tags.map(tag=>tagNames[tag]||tag),compatibility:tags.includes('Enhanced')?'作者标注 Enhanced；资源和游戏待验证':/legacy.?only|仅.*legacy/i.test(name)?'作者注明仅 Legacy；尚未独立核验':'增强版支持未知；资源和游戏待验证',downloads:downloadsText&&Number.isSafeInteger(downloadValue)?downloadValue:null,rating:Number.isFinite(ratingValue)&&ratingValue>=0&&ratingValue<=5?ratingValue:null});});
  return{query,items,hasNext:$('.pagination .next:not(.disabled) a').length>0,checked:new Date().toISOString(),sourceUrl,notices:['检索与下级分类仅覆盖已载入页，可继续载入下一页。','站点限制自动抓取搜索和下载跳转；当前目录不提供绕过限制的自动下载。']};
}
export function catalogFacets(items:CatalogItem[],brand='全部品牌',kind='全部载具'){return visibleFacets(items.filter(item=>(brand==='全部品牌'||item.brands.includes(brand))&&(kind==='全部载具'||item.vehicleTypes.includes(kind))));}
async function body(url:string,signal:AbortSignal,transport:Transport,max:number,html=false,robots=false){const response=await transport(url,signal);let size=0;const chunks:Buffer[]=[];try{const type=String(response.headers['content-type']||'').trim();if(html&&!/^text\/html(?:;|$)/i.test(type))throw new Error('站点没有返回模组目录页面');if(robots&&!/^text\/plain(?:;|$)/i.test(type))throw new Error('站点没有返回有效的抓取规则：需要text/plain文本');for await(const part of response){signal.throwIfAborted();const chunk=Buffer.from(part);size+=chunk.length;if(size>max)throw new Error('站点响应超过读取上限');chunks.push(chunk);}signal.throwIfAborted();return Buffer.concat(chunks);}finally{response.destroy();}}
export class ModCatalog{
  private pages=new Map<string,{page:CatalogPage;observed:number}>();
  private items=new Map<string,CatalogItem>();private robots:{text:string;checked:number}|null=null;
  private images=new Map<string,string>();private inFlight=new Map<string,Promise<CatalogPage>>();private lastRead:number|null=null;
  constructor(private transport:Transport=trustedResponse){}
  private fresh(observed:number,ttl:number){const age=Date.now()-observed;return Number.isFinite(age)&&age>=0&&age<ttl;}
  private rebuildItems(){this.items.clear();for(const {page} of this.pages.values())for(const item of page.items)this.items.set(item.id,item);}
  private expirePages(){for(const [url,record] of this.pages)if(!this.fresh(record.observed,5*60*1000))this.pages.delete(url);this.rebuildItems();}
  private result(page:CatalogPage,query:CatalogQuery){return structuredClone({...page,query});}
  async read(input:unknown,signal:AbortSignal){
    signal.throwIfAborted();const query=catalogQuery(input),url=catalogUrl(query),refresh=(input as any)?.refresh;
    if(refresh!==undefined&&typeof refresh!=='boolean')throw new Error('目录刷新参数无效');
    this.expirePages();const cached=this.pages.get(url);
    // Site aliases share bytes, but each caller keeps its own display query.
    if(!refresh&&cached)return this.result(cached.page,query);
    const pending=this.inFlight.get(url);if(pending)return this.result(await awaitAbort(()=>pending,signal),query);
    if(this.inFlight.size)throw new Error('目录正在读取，请等待当前请求完成');
    const now=Date.now(),elapsed=this.lastRead===null?Infinity:now-this.lastRead;
    if(elapsed>=0&&elapsed<1000)throw new Error('目录读取过于频繁，请稍后重试');this.lastRead=now;
    const job=(async()=>{
      let allowed:boolean;
      if(!this.robots||!this.fresh(this.robots.checked,3600000)){
        const bytes=await body('https://www.gta5-mods.com/robots.txt',signal,this.transport,robotsBytesLimit,false,true),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
        if(/<html|<!doctype/i.test(text))throw new Error('站点没有返回有效的抓取规则，停止自动读取');
        allowed=robotsAllows(text,url);this.robots={text,checked:Date.now()};
      }else allowed=robotsAllows(this.robots.text,url);
      if(!allowed)throw new Error('网站规则不允许自动读取此目录，未发起页面请求');
      const bytes=await body(url,signal,this.transport,4*1024**2,true),page=parseCatalog(new TextDecoder('utf-8',{fatal:true}).decode(bytes),query);
      this.expirePages();
      // Clear the directory only after successful first-page refresh; failures preserve valid evidence.
      if(refresh&&query.page===1){const family=catalogUrl({...query,page:1});for(const [key,record] of this.pages)if(catalogUrl({...record.page.query,page:1})===family)this.pages.delete(key);}
      this.pages.delete(url);if(this.pages.size>=24)this.pages.delete(this.pages.keys().next().value!);
      this.pages.set(url,{page,observed:Date.now()});this.rebuildItems();return page;
    })();
    this.inFlight.set(url,job);try{return this.result(await job,query);}finally{this.inFlight.delete(url);}
  }
  item(id:unknown){if(typeof id!=='string')throw new Error('模组条目标识无效');this.expirePages();const item=this.items.get(id);if(!item)throw new Error('模组目录记录已过期，请重新读取');return structuredClone(item);}
  async thumbnail(id:unknown,signal:AbortSignal){
    signal.throwIfAborted();const item=this.item(id);if(!item.imageUrl)throw new Error('作者没有受支持的预览图片');const cached=this.images.get(item.imageUrl);if(cached)return cached;
    const bytes=await body(item.imageUrl,signal,this.transport,1024*1024);
    if(this.item(id).imageUrl!==item.imageUrl)throw new Error('模组预览记录已更新，请重新读取');
    const {mime}=previewDimensions(bytes),data='data:'+mime+';base64,'+bytes.toString('base64');if(this.images.size>=12)this.images.delete(this.images.keys().next().value!);this.images.set(item.imageUrl,data);return data;
  }
}
