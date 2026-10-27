import React,{useState} from 'react';
import {X} from 'lucide-react';
import type {ImportReport,ModRecord,ModUpdatePlan} from '../../packages/core/types';
import {useModalFocus} from './modal-focus';

export function ModUpdateDialog({mod,imports,call,onClose,onComplete}:{mod:ModRecord;imports:ImportReport[];call:(command:string,args?:any)=>Promise<any>;onClose:()=>void;onComplete:()=>Promise<void>}){
 const [selected,setSelected]=useState(''),[plan,setPlan]=useState<ModUpdatePlan|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useModalFocus('mod-update',onClose,busy);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
 return <div className='modal-backdrop'><section className='large-dialog' role='dialog' aria-modal='true' aria-label='模组更新'>
  <div className='panel-heading'><div><span className='badge accent'>文件版本替换 · 游戏加载待实测</span><h2>更新 {mod.report.name}</h2></div><button aria-label='关闭更新预览' disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p>先在“导入模组”导入新版本，再在这里选择对应包。请根据作者与来源确认模组身份，GEMS 不会仅凭文件名认定新旧版本。</p>
  <label>已导入的新版本<select aria-label='更新安装包' disabled={busy} value={selected} onChange={event=>{setSelected(event.target.value);setPlan(null);setError('');}}><option value=''>请选择安装包</option>{imports.filter(report=>report.id!==mod.id).map(report=><option key={report.id} value={report.id}>{report.name} · {report.version||'版本未声明'} · {report.created}</option>)}</select></label>
  <div className='button-row'><button disabled={busy||!selected} onClick={()=>void run(async()=>setPlan(await call('planUpdate',{id:mod.id,reportId:selected})))}>检查更新差异</button></div>
  {error&&<p className='notice warning' role='alert'>{error}</p>}
  {plan&&<><p>{plan.previousName}（{plan.previousVersion||'版本未声明'}） → {plan.name}（{plan.nextVersion||'版本未声明'}）</p><p className='plan-destination'>目标游戏目录：{plan.gamePath}</p><p>{plan.files.length} 个写入文件 · {plan.removals.length} 个旧版独有文件</p>
   {plan.blockers.map((issue,index)=><p className='notice warning' key={index}>{issue}</p>)}
   <div className='dialog-scroll'><div className='file-table'>{plan.files.map(file=><div key={file.target}><div><strong>{file.target}</strong><small>{file.beforeHash?'替换现有文件':'新增文件'}</small><code>当前：{file.beforeHash||'不存在'}</code><code>新版：{file.hash}</code></div></div>)}{plan.removals.map(file=><div key={file.target}><div><strong>{file.target}</strong><small>{file.restoreHash?'新版已移除此项：恢复安装前原文件':'新版已移除此项：删除旧版新增文件'}</small><code>旧版：{file.beforeHash}</code><code>恢复为：{file.restoreHash||'不存在'}</code></div></div>)}</div></div>
   <details><summary>更新提醒</summary>{plan.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</details>
   <div className='notice'>更新失败会尝试按哈希恢复旧版；若遇到外部改动，保留“恢复待处理”供核对。更新完成仅证明文件操作，不能证明模组已在游戏内加载。</div>
   <div className='button-row'><button className='primary' disabled={busy||plan.blockers.length>0} onClick={()=>void run(async()=>{const result=await call('updateMod',{id:plan.id});if(!result.canceled)await onComplete();})}>备份并更新模组</button></div>
  </>}
 </section></div>;
}
