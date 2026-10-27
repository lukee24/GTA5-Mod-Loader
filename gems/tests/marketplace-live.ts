// 手动联网验收：只下载公开作者发布包并扫描，不绑定或写入游戏。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../packages/database';
import {repositoryName,parseReleases} from '../packages/marketplace/providers';
import {releasesJson} from '../packages/marketplace/network';
import {Downloads} from '../packages/marketplace/downloads';

const repository=repositoryName(process.argv[2]||'Chiheb-Bacha/ScriptHookVDotNetEnhanced');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-market-live-'));
const store=await Store.open(root,path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
const queue=new Downloads(store,root);
try{
  const assets=parseReleases(repository,await releasesJson(repository,AbortSignal.timeout(45000)));
  const asset=assets.find(a=>a.size<=20*1024**2);if(!asset)throw new Error('没有可用于受限联网验收的小型 ZIP 发布包');
  const added=queue.add(asset),deadline=Date.now()+180000;
  let result;
  while(Date.now()<deadline){result=queue.list().find(d=>d.id===added.id);if(result&&!['排队中','下载中','正在扫描'].includes(result.status))break;await new Promise(r=>setTimeout(r,250));}
  if(result?.status!=='已分析')throw new Error('实际网络下载与扫描未完成：'+result?.error);
  const report=store.get<any>('import',result.reportId!);
  if(!report?.files.length||store.list('mod').length||store.list('transaction').length)throw new Error('联网测试报告缺失或产生意外安装');
  const evidence={checked:new Date().toISOString(),repository,sourceUrl:asset.pageUrl,asset:asset.name,size:result.received,sha256:result.sha256,checksum:result.checksum,fileCount:report.files.length,blockers:report.blockers,warnings:report.warnings,downloadAndScan:'passed',gameWritten:false,gameCompatibility:'not-tested'};
  fs.writeFileSync('artifacts/marketplace-live-current.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
}finally{await queue.close();store.close();if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-market-live-'))throw Error('清理目录不符合测试范围');fs.rmSync(root,{recursive:true});}
