import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {runtimeSupportEvidence} from '../packages/diagnostics/runtime-support';
import {logEvidence} from '../packages/diagnostics/log-evidence';
import {diagnose} from '../packages/diagnostics';
import {noLinks} from '../packages/core/security';

test('当前游戏补丁不能凭相近版本宣称 ScriptHookV 兼容',()=>{
  for (const version of ['1.0.1158.16','1.0.1158.14','1.0.3889.0']) {
    const evidence = runtimeSupportEvidence(version);
    assert.equal(evidence.status,'兼容性未确认');
    assert.match(evidence.evidence,/未被本地官方支持记录覆盖/u);
    assert.ok(evidence.evidence.includes(version));
  }
});
test('官方版本记录匹配仍保留二进制和游戏内待验证状态',()=>{
  const evidence = runtimeSupportEvidence('1.0.1158.13');
  assert.equal(evidence.status,'版本记录匹配，待验证');
  assert.match(evidence.evidence,/组件二进制和游戏内运行仍待验证/u);
  assert.match(evidence.evidence,/核对 2026-10-26/u);
});
test('未知或错误游戏版本不能匹配支持记录',()=>{
  for(const value of ['','未知','1.0.1158.13 (patched)']) assert.match(runtimeSupportEvidence(value).evidence,/游戏版本无法确认/u);
});
test('完整日志记录实际行号和去除显示控制符',()=>{
  const findings = logEvidence(Buffer.from('\uFEFF初始化\r\n正常\r\nERROR\u0007 纹理缺失\r\n'),false);
  assert.deepEqual(findings,[{line:3,excerptLine:3,truncated:false,evidence:'ERROR 纹理缺失'}]);
});
test('截断日志丢弃半行，不能伪报原日志的行号',()=>{
  const findings = logEvidence(Buffer.from('ERROR 半行\n普通\nFAILED 资源读取\n'),true);
  assert.deepEqual(findings,[{line:null,excerptLine:2,truncated:true,evidence:'FAILED 资源读取'}]);
  assert.deepEqual(logEvidence(Buffer.from('fatal 半行没有换行'),true),[]);
});
test('UTF-16 完整日志正确读取，截断或未知编码明确拒绝',()=>{
  const utf16 = Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('信息\r\nException 失败','utf16le')]);
  assert.equal(logEvidence(utf16,false)[0].line,2);
  assert.throws(()=>logEvidence(utf16.subarray(3),true),/编码/u);
  assert.throws(()=>logEvidence(Buffer.from([0,0,1,1]),false),/编码/u);
  assert.throws(()=>logEvidence(Buffer.from([0xc0,0xaf,0x41]),false),/编码/u);
  assert.equal(logEvidence(Buffer.concat([Buffer.from([0x80,10]),Buffer.from('ERROR 完整行')]),true)[0].evidence,'ERROR 完整行');
});
test('超量与超长错误日志受容量限制',()=>{
  const findings=logEvidence(Buffer.from(('error '+ 'x'.repeat(2000)+'\n').repeat(250)),false);
  assert.equal(findings.length,200);
  assert.equal(findings[0].evidence.length,1000);
});
test('实际诊断读取混合日志：大文件末尾、UTF-16 和失败文件分别记录且不改原文',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'gems-diagnostic-fixture-'));
  try{
    fs.mkdirSync(path.join(root,'update'));
    const pe=Buffer.alloc(128);pe.write('MZ');pe.writeUInt32LE(64,60);pe.writeUInt32LE(0x4550,64);pe.writeUInt16LE(0x8664,68);
    fs.writeFileSync(path.join(root,'GTA5_Enhanced.exe'),pe);
    const rpf=Buffer.alloc(16);rpf.writeUInt32LE(0x52504637);fs.writeFileSync(path.join(root,'update/update.rpf'),rpf);
    const originals=new Map([
      ['ScriptHookV.log',Buffer.concat([Buffer.alloc(1024*1024+32,0x61),Buffer.from('\nERROR 尾部读取线索\n')])],
      ['OpenRPF.log',Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('正常\nFAILED 受支持的完整行','utf16le')])],
      ['ReShade.log',Buffer.from([0xc0,0xaf,0x41])]
    ]);
    for(const [name,data]of originals)fs.writeFileSync(path.join(root,name),data);
    const result=await diagnose(root);
    assert.equal(result.findings.length,2);
    assert.equal(result.findings.find(f=>f.file==='ScriptHookV.log')?.line,null);
    assert.equal(result.findings.find(f=>f.file==='OpenRPF.log')?.line,2);
    assert.equal(result.readErrors.length,1);
    assert.equal(result.readErrors[0].file,'ReShade.log');
    assert.match(result.summary,/部分日志无法读取/u);
    for(const [name,data]of originals)assert.deepEqual(fs.readFileSync(path.join(root,name)),data);
  }finally{
    const resolved=path.resolve(root);assert.equal(path.dirname(resolved),path.resolve(os.tmpdir()));assert.ok(path.basename(resolved).startsWith('gems-diagnostic-fixture-'));noLinks(path.parse(resolved).root,resolved);fs.rmSync(resolved,{recursive:true,force:true});
  }
});
