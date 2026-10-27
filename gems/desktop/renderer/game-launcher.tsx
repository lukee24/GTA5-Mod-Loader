import React from 'react';
import {Play,RefreshCw} from 'lucide-react';
import type {LaunchState} from '../../packages/launcher';
const phases={pending:'等待游戏启动',uncertain:'启动结果未知',running:'观察到游戏进程',exited:'当前未检测到游戏进程',cancelled:'用户已确认启动结束'};
export function GameLauncher({gamePath,state,issue,busy,run}:{gamePath:string;state:LaunchState|null;issue:string|null;busy:boolean;run:(command:string)=>void}){
 const waiting=state?.phase==='pending'||state?.phase==='uncertain';
 return <section className='panel game-launcher' aria-label='Steam Enhanced 启动'>
  <div className='panel-heading'><h3>通过 Steam 启动 Enhanced</h3><span className='badge warning'>故事模式与模组效果未验证</span></div>
  <p>启动请求交给 Steam 官方启动界面；请在 Steam / Rockstar 中完成登录并选择故事模式，再进入游戏检查模组的实际效果。</p>
  <p className='plan-destination'>已绑定目录：{gamePath||'尚未选择游戏目录'}</p>
  <p className='panel-note'>仅支持匹配且就绪的 Steam Enhanced 安装记录。GEMS 不切换游戏平台安全设置，不传递自定义启动参数，不会把进程存在认定为模组加载成功。</p>
  {issue&&<p className='notice warning' role='alert'>{issue}</p>}
  {state?<div className='launch-state'><h4>{phases[state.phase]}</h4><p>{state.message}</p><p className='plan-destination'>本次启动目录：{state.gamePath}</p><small>请求：{new Date(state.requested).toLocaleString('zh-CN',{hour12:false})} · 最近检查：{new Date(state.checked).toLocaleString('zh-CN',{hour12:false})}</small></div>:<p className='notice'>尚未通过 GEMS 发起启动。</p>}
  {waiting&&<p className='notice warning'>平台可能仍在等待启动，因此暂时禁止修改游戏文件与更换绑定目录。请检查游戏进程；若已取消启动，先关闭平台中的待启动任务，再确认结束等待。</p>}
  <div className='button-row'><button className='primary' disabled={busy||!gamePath||!!issue||waiting||state?.phase==='running'} onClick={()=>run('launchSteam')}><Play size={16}/>通过 Steam 启动</button><button disabled={busy||!state||!!issue} onClick={()=>run('launchRefresh')}><RefreshCw size={16}/>检查游戏进程</button>{waiting&&<button disabled={busy||!!issue} onClick={()=>run('launchAcknowledge')}>已取消平台启动，结束等待</button>}</div>
  <div className='notice'>模组启动方案与纯净启动仍未实现。此入口不启用、停用或清空任何模组；请自行在游戏中核对故事模式、模块加载和功能使用。</div>
 </section>;
}
