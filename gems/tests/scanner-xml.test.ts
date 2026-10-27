import test from 'node:test';import assert from 'node:assert/strict';
import {safeXml} from '../packages/scanner';
import {scan} from '../packages/scanner';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {ZipFile} from 'yazl';import {noLinks} from '../packages/core/security';

test('XML按UTF-8字节限制4MiB而不是中文字符数',()=>{
 const text='<a>'+'中'.repeat(Math.floor(4*1024**2/3)+1)+'</a>';
 assert.ok(text.length<4*1024**2);assert.throws(()=>safeXml(text),/容量限制/);
});
test('XML超过64层嵌套在解析对象前拒绝',()=>{
 const text='<a>'.repeat(65)+'value'+'</a>'.repeat(65);
 assert.throws(()=>safeXml(text),/嵌套超过64层/);
});
test('XML超过50000个元素拒绝，包括自闭合标签',()=>{
 assert.throws(()=>safeXml('<a>'+'<b/>'.repeat(50000)+'</a>'),/元素超过50000项/);
});
test('XML恰好64层与50000元素可解析，模型数据不丢失',()=>{
 let parsed=safeXml('<a>'.repeat(64)+'value'+'</a>'.repeat(64));for(let i=0;i<64;i++)parsed=parsed.a;assert.equal(parsed,'value');
 assert.equal(safeXml('<a>'+'<b>1</b>'.repeat(49999)+'</a>').a.b.length,49999);
});
test('评论CDATA和处理指令中的伪标签不占结构预算，引号内大于号不闭合标签',()=>{
 const fake='<fake>'.repeat(70),source=`<?xml version="1.0"?><?fixture ${fake}?><a note="> / >"><!--${fake}--><data><![CDATA[${fake}]]></data><modelName>fixture_car</modelName></a>`;
 const parsed=safeXml(source);assert.equal(parsed.a.modelName,'fixture_car');assert.equal(parsed.a.data,fake);assert.equal(parsed.a['@_note'],'> / >');
});
test('坏结构、不完整评论/CDATA/指令、DTD与实体仍拒绝',()=>{
 for(const text of ['<a>','<a><!-- unfinished','<a><![CDATA[unfinished','<?incomplete','<!DOCTYPE a><a/>','<!ENTITY x "a"><a/>','<a></b>'])assert.throws(()=>safeXml(text));
});
test('真实vehicles.meta过深只报告解析问题，不生成虚构生成名或改原文',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-xml-scan-'));try{
  const source=path.join(root,'source');fs.mkdirSync(path.join(source,'mods'),{recursive:true});const file=path.join(source,'mods','vehicles.meta'),xml='<a>'.repeat(65)+'<modelName>unverified_car</modelName>'+'</a>'.repeat(65);fs.writeFileSync(file,xml);
  const report=await scan(source,path.join(root,'data'));assert.deepEqual(report.spawnNames,[]);assert.ok(report.warnings.includes('vehicles.meta 无法安全解析'));assert.equal(fs.readFileSync(file,'utf8'),xml);
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-xml-scan-'));noLinks(path.parse(root).root,root);fs.rmSync(root,{recursive:true});}
});
test('真实OIV过深拒绝且保留原包及失败报告，不返回成功安装方案',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-xml-scan-'));try{
  const file=path.join(root,'deep.oiv'),zip=new ZipFile();zip.addBuffer(Buffer.from('<package><metadata><name>fixture</name><notes>'+'<a>'.repeat(63)+'note'+'</a>'.repeat(63)+'</notes></metadata><content><add source="a.ini">scripts/a.ini</add></content></package>'),'assembly.xml');zip.addBuffer(Buffer.from('fixture=1'),'content/a.ini');zip.end();await new Promise<void>((resolve,reject)=>zip.outputStream.pipe(fs.createWriteStream(file)).on('finish',resolve).on('error',reject));
  const before=fs.readFileSync(file),data=path.join(root,'data');await assert.rejects(scan(file,data),/嵌套超过64层/);assert.deepEqual(fs.readFileSync(file),before);const folder=path.join(data,'imports',fs.readdirSync(path.join(data,'imports'))[0]);assert.match(fs.readFileSync(path.join(folder,'failure.txt'),'utf8'),/嵌套超过64层/);assert.deepEqual(fs.readFileSync(path.join(folder,'original.oiv')),before);
 }finally{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('gems-xml-scan-'));noLinks(path.parse(root).root,root);fs.rmSync(root,{recursive:true});}
});
