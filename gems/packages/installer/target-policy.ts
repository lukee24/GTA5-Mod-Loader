import {relativeSafe} from '../core/security';
export function validateTarget(value:string,trustedRestore=false){
  const target=relativeSafe(value);
  if(!/^(mods|scripts)\//i.test(target)&&!(/^[^/]+\.(asi|ini)$/i.test(target))&&!(trustedRestore&&/^[^/]+\.dll$/i.test(target)))throw new Error('不支持的目标：仅允许 mods、scripts 和明确清单中的根目录 ASI / INI');
  if(/\.(exe|bat|cmd|ps1|vbs|js)$/i.test(target))throw new Error('禁止安装程序、系统脚本或 JavaScript');
  if(/(?:^|\/)(gta5[^/]*|update|common)\.exe$/i.test(target))throw new Error('禁止覆盖游戏程序');
  return target;
}
