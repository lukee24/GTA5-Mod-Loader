// Isolated renderer test data, never imported by the product or presented as website/game evidence.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CatalogBrowser} from '../desktop/renderer/catalog';
import '../desktop/renderer/style.css';

interface Request {command:string;args:any;resolve:(value:unknown)=>void;reject:(error:Error)=>void;}
const requests:Request[]=[];
Object.assign(window,{catalogFixture:{requests,resolve:(index:number,value:unknown)=>requests[index].resolve(value),reject:(index:number,message:string)=>requests[index].reject(new Error(message))}});
function call(command:string,args:unknown){return new Promise((resolve,reject)=>requests.push({command,args,resolve,reject}));}
createRoot(document.getElementById('root')!).render(<div className='app dark'><main><CatalogBrowser call={call} githubAssets={[]} onDownload={async()=>{throw new Error('隔离测试不执行下载');}}/></main></div>);
