import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileSearch,RefreshCw,Download,Search,AlertTriangle,Star,UserRound} from 'lucide-react';
import type {State} from '../../packages/core/types';
import type {PedIndexView,PedUserState,PedUserTag,PedThumbnailView} from '../../packages/peds/types';
import './ped-catalog.css';

const sourceKey=(row:PedIndexView)=>row.source.kind+':'+row.source.id;
const indexLabels={unindexed:'尚未解析',current:'报告指纹匹配',stale:'来源报告已变化',invalid:'索引无法读取'};
const analysisLabels={parsed:'已解析声明',partial:'部分解析',unsupported:'当前格式未支持'};
const kindLabels:Record<string,string>={addon:'声明为新增','npc-replace':'声明为NPC替换','protagonist-replace':'声明为主角替换',unknown:'新增／替换未知'};
const tagLabels:Record<PedUserTag,string>={military:'军事',police:'警察',civilian:'平民',animal:'动物'};
const dependencyLabels:Record<string,string>={props:'配饰', 'clip-dictionary':'动作字典','expression-dictionary':'表情字典','creature-metadata':'生物元数据','movement-clip-set':'移动动作集',dlc:'DLC',runtime:'运行环境',file:'文件'};
const fileLabels:Record<string,string>={verified:'文件已核验',disabled:'已停用',uninstalled:'已卸载',pending:'事务待处理',missing:'文件缺失',changed:'文件已变化',shadowed:'被其他安装占用',unverified:'文件未核验'};

