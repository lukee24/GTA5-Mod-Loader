import React from 'react';
import type {RuntimeAssessment} from '../../packages/diagnostics/runtime-dependencies';

const statuses={missing:'候选缺失',unsupported:'兼容性待确认',unknown:'依赖待核实'};
const support={matched:'支持记录匹配（仍待实测）','not-listed':'本地支持记录未列出',unknown:'版本支持未知'};
const files={missing:'未发现',present:'PE 候选存在',invalid:'文件头无效',unreadable:'无法核验'};

export function RuntimeDiagnostics({assessment,openSource}:{assessment:RuntimeAssessment;openSource:(id:string)=>void}){
 return <section className='runtime-diagnostics' aria-label='运行依赖诊断'>
  <div className='panel-heading'><h3>运行依赖与版本记录</h3><span className='badge warning'>游戏内未实测</span></div>
  <p>读取的游戏版本：<strong>{assessment.gameVersion}</strong> · 检查时间：{new Date(assessment.checked).toLocaleString('zh-CN',{hour12:false})}</p>
  {assessment.gameVersionError&&<p className='notice warning'>{assessment.gameVersionError}</p>}
  <p className='notice'>{assessment.summary}</p>
  <div className='runtime-dependencies'>{assessment.dependencies.map(dependency=><article className='runtime-dependency' aria-label={dependency.name} key={dependency.id}>
   <div className='panel-heading'><h4>{dependency.name}</h4><div className='tags'><span className={'badge '+(dependency.status==='unknown'?'muted':'warning')}>{statuses[dependency.status]}</span><span className={'badge '+(dependency.support==='not-listed'?'warning':'muted')}>{support[dependency.support]}</span></div></div>
   <p>适用场景：{dependency.requiredFor}</p><p>{dependency.evidence}</p>
   {dependency.source&&<div className='runtime-source'><p>作者支持记录：{dependency.source.release} · 发布 {dependency.source.released} · 本地核对 {dependency.source.checked}</p><p>记录中的 Enhanced 版本：{dependency.source.enhancedVersions.join('、')}</p><code>{dependency.source.source}</code><button onClick={()=>openSource(dependency.id)}>查看作者支持说明</button></div>}
   <details><summary>查看 {dependency.files.length} 项候选文件证据</summary>{dependency.files.map(file=><div className='runtime-file' key={file.filename}><div className='tags'><strong>{file.filename}</strong><span className='badge muted'>{files[file.status]}</span>{file.bytes!==undefined&&<small>{file.bytes.toLocaleString()} 字节</small>}</div><p>{file.evidence}</p>{file.sha256&&<code>SHA-256：{file.sha256}</code>}</div>)}</details>
  </article>)}</div>
  <p className='panel-note'>支持记录匹配只覆盖记录中的版本号。候选文件存在、哈希或旧日志均不能证明发布者身份、当前加载成功或游戏功能正常。</p>
 </section>;
}
