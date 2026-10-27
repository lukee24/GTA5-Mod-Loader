import React,{useEffect,useRef,useState} from 'react';
import type {CatalogItem} from '../../packages/marketplace/catalog';
import {explainError} from '../../packages/core/errors';
import {useModalFocus} from './modal-focus';

interface Props {item:CatalogItem;call:(command:string,args?:unknown)=>Promise<unknown>;onClose:()=>void;}
export function CatalogSourceDialog({item,call,onClose}:Props){
  const [busy,setBusy]=useState(false),[issue,setIssue]=useState('');
  const alive=useRef(true),pending=useRef(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  // Closing remains available: an OS browser request cannot be reliably cancelled by this dialog.
  useModalFocus(item.id,onClose,false);
  async function openSource(){
    if(pending.current)return;
    pending.current=true;setBusy(true);setIssue('');
    try{await call('catalogSource',{id:item.id});if(alive.current)onClose();}
    catch(error){if(alive.current)setIssue(explainError(error));}
    finally{pending.current=false;if(alive.current)setBusy(false);}
  }
  return <div className='modal-backdrop'><section className='dialog' role='dialog' aria-modal='true' aria-label='模组下载方式'>
    <h2>{item.name}</h2><p>{item.author} · {item.version}</p>
    <p>已读取模组目录。该站抓取规则限制自动读取下载跳转页，当前尚未接入此模组的直接下载接口。</p>
    <p>可以在作者页面确认下载，下载后的 ZIP / OIV 再导入 GEMS。不会把文件下载或解压视为增强版兼容。</p>
    {issue&&<div className='notice warning' role='alert'><p>{issue}</p></div>}
    {busy&&<p role='status'>正在请求打开作者页面…可以关闭此窗口，浏览器打开请求可能仍会完成。</p>}
    <div className='button-row'><button className='primary' disabled={busy} onClick={()=>void openSource()}>打开此模组作者页面</button><button onClick={onClose}>关闭</button></div>
  </section></div>;
}
