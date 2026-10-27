import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import yauzl from 'yauzl';
// @ts-expect-error The real publication policy is shared with the archive CLI.
import {sourceEntryAllowed,repositoryEntryAllowed} from '../scripts/source-policy.mjs';

test('public allowlist rejects local evidence, nested runtimes, secrets and path escapes',()=>{
 for(const relative of ['artifacts/results.json','artifacts/ui/screen.png','native/game-assistant/artifacts/GEMS.GameAssistant.dll','native/game-assistant/third_party/shvdne/release.zip','native/game-assistant/third_party/shvdne/package/ScriptHookVDotNet3.dll','native/game-assistant/third_party/shvdne/package/Debug/runtime.pdb','tests/fixture.rpf','docs/private.sqlite','scripts/secrets/key.txt','../README.md','/README.md','docs/../README.md','docs//README.md','C:/Users/example/private.md'])assert.equal(sourceEntryAllowed(relative),false,relative);
 for(const relative of ['packages/rpf-engine/NOTICE.txt','docs/images/dashboard.png','native/game-assistant/BUILDING.md','native/game-assistant/third_party/shvdne/SOURCE.md','native/game-assistant/third_party/shvdne/package/Licenses/LICENSE.txt'])assert.equal(sourceEntryAllowed(relative),true,relative);
 for(const relative of ['docs/images/other.png','docs/images/catalog-live.png','docs/images/dashboard.jpg'])assert.equal(sourceEntryAllowed(relative),false,relative);
 for(const relative of ['work/project.ts','.oss-private/application.md','notes.txt','.github/secrets.json'])assert.equal(repositoryEntryAllowed(relative),false,relative);
 for(const relative of ['README.md','LICENSE','SECURITY.md','.github/workflows/gems-windows.yml'])assert.equal(repositoryEntryAllowed(relative),true,relative);
});

test('actual archive CLI preserves public source and notices while excluding planted private/runtime files',async t=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'gems-public-source-')),root=path.join(base,'gems');
 fs.mkdirSync(path.join(root,'scripts'),{recursive:true});
 for(const name of ['source-archive.mjs','source-policy.mjs','source-output.mjs','source-input.mjs'])fs.copyFileSync(path.join('scripts',name),path.join(root,'scripts',name));
 fs.symlinkSync(path.resolve('node_modules'),path.join(root,'node_modules'),'junction');
 const files:Record<string,string>={
  'gems/package.json':JSON.stringify({version:'0.0.1'}),'README.md':'Public readme','LICENSE':'Public license',
  '.github/workflows/gems-windows.yml':'name: Public CI',
  'gems/packages/example.ts':'export const value = 1;',
  'gems/native/game-assistant/tests/weapon-catalog/.gitignore':'bin-net48/\nobj-net48/\n',
  'gems/native/game-assistant/tests/weapon-catalog/obj-net48/project.assets.json':'PRIVATE_MARKER',
  'gems/native/game-assistant/tests/weapon-catalog/obj-net48/WeaponCatalogNet48Check.csproj.nuget.dgspec.json':'PRIVATE_MARKER',
  'gems/native/game-assistant/tests/weapon-catalog/bin-net48/Debug/WeaponCatalogNet48Check.deps.json':'PRIVATE_MARKER',
  'gems/docs/images/dashboard.png':'Reviewed dashboard placeholder bytes',
  'gems/docs/images/unreviewed.png':'PRIVATE_MARKER',
  'gems/native/game-assistant/third_party/shvdne/package/Licenses/LICENSE.txt':'Preserved upstream notice',
  'gems/artifacts/private.json':'PRIVATE_MARKER','gems/artifacts/ui/private.png':'PRIVATE_MARKER',
  'gems/native/game-assistant/artifacts/GEMS.GameAssistant.dll':'PRIVATE_MARKER',
  'gems/native/game-assistant/third_party/shvdne/release.zip':'PRIVATE_MARKER',
  'gems/native/game-assistant/third_party/shvdne/package/ScriptHookVDotNet3.dll':'PRIVATE_MARKER',
  '.oss-private/application.md':'PRIVATE_MARKER','work/private.ts':'PRIVATE_MARKER'
 };
 for(const [relative,content] of Object.entries(files)){const file=path.join(base,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
 t.after(()=>{assert.equal(path.dirname(base),os.tmpdir());assert.ok(path.basename(base).startsWith('gems-public-source-'));fs.rmSync(base,{recursive:true});});
 const child=spawnSync(process.execPath,[path.join(root,'scripts/source-archive.mjs')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(child.status,0,child.stderr);
 const names=await new Promise<string[]>((resolve,reject)=>yauzl.open(path.join(root,'release/GEMS-0.0.1-source.zip'),{lazyEntries:true},(error,zip)=>{if(error||!zip){reject(error);return;}const result:string[]=[];zip.on('error',reject);zip.on('entry',entry=>{result.push(entry.fileName);zip.readEntry();});zip.on('end',()=>resolve(result));zip.readEntry();}));
 const mismatches=Object.entries(files).filter(([relative,content])=>names.includes(relative)!==(content!=='PRIVATE_MARKER')).map(([relative])=>relative);
 assert.deepEqual(mismatches,[], 'Archive must include public source and exclude every planted private/runtime file');
});
