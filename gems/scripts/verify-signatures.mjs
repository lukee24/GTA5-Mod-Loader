import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readReleaseArtifact,releaseSignatureTargets} from './release-artifacts.mjs';
import {parseSignatureOptions,signatureHelp} from './release-cli.mjs';
export {authenticode} from './authenticode.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function verifySignedFile(file, publisher) {
  if (!publisher?.trim()) throw new Error('缺少 GEMS_PUBLISHER_NAME；不能确认发布者身份。');
  return readReleaseArtifact(file,{minimumBytes:16*1024,publisher,requireSigned:true});
}

export async function verifyReleaseSignatures(publisher) {
  if (!publisher?.trim()) throw new Error('缺少 GEMS_PUBLISHER_NAME；不能确认发布者身份。');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const targets = releaseSignatureTargets(version);
  const artifacts = [];
  for (const {file:name,minimumBytes} of targets) {
    const file = path.join(root, 'release', name);
    if (!fs.existsSync(file) || fs.statSync(file).size < minimumBytes) throw new Error(`缺少完整发行程序：${name}。`);
    artifacts.push({file: name, ...await readReleaseArtifact(file,{minimumBytes,publisher,requireSigned:true})});
  }
  const report = {schemaVersion: 2, version, generatedAt: new Date().toISOString(), publisher, signatureVerification: 'passed', fullRequirementsPassed: false, artifacts};
  fs.mkdirSync(path.join(root, 'artifacts'), {recursive: true});
  fs.writeFileSync(path.join(root, 'artifacts/signed-preview-signatures.json'), JSON.stringify(report, null, 2));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options=parseSignatureOptions(process.argv.slice(2));
    if(options.help){console.log(signatureHelp);process.exit(0);}
    if (options.file !== undefined) {
      await verifySignedFile(path.resolve(options.file), process.env.GEMS_PUBLISHER_NAME);
      console.log('通过：指定程序的发布者、可信签名与时间戳已实际验证。');
      process.exit(0);
    }
    await verifyReleaseSignatures(process.env.GEMS_PUBLISHER_NAME);
    console.log('通过：桌面程序、安装器、便携版和游戏助手 DLL 的发布者、可信签名与时间戳已实际验证。功能终验另行记录。');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
