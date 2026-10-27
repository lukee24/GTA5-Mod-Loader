import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {signedBuildConfig} from './signing-policy.mjs';
import {verifyReleaseSignatures} from './verify-signatures.mjs';
import {parseSignedBuildOptions,signedBuildHelp} from './release-cli.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  const options=parseSignedBuildOptions(process.argv.slice(2));
  if(options.help){console.log(signedBuildHelp);process.exit(0);}
  // 缺少身份或凭据时，在构建前失败；不输出密钥、证书内容或云身份凭据。
  const config = signedBuildConfig(process.env);
  if (options.preflight) {
    console.log('签名配置字段检查通过；尚未连接签名服务或验证证书。');
  } else {
    if (process.platform !== 'win32') throw new Error('签名发行构建必须在 Windows 执行。');
    process.chdir(root);
    const {build, Platform, Arch} = createRequire(import.meta.url)('electron-builder');
    await build({targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64), config, publish: 'never'});
    await verifyReleaseSignatures(process.env.GEMS_PUBLISHER_NAME.trim());
    console.log('签名预览构建已通过签名检查，仍需安装、卸载、桌面和游戏功能验收。');
  }
} catch (error) {
  // 第三方构建错误可能含凭据路径：终端仅给出字段检查错误或通用构建失败。
  console.error(error.message.startsWith('发行参数') || error.message.startsWith('签名') || /^(缺少|不支持|Azure|必须|签名发现)/u.test(error.message)
    ? error.message : '签名发行失败；未生成可发布结论。请检查签名服务、证书和构建状态。');
  process.exitCode = 1;
}
