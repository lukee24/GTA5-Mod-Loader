import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
// @ts-expect-error JS 纯策略模块与构建工具共用；运行时无 Electron 依赖。
import {signedBuildConfig, signingProblems} from '../scripts/signing-policy.mjs';
// @ts-expect-error 构建脚本 JS 模块。
import {authenticode} from '../scripts/verify-signatures.mjs';
// @ts-expect-error 源码交付 JS 规则。
import {sourceEntryAllowed} from '../scripts/source-policy.mjs';

const certificate = {GEMS_SIGNING_MODE:'certificate', GEMS_PUBLISHER_NAME:'测试发布者', CSC_LINK:'fixture-not-a-certificate', CSC_KEY_PASSWORD:'fixture-secret'};
const azure = {GEMS_SIGNING_MODE:'azure', GEMS_PUBLISHER_NAME:'测试发布者', GEMS_AZURE_SIGNING_ENDPOINT:'https://weu.codesigning.azure.net/', GEMS_AZURE_CERTIFICATE_PROFILE:'fixture-profile', GEMS_AZURE_SIGNING_ACCOUNT:'fixture-account', AZURE_TENANT_ID:'fixture-tenant', AZURE_CLIENT_ID:'fixture-client', AZURE_CLIENT_SECRET:'fixture-secret'};
const evidence = {status:'Valid', publisher:'测试发布者', thumbprint:'a'.repeat(40), selfIssued:false, codeSigningEku:true, timestamp:true};

test('签名发行缺少凭据时拒绝降级到开发包',()=>{
  assert.throws(()=>signedBuildConfig({}),/GEMS_SIGNING_MODE/u);
  assert.throws(()=>signedBuildConfig({...certificate, CSC_LINK:''}),/缺少代码签名证书/u);
  assert.throws(()=>signedBuildConfig({...certificate, CSC_KEY_PASSWORD:undefined}),/密码/u);
  assert.throws(()=>signedBuildConfig({...certificate, CSC_IDENTITY_AUTO_DISCOVERY:'false'}),/禁用/u);
});
test('签名配置强制校验且不携带凭据到配置文件',()=>{
  const config = signedBuildConfig(certificate);
  assert.equal(config.forceCodeSigning,true);
  assert.equal(config.win.signExecutable,true);
  assert.equal(config.win.verifyUpdateCodeSignature,true);
  assert.deepEqual(config.win.signtoolOptions.signingHashAlgorithms,['sha256']);
  assert.ok(!JSON.stringify(config).includes('fixture-secret'));
  assert.ok(!JSON.stringify(config).includes('fixture-not-a-certificate'));
});
test('发布者必须明确且不能混用或静默选择身份',()=>{
  for (const publisher of ['', '  ', '假名称\n第二行']) assert.throws(()=>signedBuildConfig({...certificate,GEMS_PUBLISHER_NAME:publisher}),/发布|配置/u);
  assert.throws(()=>signedBuildConfig({...certificate,GEMS_SIGNING_MODE:'ad-hoc'}),/不支持/u);
  assert.throws(()=>signedBuildConfig({...azure,CSC_LINK:'fixture'}),/混用/u);
});
test('Azure 只接受官方 HTTPS 区域端点和显式服务身份',()=>{
  for(const endpoint of ['http://weu.codesigning.azure.net/', 'https://weu.codesigning.azure.net.evil.test/', 'https://secret@weu.codesigning.azure.net/', 'https://weu.codesigning.azure.net/?key=x', 'https://weu.codesigning.azure.net/path', 'https://weu.codesigning.azure.net:444/']) {
    assert.throws(()=>signedBuildConfig({...azure,GEMS_AZURE_SIGNING_ENDPOINT:endpoint}),/端点/u);
  }
  assert.throws(()=>signedBuildConfig({...azure,AZURE_CLIENT_SECRET:''}),/AZURE_CLIENT_SECRET/u);
  const config = signedBuildConfig(azure);
  assert.equal(config.win.azureSignOptions.timestampDigest,'SHA256');
  assert.ok(!JSON.stringify(config).includes('fixture-secret'));
});
test('未签名、不可信、发布者错误和自签名均拒绝发布',()=>{
  for(const change of [{status:'NotSigned'},{status:'HashMismatch'},{status:'NotTrusted'},{publisher:'其他发布者'},{publisher:null},{selfIssued:true},{selfIssued:null},{thumbprint:''},{thumbprint:'z'.repeat(40)}]) {
    assert.ok(signingProblems({...evidence,...change},'测试发布者').length > 0);
  }
});
test('签名用途、时间戳缺失及未知状态均拒绝；夹具通过不代表真实签名',()=>{
  assert.ok(signingProblems({...evidence,codeSigningEku:false},'测试发布者').length);
  assert.ok(signingProblems({...evidence,timestamp:false},'测试发布者').length);
  assert.ok(signingProblems({},'测试发布者').length);
  assert.deepEqual(signingProblems(evidence,'测试发布者'),[]);
});
test('Windows 签名检查读取实际 Node 程序，无夹具模拟可信结果',{skip:process.platform !== 'win32'},()=>{
  const actual = authenticode(process.execPath);
  assert.equal(typeof actual.status,'string');
  assert.equal(typeof actual.timestamp,'boolean');
  assert.equal(typeof actual.codeSigningEku,'boolean');
  if (actual.status === 'Valid') {
    assert.ok(actual.publisher);
    assert.match(actual.thumbprint,/^[a-f\d]{40}$/iu);
  }
  assert.ok(signingProblems(actual,'绝不匹配的夹具发布者').length);
});
test('源码归档拒绝私钥、凭据、用户缓存和未知根文件',()=>{
  for(const file of ['.env','.env.local','credentials.json','docs/release.pfx','scripts/key.P12','native/secrets/key.txt','certificates','assets/key.pem','packages/cache/file.key','desktop/.env.production','node_modules','native/game-assistant/obj/test.dll','release/manifest.json']) assert.equal(sourceEntryAllowed(file),false,file);
  for(const file of ['package.json','package-lock.json','README.md','scripts/source-archive.mjs','docs/COMMERCIAL_RELEASE.md','native/game-assistant/GemsAssistantScript.cs','assets/gems.ico']) assert.equal(sourceEntryAllowed(file),true,file);
  for(const directory of ['desktop','packages','scripts','docs','native','assets']) assert.equal(sourceEntryAllowed(directory,true),true,directory);
  assert.equal(sourceEntryAllowed('native/game-assistant/artifacts/GEMS.GameAssistant.dll'),false);
  assert.equal(sourceEntryAllowed('artifacts',true),false);
  for(const directory of ['certificates','secrets','.env','release','unknown']) assert.equal(sourceEntryAllowed(directory,true),false,directory);
});
test('两个签名配置通过实际 electron-builder 26 配置 schema 校验',async()=>{
  const require = createRequire(import.meta.url);
  const {validateConfiguration} = require('app-builder-lib/out/util/config/config.js');
  for (const environment of [certificate, azure]) await validateConfiguration(signedBuildConfig(environment),{isEnabled:false});
});
