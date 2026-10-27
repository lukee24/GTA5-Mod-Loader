import React from 'react';
import {Gamepad2,Code2,ShieldAlert,ListChecks} from 'lucide-react';
import capabilities from '../../native/game-assistant/capabilities.json';
import './assistant-page.css';

/** Bundled source capability notes are not evidence of local installation or gameplay. */
export function AssistantPage({busy,onExport}:{busy:boolean;onExport:()=>void}){
 return <div className="assistant-page">
  <section className="assistant-preview panel">
   <div className="assistant-heading"><Gamepad2 size={30}/><div><span className="badge warning">游戏内待验收</span><h2>GEMS 游戏助手</h2><p>以下是随本版源码提供的开发能力说明。安装GEMS桌面软件不会自动把助手安装进游戏。</p></div></div>
   <p className="assistant-runtime">开发接口：{capabilities.runtime}</p>
   <div className="notice warning"><ShieldAlert size={20}/><span>尚未确认助手在真实故事模式中加载或正常使用。构建成功、能力清单和文件存在均不能证明游戏效果。</span></div>
   <div className="assistant-keys"><span>默认键位</span><kbd>F5</kbd><span>打开或关闭菜单</span><kbd>Alt + G</kbd><span>打开或关闭同一菜单</span></div>
   <p className="panel-note">这里显示默认键位，不读取游戏中的个人映射。独立快捷中心和鼠标操作尚未完成；手柄及自定义映射的当前状态见下方清单。输入操作与中文渲染仍需实机验证。</p>
   <div className="toolbar"><button disabled title="须完成兼容运行时及真实游戏验收">安装游戏助手 · 待实测</button><button disabled={busy} onClick={onExport}>导出数据库目录（待游戏测试）</button></div>
   <p className="panel-note">导出目录不会生成车辆、注册DLC或建立实时同步。最多2000个生成引用、2MiB；重复名称或超限会停止导出并保留已有文件。准备状态仍需在游戏中核验。</p>
  </section>
  <div className="assistant-evidence-grid">
   <section className="panel"><div className="panel-heading"><h3><Code2 size={18}/> 源码中的开发路径</h3></div><p>这些路径已写入源码，尚未取得对应的游戏通过证据。</p><ul>{capabilities.sourceImplemented.map(item=><li key={item}>{item}</li>)}</ul></section>
   <section className="panel"><div className="panel-heading"><h3><ListChecks size={18}/> 尚未完成</h3></div><ul>{capabilities.notSupported.map(item=><li key={item}>{item}</li>)}</ul></section>
   <section className="panel"><div className="panel-heading"><h3>恢复范围</h3></div><ul>{capabilities.restorationLimits.map(item=><li key={item}>{item}</li>)}</ul></section>
   <section className="panel"><div className="panel-heading"><h3>功能限制</h3></div><ul>{capabilities.featureLimits.map(item=><li key={item}>{item}</li>)}</ul></section>
  </div>
 </div>;
}
