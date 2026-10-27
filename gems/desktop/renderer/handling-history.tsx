import React,{useEffect,useRef,useState} from 'react';
import {History,RefreshCw,ShieldCheck,X} from 'lucide-react';
import type {HandlingHistoryView,HandlingHistoryVerification} from '../../packages/vehicles/handling-history';
import {useModalFocus} from './modal-focus';
import {explainError} from '../../packages/core/errors';
interface Props {call:(command:string,args?:unknown)=>Promise<any>;onClose:()=>void;}
export function HandlingHistoryDialog({call,onClose}:Props){
 const [view,setView]=useState<HandlingHistoryView|null>(null),[results,setResults]=useState<Record<string,HandlingHistoryVerification>>({}),[failed,setFailed]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[active,setActive]=useState('');
 const alive=useRef(true),pending=useRef(false);
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;};},[]);
 useModalFocus('handling-history',onClose,false);
 async function run(fn:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setIssue('');try{await fn();}catch(error){if(alive.current)setIssue(explainError(error));}finally{pending.current=false;if(alive.current){setBusy(false);setActive('');}}}
 async function refresh(){if(pending.current)return;setResults({});setFailed({});setView(null);await run(async()=>{const list:HandlingHistoryView=await call('handlingHistory');if(alive.current)setView(list);});}
 async function verify(id:string){if(pending.current)return;setActive(id);setFailed(current=>{const next={...current};delete next[id];return next;});setResults(current=>{const next={...current};delete next[id];return next;});await run(async()=>{try{const result:HandlingHistoryVerification=await call('handlingVerify',{id});if(alive.current)setResults(current=>({...current,[id]:result}));}catch(error){if(alive.current)setFailed(current=>({...current,[id]:explainError(error)}));throw error;}});}
 return <div className='modal-backdrop'><section className='handling-history' role='dialog' aria-modal='true' aria-label='车辆配置副本历史'>
  <div className='handling-header'><div><span className='badge accent'>本地文件 · 只读核验</span><h2><History size={22}/>车辆配置副本</h2></div><button aria-label='关闭配置副本历史' onClick={onClose}><X size={19}/></button></div>
  <p className='handling-scope'>列表来自本地报告，显示前不读取模型或虚构车辆。单个核验会检查文件哈希及修改清单，仅证明核验当时的内容一致性；增强版兼容和游戏效果待验证。</p>
  <div className='handling-controls'><button disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>刷新副本历史</button><small>{view?view.items.length+' 项展示 · '+view.observed+' 项条目已读取':busy?'正在读取本地报告…':'尚未读入本地报告'}</small></div>
  {busy&&<p role='status'>{active?'正在核验副本文件…':'正在读取副本历史…'}</p>}{issue&&<div className='notice warning' role='alert'>{issue}</div>}
  <div className='handling-history-body'>
   {view?.notices.map(notice=><p className='handling-note' key={notice}>{notice}</p>)}
   {view&&!view.items.length&&<div className='handling-empty'><History size={34}/><h3>没有可展示的配置副本</h3><p>在车辆参数编辑器保存独立副本后，这里才会出现实际记录。</p></div>}
   {view?.items.map(item=>{const result=results[item.id];return <article className='handling-history-item' key={item.id}>
    <div className='handling-history-title'><div><h3>{item.model||'无法确认模型名称'}</h3><p>{item.created?new Date(item.created).toLocaleString('zh-CN',{hour12:false}):'创建时间未确认'} · {item.changes===null?'改动数量未确认':item.changes+' 项报告改动'}</p></div><span className={'badge '+(result?'success':failed[item.id]||item.issue?'warning':'muted')}>{result?'内容核验一致':failed[item.id]?'核验失败':item.issue?'报告异常':'未核验'}</span></div>
    <code>副本标识：{item.id}</code>{item.issue&&<p className='handling-note'>{item.issue}</p>}
    <button disabled={busy||!!item.issue} title={item.issue||'从固定本地目录重新读取报告、原文和副本'} onClick={()=>void verify(item.id)}><ShieldCheck size={15}/>核验副本内容</button>
    {result&&<div className='handling-history-result' role='status'><p>{result.validation}</p><p>核验时间：{new Date(result.checked).toLocaleString('zh-CN',{hour12:false})}</p><code>原文 SHA-256：{result.beforeSha256}</code><code>副本 SHA-256：{result.afterSha256}</code><p>副本：{result.output}</p><p>原文快照：{result.original}</p></div>}
   </article>;})}
  </div><div className='handling-footer'><button onClick={onClose}>关闭</button><small>刷新会清除旧核验结果；不自动删除、修复或写入游戏</small></div>
 </section></div>;
}
