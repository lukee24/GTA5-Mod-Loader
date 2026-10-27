import React,{useEffect,useRef,useState} from 'react';
import {FolderOpen,Save,X,SlidersHorizontal} from 'lucide-react';
import type {HandlingDocument,HandlingCopyReport} from '../../packages/vehicles/handling-documents';
import {handlingRows,handlingDraft} from '../../packages/vehicles/handling-draft';
import {useModalFocus} from './modal-focus';
import {explainError} from '../../packages/core/errors';

interface Props {call:(command:string,args?:unknown)=>Promise<any>;onClose:()=>void;}
export function HandlingEditor({call,onClose}:Props){
 const [document,setDocument]=useState<HandlingDocument|null>(null),[name,setName]=useState(''),[draft,setDraft]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[issue,setIssue]=useState(''),[report,setReport]=useState<HandlingCopyReport|null>(null),[savedKey,setSavedKey]=useState('');
 const alive=useRef(true),pending=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useModalFocus('handling-editor',onClose,false);
 const model=document?.models.find(model=>model.name===name),rows=model?handlingRows(model):[],preview=handlingDraft(rows,draft),changeKey=JSON.stringify(preview.changes),unsaved=preview.dirty&&savedKey!==changeKey;
 async function run(operation:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setIssue('');try{await operation();}catch(error){if(alive.current)setIssue(explainError(error));}finally{pending.current=false;if(alive.current)setBusy(false);}}
 function reset(){setDraft({});setReport(null);setSavedKey('');setIssue('');}
 async function open(){await run(async()=>{const loaded:HandlingDocument|null=await call('handlingOpen');if(loaded&&alive.current){setDocument(loaded);setName(loaded.models[0].name);reset();}});}
 async function save(){if(!document||!preview.changes.length||preview.issues.length||savedKey===changeKey)return;const id=document.id,model=name,changes=preview.changes;await run(async()=>{const result:HandlingCopyReport=await call('handlingSave',{id,model,changes});if(alive.current){setReport(result);setSavedKey(JSON.stringify(changes));}});}
 return <div className='modal-backdrop'><section className='handling-editor' role='dialog' aria-modal='true' aria-label='车辆参数编辑器'>
  <div className='handling-header'><div><span className='badge accent'>独立配置副本</span><h2><SlidersHorizontal size={22}/>车辆参数编辑器</h2></div><button aria-label='关闭车辆参数编辑器' onClick={onClose}><X size={19}/></button></div>
  <p className='handling-scope'>读取本地 handling.meta / XML 的已有字段。当前保存为独立副本，尚未接入游戏安装；增强版兼容与实际驾驶效果待验证。</p>
  <div className='handling-controls'><button disabled={busy||unsaved} onClick={()=>void open()}><FolderOpen size={16}/>选择配置文件</button>{document&&<label>实际模型<select aria-label='选择 handling 模型' disabled={busy||unsaved} value={name} onChange={event=>{setName(event.target.value);reset();}}>{document.models.map(model=><option key={model.name}>{model.name}</option>)}</select></label>}{preview.dirty&&<button disabled={busy} onClick={reset}>放弃本次修改</button>}</div>
  {busy&&<p role='status'>正在处理配置…关闭窗口后已发出的副本保存仍可能完成。</p>}
  {issue&&<div className='notice warning' role='alert'>{issue}</div>}
  <div className='handling-body'>
   {!document?<div className='handling-empty'><SlidersHorizontal size={34}/><h3>从你的车辆配置开始</h3><p>没有读入文件时不显示车辆参数或示例数据。</p></div>:<>
    <p className='handling-source'>{document.filename} · {document.models.length} 个模型 · 当前基于载入时的只读快照</p><code className='handling-hash'>原文 SHA-256：{document.sha256}</code>
    <p className='handling-note'>数值保持原始配置含义。没有可靠换算时不标注精确马力、极速或单位。只显示文件里实际存在的受支持字段。</p>
    <div className='handling-fields'>{rows.length?rows.map(row=><label key={row.key}><span><strong>{row.label}</strong><small>{row.key}</small><small>原值：{row.before}</small></span><input aria-label={row.label} inputMode='decimal' maxLength={128} disabled={busy} value={draft[row.key]??String(row.before)} onChange={event=>setDraft(current=>({...current,[row.key]:event.target.value}))}/></label>):<p>该模型没有已支持的可编辑字段。</p>}</div>
    {preview.issues.length>0&&<div className='notice warning' role='alert'>{preview.issues.join('；')}</div>}
    <div className='handling-preview'><h3>修改预览 · {preview.changes.length} 项</h3>{preview.changes.map(change=>{const key=change.field+(change.axis?'.'+change.axis:'');const row=rows.find(row=>row.key===key)!;return <p key={key}>{row.label}：{row.before} → {change.value}</p>;})}{!preview.changes.length&&<p>尚未修改实际数值。</p>}{unsaved&&<p>切换模型或重新载入前，请保存副本或放弃本次修改。关闭窗口会丢弃未保存的输入。</p>}</div>
    {report&&<div className='handling-report' role='status'><h3>独立副本已保存 · {report.changes.length} 项改动</h3><p>配置：{report.output}</p><p>原文快照：{report.original}</p><code>副本 SHA-256：{report.afterSha256}</code><p>{report.validation}；未安装到游戏。</p><p>关闭后可在“设置 → 打开数据目录”的 handling-edits 文件夹查看配置及报告。</p></div>}
   </>}
  </div>
  <div className='handling-footer'><button className='primary' disabled={busy||!preview.changes.length||!!preview.issues.length||savedKey===changeKey} onClick={()=>void save()}><Save size={16}/>{savedKey===changeKey?'当前改动已保存':'保存独立副本'}</button><button onClick={onClose}>关闭</button><small>自动保留原文快照，不覆盖输入文件</small></div>
 </section></div>;
}