export function PedCatalogPanel({state,call,globalBusy}:{state:State;call:(command:string,args?:unknown)=>Promise<any>;globalBusy:boolean}){
 const [rows,setRows]=useState<PedIndexView[]>([]),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const [tag,setTag]=useState<PedUserTag|''>(''),[favoritesOnly,setFavoritesOnly]=useState(false),[preferences,setPreferences]=useState<PedUserState[]>([]);
 const [loading,setLoading]=useState(true),[preferencesLoading,setPreferencesLoading]=useState(false),[working,setWorking]=useState(false);
 const [thumbnails,setThumbnails]=useState<Record<string,{image:PedThumbnailView|null;error:string|null}>>({}),[thumbnailsLoading,setThumbnailsLoading]=useState(false);
 const [error,setError]=useState(''),[preferenceError,setPreferenceError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),preferenceGeneration=useRef(0),thumbnailGeneration=useRef(0),alive=useRef(true),operation=useRef(false);
 const current=rows.find(row=>sourceKey(row)===selected),busy=globalBusy||working||loading||preferencesLoading||thumbnailsLoading;
 const preferenceMap=useMemo(()=>new Map(preferences.map(item=>[item.referenceId,item])),[preferences]);
 const matches=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  return (current?.analysis?.references||[]).filter(ref=>{
   const pref=preferenceMap.get(ref.referenceId);
   return (!favoritesOnly||pref?.favorite===true)&&(!tag||pref?.tags.includes(tag))&&(!needle||[ref.modelName,ref.hash,...ref.evidence.map(item=>item.sourcePath)].some(value=>value.toLowerCase().includes(needle)));
  });
 },[current,query,tag,favoritesOnly,preferenceMap]);
 const pages=Math.max(1,Math.ceil(matches.length/20)),actualPage=Math.min(page,pages-1),visible=matches.slice(actualPage*20,(actualPage+1)*20);
 const thumbnailKey=JSON.stringify([current&&sourceKey(current),current?.status,visible.filter(ref=>ref.thumbnail).map(ref=>[ref.referenceId,ref.thumbnail!.sourceSha256])]);
 async function reload(){const id=++generation.current;setLoading(true);try{const next=await call('pedIndexes') as PedIndexView[];if(alive.current&&id===generation.current){setRows(next);setSelected(previous=>next.some(row=>sourceKey(row)===previous)?previous:next[0]?sourceKey(next[0]):'');}}finally{if(alive.current&&id===generation.current)setLoading(false);}}
 async function run(action:()=>Promise<void>){
  if(operation.current||globalBusy||loading||preferencesLoading||thumbnailsLoading)return;operation.current=true;setWorking(true);setError('');setMessage('');
  try{await action();}catch(cause){if(alive.current)setError((cause as Error).message);}finally{operation.current=false;if(alive.current)setWorking(false);}
 }
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;preferenceGeneration.current++;thumbnailGeneration.current++;};},[]);
 useEffect(()=>{setError('');setMessage('');void reload().catch(cause=>{if(alive.current)setError(cause.message);});},[state.imports,state.mods,state.transactions,state.settings.gamePath]);
 useEffect(()=>{setPage(0);},[selected,query,tag,favoritesOnly]);
 useEffect(()=>{
  const id=++preferenceGeneration.current;setPreferences([]);setPreferenceError('');
  if(!current||current.status!=='current'){setPreferencesLoading(false);return;}
  setPreferencesLoading(true);
  void call('pedUserStates',{source:current.source}).then((next:PedUserState[])=>{if(alive.current&&id===preferenceGeneration.current)setPreferences(next);}).catch(cause=>{if(alive.current&&id===preferenceGeneration.current)setPreferenceError('偏好暂不可读取：'+cause.message);}).finally(()=>{if(alive.current&&id===preferenceGeneration.current)setPreferencesLoading(false);});
 },[current]);
 useEffect(()=>{
  const id=++thumbnailGeneration.current;setThumbnails({});
  const references=visible.filter(ref=>ref.thumbnail);
  if(!current||current.status!=='current'||!references.length||globalBusy){setThumbnailsLoading(false);return;}
  setThumbnailsLoading(true);
  void call('pedThumbnails',{identities:references.map(ref=>({source:current.source,referenceId:ref.referenceId}))}).then((next:{referenceId:string;image:PedThumbnailView|null;error:string|null}[])=>{if(alive.current&&id===thumbnailGeneration.current)setThumbnails(Object.fromEntries(next.map(item=>[item.referenceId,{image:item.image,error:item.error}])));}).catch(cause=>{if(alive.current&&id===thumbnailGeneration.current)setThumbnails(Object.fromEntries(references.map(ref=>[ref.referenceId,{image:null,error:cause.message}])));}).finally(()=>{if(alive.current&&id===thumbnailGeneration.current)setThumbnailsLoading(false);});
 },[thumbnailKey,current,globalBusy]);
 async function analyze(){
  if(!current)return;const result=await call('pedAnalyze',{source:current.source}) as PedIndexView;
  await reload();if(alive.current)setMessage(result.analysis?`${result.name}：${analysisLabels[result.analysis.status]}，${result.analysis.references.length} 个人物引用。游戏加载未验证。`:'没有可用的解析结果。');
 }
 async function changePreference(referenceId:string,patch:{favorite?:boolean;tags?:PedUserTag[]}){
  if(!current||current.status!=='current'||preferenceError)throw new Error('请先读取当前来源与偏好。');
  const result=await call('pedSetUserState',{identity:{source:current.source,referenceId},patch}) as PedUserState;
  if(alive.current){setPreferences(previous=>previous.map(item=>item.referenceId===result.referenceId?result:item));setMessage('已保存此来源版本的人物偏好。分类与收藏不改变安装或游戏状态。');}
 }
 async function exportCatalog(){
  const result=await call('exportPedCatalog');
  if(alive.current)setMessage(result?`已导出 ${result.references} 个人物引用。${Object.entries(result.fileStates as Record<string,number>).map(([key,count])=>(fileLabels[key]||key)+' '+count+' 项').join('；')}。这是导出时的文件核验结果；注册、依赖及人物实际效果仍待验证。${result.issues.length?'\n未纳入的来源或解析问题：\n'+result.issues.join('\n'):''}`:'已取消导出，已有文件保持。');
 }
 return <section className="panel ped-catalog" aria-label="人物来源目录">
  <div className="panel-heading"><div><h3><UserRound size={18}/> 人物引用与收藏</h3><p>解析明确的模型声明，核对来源，再整理本地收藏和分类。</p></div><span className="badge warning">游戏内待实测</span></div>
  <div className="ped-catalog-toolbar">
   <label>来源记录<select aria-label="选择人物来源" value={selected} disabled={busy||!rows.length} onChange={event=>{setSelected(event.target.value);setError('');setMessage('');}}>{!rows.length&&<option value="">{loading?'正在读取…':'尚无来源记录'}</option>}{rows.map(row=><option key={sourceKey(row)} value={sourceKey(row)}>{row.source.kind==='mod'?'模组':'导入'} · {row.name} · {indexLabels[row.status]}</option>)}</select></label>
   <button disabled={busy||!current} onClick={()=>void run(analyze)}><FileSearch size={15}/>解析此来源</button>
   <button disabled={busy} onClick={()=>void run(reload)}><RefreshCw size={15}/>刷新记录</button>
   <button disabled={busy||!state.settings.gamePath||!rows.length} onClick={()=>void run(exportCatalog)}><Download size={15}/>核验并导出目录</button>
  </div>
  <details className="ped-help"><summary>目录和收藏的使用范围</summary><p className="panel-note">导出为独立JSON，包含本机游戏路径及来源摘要。游戏助手的部署与读取尚待实测，当前不自动安装。文件核验不能证明实际人物效果；人物转换与DLC注册仍未完成。</p><p className="panel-note">收藏和自定义分类属于当前来源版本。导入变为安装记录或内容更新后需重新整理；旧偏好保留，不自动移给新引用。游戏本地收藏与桌面偏好尚未双向同步。</p></details>
  {!state.settings.gamePath&&<p className="panel-note">未绑定游戏目录时仍可解析与收藏；绑定后才能核验并导出。</p>}
  {error&&<p className="notice warning" role="alert"><AlertTriangle size={17}/>{error}</p>}
  {preferenceError&&<p className="notice warning" role="alert">{preferenceError}。原记录保留，刷新后重试。</p>}
  {message&&<p className="notice" role="status">{message}</p>}
  {loading&&<p role="status">正在读取人物来源记录…</p>}
  {!loading&&!rows.length&&<p className="panel-note">先导入人物配置或模组包。只有YDD、纹理或服装文件时，不据文件名猜测可生成人物。</p>}
  {current&&<>
   <div className="ped-source-status"><strong>{current.name}</strong><span className="badge">{indexLabels[current.status]}</span>{current.analysis&&<><span className="badge">{analysisLabels[current.analysis.status]}</span><span>分析时间：{new Date(current.analysis.analyzedAt).toLocaleString('zh-CN',{hour12:false})}</span></>}</div>
   {current.status!=='current'&&current.analysis&&<p className="notice warning">这是此前解析记录。来源需重新核对，收藏编辑暂不可用。</p>}
   {!!current.issues.length&&<ul className="ped-issues">{current.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
   {!!current.analysis?.issues.filter(issue=>!current.issues.includes(issue)).length&&<ul className="ped-issues">{current.analysis.issues.filter(issue=>!current.issues.includes(issue)).map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
   <div className="ped-reference-search"><div className="search"><Search size={16}/><input aria-label="搜索人物引用" placeholder="搜索模型、哈希或来源路径…" value={query} onChange={event=>setQuery(event.target.value)}/></div><label>自定义分类<select aria-label="筛选人物自定义分类" value={tag} onChange={event=>setTag(event.target.value as PedUserTag|'')}><option value="">全部分类</option>{Object.entries(tagLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><button aria-pressed={favoritesOnly} onClick={()=>setFavoritesOnly(!favoritesOnly)}><Star size={15}/>{favoritesOnly?'显示全部':'仅收藏'}</button><span className="badge">{matches.length} 个引用</span></div>
   <div className="ped-reference-list">{visible.map(ref=>{const pref=preferenceMap.get(ref.referenceId),thumbnail=thumbnails[ref.referenceId],canEdit=!busy&&current.status==='current'&&!preferenceError&&!!pref;return <article key={ref.referenceId} className="ped-reference">
    <div className="ped-reference-heading">{thumbnail?.image?<img className="ped-thumbnail" src={thumbnail.image.dataUrl} alt={'作者提供的人物缩略图 '+ref.modelName} loading="lazy" onError={()=>setThumbnails(previous=>({...previous,[ref.referenceId]:{image:null,error:'图片无法显示'}}))}/>:<div className="ped-image-empty" aria-label="人物模型图尚未提供"><UserRound size={26}/><small>{ref.thumbnail?thumbnailsLoading?'正在读取图片':'图片未显示':'暂无模型图'}</small></div>}<div><strong>{ref.modelName}</strong><code>{ref.hash}</code><span className="badge">{kindLabels[ref.kind]||ref.kind}</span></div><button aria-label={'收藏人物 '+ref.modelName} aria-pressed={pref?.favorite===true} disabled={!canEdit} onClick={()=>void run(()=>changePreference(ref.referenceId,{favorite:!pref!.favorite}))}><Star size={16} fill={pref?.favorite?'currentColor':'none'}/>{pref?pref.favorite?'已收藏':'收藏':'偏好未读取'}</button></div>
    {thumbnail?.error&&<p className="ped-thumbnail-issue" role="status">缩略图不可读取：{thumbnail.error}</p>}
    {thumbnail?.image&&<details className="ped-thumbnail-source"><summary>图片来源</summary><p>{thumbnail.image.sourcePath} · {thumbnail.image.width} × {thumbnail.image.height}</p><code>SHA-256 {thumbnail.image.sourceSha256}</code><p>包内作者声明的图片，非GEMS实时模型渲染。</p></details>}
    <fieldset className="ped-user-tags" disabled={!canEdit}><legend>自定义分类</legend>{(Object.keys(tagLabels) as PedUserTag[]).map(value=><label key={value}><input type="checkbox" aria-label={ref.modelName+' 分类 '+tagLabels[value]} checked={pref?.tags.includes(value)===true} onChange={event=>void run(()=>changePreference(ref.referenceId,{tags:event.target.checked?[...(pref?.tags||[]),value]:(pref?.tags||[]).filter(item=>item!==value)}))}/>{tagLabels[value]}</label>)}</fieldset>
    <p className="ped-detail-note">配置中的人物类型：{ref.parsedPedType||'未解析'}。此字段与上方用户分类分别保存。</p>
    <details><summary>查看来源与依赖依据</summary>{ref.evidence.map((item,index)=><div className="ped-source-evidence" key={index}><strong>{item.sourcePath}</strong><p>{item.locator}</p><code>SHA-256 {item.sourceSha256}</code><small>{item.sourceBytes} 字节；{item.kind==='peds-meta'?'配置节点声明':'显式清单声明'}</small></div>)}{ref.dependencies.length?<ul>{ref.dependencies.map((item,index)=><li key={index}>{dependencyLabels[item.kind]||item.kind} · {item.identifier} · {item.origin==='parsed-reference'?'配置引用':'作者声明'} · {item.required==='declared'?'声明为依赖，未验证可用':'依赖关系待确认'}</li>)}</ul>:<p>未解析出依赖声明，不表示没有依赖。</p>}<p className="ped-detail-note">人物服装、面部与模型预览尚未完整实现。声明内容不能证明注册或依赖可用。</p></details>
   </article>;})}</div>
   {!matches.length&&<p className="panel-note">{query||tag||favoritesOnly?'没有符合当前筛选条件的人物引用。':current.analysis?'当前来源没有可确认的人物声明，详见解析结果。':'尚未解析此来源。'}</p>}
   {pages>1&&<div className="ped-pagination"><button disabled={actualPage===0} onClick={()=>setPage(actualPage-1)}>上一页</button><span>{actualPage+1} / {pages} · 每页20条</span><button disabled={actualPage>=pages-1} onClick={()=>setPage(actualPage+1)}>下一页</button></div>}
  </>}
 </section>;
}
