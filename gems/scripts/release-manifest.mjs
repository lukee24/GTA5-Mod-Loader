import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyReleaseSignatures} from './verify-signatures.mjs';
import {readReleaseArtifact,isCodeArtifact,codeSigningSummary} from './release-artifacts.mjs';
import {parseManifestOptions,manifestHelp} from './release-cli.mjs';
import {writeReleaseOutputs} from './release-output.mjs';

// 在读取包版本、附件、系统签名或写入证据之前拒绝未知/矛盾选项。
const {help,installerUnavailable,sourceOnly,requireSigned}=parseManifestOptions(process.argv.slice(2));
if(help){console.log(manifestHelp);process.exit(0);}
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version;
if(requireSigned)await verifyReleaseSignatures(process.env.GEMS_PUBLISHER_NAME);
const files=[...(sourceOnly?[]:[...(installerUnavailable?[]:[`GEMS-${version}-x64-setup.exe`]),`GEMS-${version}-x64-portable.exe`,'../native/game-assistant/artifacts/GEMS.GameAssistant.dll']),`GEMS-${version}-source.zip`];
const artifacts=[];
for(const relative of files){
 const file=path.join(root,'release',relative);
 const record=await readReleaseArtifact(file,{minimumBytes:relative.endsWith('.exe')?1024**2:relative.endsWith('.dll')?16*1024:0,publisher:process.env.GEMS_PUBLISHER_NAME,requireSigned:requireSigned&&isCodeArtifact(relative)});
 artifacts.push({file:relative,...record});
}
const codeSigning=codeSigningSummary(artifacts,process.env.GEMS_PUBLISHER_NAME);
const manifest={schemaVersion:2,name:'GEMS',version,generatedAt:new Date().toISOString(),buildPlatform:'Windows x64',desktopRuntime:sourceOnly?'not-delivered':'built',codeArtifactCount:artifacts.filter(a=>isCodeArtifact(a.file)).length,channel:sourceOnly?'source-only':requireSigned?'signed-preview':'development',codeSigning,commercialReady:false,fullRequirementsPassed:false,installer:sourceOnly||installerUnavailable?'not-delivered':'built',artifacts};
writeReleaseOutputs(path.join(root,'release'),JSON.stringify(manifest,null,2),artifacts.map(a=>`${a.sha256}  ${a.file}`).join('\n')+'\n');
console.log('已生成实际文件的 SHA-256 与发布清单。');
