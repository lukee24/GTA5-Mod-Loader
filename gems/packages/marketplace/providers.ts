import {classify} from './taxonomy';
import type {MarketAsset,SiteId} from './types';
export const sites = [
  {id:'gta5mods' as SiteId,name:'GTA5-Mods',description:'公开分类目录、作者预览图与标签已接入上方卡片；自动搜索/下载跳转受站点规则限制。',url:'https://www.gta5-mods.com/'},
  {id:'nexus' as SiteId,name:'Nexus Mods',description:'官方网站浏览；应用 API 注册与授权下载尚未接入，不抓取或绕过会员限制。',url:'https://www.nexusmods.com/gta5'},
  {id:'github' as SiteId,name:'GitHub',description:'读取指定公开仓库的最新 8 个正式版本，直接下载作者发布的 ZIP / OIV 文件。',url:'https://github.com/'}
];
export function repositoryName(value:unknown):string {
  if(typeof value!=='string'||value.length>200)throw new Error('请输入 GitHub 作者/仓库，或该仓库的网址');
  let input=value.trim();
  if(input.startsWith('https://')){const u=new URL(input);if(u.hostname!=='github.com'||u.port||u.username||u.password||u.search||u.hash)throw new Error('只能添加 GitHub 公开仓库网址');input=u.pathname.replace(/^\/+|\/+$/g,'');}
  if(!/^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9_.-]{1,100}$/i.test(input)||input.split('/').some(s=>s==='.'||s==='..'))throw new Error('仓库格式应为 作者/仓库');
  return input;
}
export function officialUrl(site:unknown,category:unknown='全部',brand:unknown='',vehicleType:unknown=''):string {
  if(site==='nexus')return sites[1].url;
  if(site==='github')return sites[2].url;
  if(site!=='gta5mods')throw new Error('未知模组网站');
  const paths:Record<string,string>={'车辆':'vehicles','人物':'player','武器':'weapons','地图与房产':'maps','脚本与玩法':'scripts','图形与环境':'misc','工具':'tools'};
  const brandTags:Record<string,string>={'奔驰':'mercedes-benz','宝马':'bmw','奥迪':'audi','保时捷':'porsche','法拉利':'ferrari','兰博基尼':'lamborghini','迈凯伦':'mclaren','阿斯顿·马丁':'aston-martin','劳斯莱斯':'rolls-royce','宾利':'bentley','布加迪':'bugatti','帕加尼':'pagani','科尔维特':'corvette','路虎':'range-rover','凯迪拉克':'cadillac','小米汽车':'xiaomi','丰田':'toyota','雷克萨斯':'lexus','日产':'nissan','本田':'honda','福特':'ford','雪佛兰':'chevrolet','道奇':'dodge','特斯拉':'tesla','迈巴赫':'mercedes-benz'};
  const typeTags:Record<string,string>={'SUV':'suv','卡车':'truck','巴士':'bus','摩托车':'bike','飞机':'aircraft','直升机':'helicopter','船舶':'boat','军用载具':'tank'};
  const tags=[typeTags[String(vehicleType)],brandTags[String(brand)]].filter(Boolean);
  // 网站只提供部分车型标签；详细车型筛选用于读取后的目录，不假设网站拥有全部标签。
  const url=new URL(category==='车辆'&&tags.length?'vehicles/tags/'+encodeURIComponent(tags.join('+')):paths[String(category)]||'',sites[0].url);
  return url.href;
}
export function parseReleases(repository:string,value:unknown):MarketAsset[]{
  if(!Array.isArray(value)||value.length>100)throw new Error('网站返回的发布列表格式无效');
  const out:MarketAsset[]=[];
  for(const release of value.slice(0,8)){
    if(!release||release.draft||release.prerelease||!Array.isArray(release.assets))continue;
    const page=new URL(String(release.html_url));
    if(page.hostname!=='github.com'||page.port||!page.pathname.toLowerCase().startsWith('/'+repository.toLowerCase()+'/releases/')||page.search||page.hash||page.username||page.password||page.protocol!=='https:')throw new Error('发布来源与仓库不一致');
    const description=String(release.body||'').replace(/[\x00-\x08\x0b-\x1f]/g,'').slice(0,12000);
    for(const asset of release.assets.slice(0,100)){
      if(asset.state!=='uploaded'||!Number.isSafeInteger(asset.id)||asset.id<1||typeof asset.name!=='string'||!Number.isSafeInteger(asset.size)||asset.size<1||! /\.(zip|oiv|oivs)$/i.test(asset.name))continue;
      const download=new URL(String(asset.browser_download_url));
      if(download.protocol!=='https:'||download.hostname!=='github.com'||download.port||download.username||download.password||download.search||download.hash||!download.pathname.toLowerCase().startsWith('/'+repository.toLowerCase()+'/releases/download/'))throw new Error('发布包下载网址无效');
      const name=String(release.name||release.tag_name||repository).slice(0,200);
      out.push({id:repository+':'+asset.id,repository,name:asset.name.slice(0,200),version:String(release.tag_name||'未注明').slice(0,100),author:repository.split('/')[0],pageUrl:page.href,downloadUrl:download.href,size:asset.size,digest:/^sha256:[a-f0-9]{64}$/i.test(asset.digest||'')?asset.digest.slice(7).toLowerCase():null,published:String(release.published_at||''),description:name+'\n'+description,...classify(repository+' '+name+' '+asset.name+' '+description),classification:'作者发布文字的候选分类；下载后扫描确认',compatibility:'未检查资源；游戏兼容性待验证'});
    }
  }
  return out;
}
