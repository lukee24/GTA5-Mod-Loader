import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileSearch,RefreshCw,Download,Search,AlertTriangle} from 'lucide-react';
import type {State} from '../../packages/core/types';
import type {WeaponIndexView} from '../../packages/weapons/types';
import './weapon-catalog.css';

const sourceKey=(row:WeaponIndexView)=>row.source.kind+':'+row.source.id;
const indexLabels={unindexed:'尚未解析',current:'报告指纹匹配',stale:'来源报告已变化',invalid:'索引无法读取'};
const analysisLabels={parsed:'已解析声明',partial:'部分解析',unsupported:'当前格式未支持'};
const kindLabels={addon:'声明为新增',replace:'声明为替换',unknown:'新增／替换未知'};
const fileLabels:Record<string,string>={verified:'文件已核验',disabled:'已停用',uninstalled:'已卸载',pending:'事务待处理',missing:'文件缺失',changed:'文件已变化',shadowed:'被其他安装占用',unverified:'文件未核验'};

export function WeaponCatalogPanel({state,call,globalBusy}:{state:State;call:(command:string,args?:unknown)=>Promise<any>;globalBusy:boolean}){
 const [rows,setRows]=useState<WeaponIndexView[]>([]),[selected,setSelected]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0);
 const [loading,setLoading]=useState(true),[working,setWorking]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const generation=useRef(0),alive=useRef(true),operation=useRef(false);
 const current=rows.find(row=>sourceKey(row)===selected),busy=globalBusy||working||loading;
 const matches=useMemo(()=>{
  const needle=query.trim().toLowerCase();
  return (current?.analysis?.references||[]).filter(ref=>!needle||[ref.weaponName,ref.hash,...ref.evidence.map(item=>item.sourcePath),ref.symbols.model||'',ref.symbols.ammo||''].some(value=>value.toLowerCase().includes(needle)));
 },[current,query]);
 const pages=Math.max(1,Math.ceil(matches.length/20)),actualPage=Math.min(page,pages-1),visible=matches.slice(actualPage*20,(actualPage+1)*20);
 function acceptRows(next:WeaponIndexView[]){setRows(next);setSelected(previous=>next.some(row=>sourceKey(row)===previous)?previous:next[0]?sourceKey(next[0]):'');}
 async function reload(){const id=++generation.current;setLoading(true);try{const next=await call('weaponIndexes') as WeaponIndexView[];if(alive.current&&id===generation.current)acceptRows(next);}finally{if(alive.current&&id===generation.current)setLoading(false);}}
 async function run(action:()=>Promise<void>){
  if(operation.current||globalBusy||loading)return;operation.current=true;setWorking(true);setError('');setMessage('');
  try{await action();}catch(cause){if(alive.current)setError((cause as Error).message);}finally{operation.current=false;if(alive.current)setWorking(false);}
 }
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
 useEffect(()=>{setError('');setMessage('');void reload().catch(cause=>{if(alive.current)setError(cause.message);});},[state.imports,state.mods,state.transactions,state.settings.gamePath]);
 useEffect(()=>{setPage(0);},[selected,query]);
 async function analyze(){
  if(!current)return;const source=current.source;
  const result=await call('weaponAnalyze',{source}) as WeaponIndexView;
  await reload();if(alive.current)setMessage(result.analysis?`${result.name}：${analysisLabels[result.analysis.status]}，${result.analysis.references.length} 个引用。未验证游戏加载。`:'没有可用的解析结果。');
 }
 async function exportCatalog(){
  const result=await call('exportWeaponCatalog');
  if(alive.current)setMessage(result?`已导出 ${result.references} 个武器引用。${Object.entries(result.fileStates as Record<string,number>).map(([key,count])=>(fileLabels[key]||key)+' '+count+' 项').join('；')}。以上是本次导出时的文件状态，注册和依赖可用性尚未确认，游戏效果待实测。${result.issues.length?'\n未纳入的来源或解析问题：\n'+result.issues.join('\n'):''}`:'已取消导出，已有文件保持。');
 }
 return <section className="panel weapon-catalog" aria-label="武器来源目录">
  <div className="panel-heading"><div><h3><FileSearch size={18}/> 武器引用与来源</h3><p>从已保存的模组文件解析武器声明，再单独核验安装文件。</p></div><span className="badge warning">游戏内待实测</span></div>
  <div className="weapon-catalog-toolbar">
   <label>来源记录<select aria-label="选择武器来源" value={selected} disabled={busy||!rows.length} onChange={event=>{setSelected(event.target.value);setError('');setMessage('');}}>{!rows.length&&<option value="">{loading?'正在读取…':'尚无来源记录'}</option>}{rows.map(row=><option key={sourceKey(row)} value={sourceKey(row)}>{row.source.kind==='mod'?'模组':'导入'} · {row.name} · {indexLabels[row.status]}</option>)}</select></label>
   <button disabled={busy||!current} onClick={()=>void run(analyze)}><FileSearch size={15}/>解析此来源</button>
   <button disabled={busy} onClick={()=>void run(reload)}><RefreshCw size={15}/>刷新记录</button>
   <button disabled={busy||!state.settings.gamePath||!rows.length} onClick={()=>void run(exportCatalog)}><Download size={15}/>核验并导出目录</button>
  </div>
  <p className="panel-note">导出文件包含本机游戏目录及来源文件路径。仅保存到独立位置，不注册DLC、不自动安装、不建立实时同步；解析声明或文件匹配不能证明游戏已加载。</p>
  {!state.settings.gamePath&&<p className="panel-note">未绑定游戏目录时仍可解析来源；绑定后才能核验并导出。</p>}
  {error&&<p className="notice warning" role="alert"><AlertTriangle size={17}/>{error}</p>}
  {message&&<p className="notice" role="status">{message}</p>}
  {loading&&<p role="status">正在读取武器来源记录…</p>}
  {!loading&&!rows.length&&<p className="panel-note">先导入模组包或配置文件。只有模型／纹理文件时，当前解析器不会据文件名猜测武器标识。</p>}
  {current&&<>
   <div className="weapon-source-status"><strong>{current.name}</strong><span className="badge">{indexLabels[current.status]}</span>{current.analysis&&<><span className="badge">{analysisLabels[current.analysis.status]}</span><span>分析时间：{new Date(current.analysis.analyzedAt).toLocaleString('zh-CN',{hour12:false})}</span></>}</div>
   {current.status!=='current'&&current.analysis&&<p className="notice warning">下面保留的是此前解析记录，当前来源需要重新核对；不能把旧索引当作当前可用武器。</p>}
   {!!current.issues.length&&<ul className="weapon-issues">{current.issues.map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
   {!!current.analysis?.issues.filter(issue=>!current.issues.includes(issue)).length&&<ul className="weapon-issues">{current.analysis.issues.filter(issue=>!current.issues.includes(issue)).map((issue,index)=><li key={index}>{issue}</li>)}</ul>}
   <div className="weapon-reference-search"><div className="search"><Search size={16}/><input aria-label="搜索武器引用" placeholder="搜索武器标识、哈希或来源路径…" value={query} onChange={event=>setQuery(event.target.value)}/></div><span className="badge">{matches.length} 个引用</span></div>
   <div className="weapon-reference-list">{visible.map(ref=><article key={ref.referenceId} className="weapon-reference"><div className="weapon-reference-heading"><strong>{ref.weaponName}</strong><code>{ref.hash}</code><span className="badge">{kindLabels[ref.kind]}</span></div><dl><div><dt>模型声明</dt><dd>{ref.symbols.model||'未解析'}</dd></div><div><dt>槽位声明</dt><dd>{ref.symbols.slot||'未解析'}</dd></div><div><dt>弹药声明</dt><dd>{ref.symbols.ammo||'未解析'}</dd></div><div><dt>组件引用</dt><dd>{ref.symbols.components.join('、')||'未解析'}</dd></div></dl><details><summary>查看来源与依赖依据</summary>{ref.evidence.map((item,index)=><div className="weapon-source-evidence" key={index}><strong>{item.sourcePath}</strong><p>{item.locator}</p><code>SHA-256 {item.sourceSha256}</code><small>{item.sourceBytes} 字节；{item.kind==='weapons-meta'?'配置节点声明':'显式清单声明'}</small></div>)}{ref.dependencies.length?<ul>{ref.dependencies.map((item,index)=><li key={index}>{item.kind} · {item.identifier} · {item.required==='declared'?'声明依赖，未验证可用':'依赖关系待确认'}</li>)}</ul>:<p>没有已解析的依赖声明，不表示没有依赖。</p>}</details></article>)}</div>
   {!matches.length&&<p className="panel-note">{query?'没有匹配的武器引用。':current.analysis?'当前来源没有可确认的武器声明，详见解析结果。':'尚未解析此来源。'}</p>}
   {pages>1&&<div className="weapon-pagination"><button disabled={actualPage===0} onClick={()=>setPage(actualPage-1)}>上一页</button><span>{actualPage+1} / {pages} · 每页20条</span><button disabled={actualPage>=pages-1} onClick={()=>setPage(actualPage+1)}>下一页</button></div>}
  </>}
 </section>;
}
