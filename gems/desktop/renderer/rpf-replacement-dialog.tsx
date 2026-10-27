import React from 'react';
import {X} from 'lucide-react';
import type {RpfReplacementPreview} from '../../packages/rpf-engine/copy-session';
import {useModalFocus} from './modal-focus';
export function RpfReplacementDialog({plan,busy,onClose,onExport}:{plan:RpfReplacementPreview;busy:boolean;onClose:()=>void;onExport:()=>void}){
 useModalFocus('rpf-replacement',onClose,busy);
 return <div className='modal-backdrop'><section className='large-dialog' role='dialog' aria-modal='true' aria-label='RPF 独立副本替换预览'>
  <div className='panel-heading'><div><span className='badge accent'>未加密 RPF7 · 普通文件条目</span><h2>替换 {plan.entryPath}</h2></div><button aria-label='关闭 RPF 替换预览' disabled={busy} onClick={onClose}><X size={20}/></button></div>
  <p className='plan-destination'>原档：{plan.sourcePath}</p><p className='plan-destination'>替换内容：{plan.replacementPath}</p>
  <div className='dialog-scroll'><div className='file-table'><div><div><strong>原始条目内容</strong><small>{plan.beforeBytes.toLocaleString()} 字节（展开后）</small><code>SHA-256：{plan.beforeSha256}</code></div></div><div><div><strong>替换后的内容</strong><small>{plan.afterBytes.toLocaleString()} 字节（展开后）</small><code>SHA-256：{plan.afterSha256}</code></div></div><div><div><strong>预计独立 RPF 副本</strong><small>{plan.outputBytes.toLocaleString()} 字节</small><code>SHA-256：{plan.outputSha256}</code><small>原档 SHA-256：{plan.archiveSha256}</small></div></div></div></div>
  <div className='notice'>导出前重新核对原档与替换内容，落盘后回读验证。请选择新的 .rpf 文件名，禁止覆盖原档、替换源、已有文件及游戏、软件、缓存目录。</div>
  <p>这只验证归档结构和文件字节。资源条目写入、完整结构编辑、嵌套父归档自动重写及游戏内加载仍未验证。</p>
  <div className='button-row'><button className='primary' disabled={busy} onClick={onExport}>选择位置并导出 RPF 副本</button><button disabled={busy} onClick={onClose}>取消</button></div>
 </section></div>;
}
