// 仅解释明确声明的参数；不回显未知值，避免把误传的凭据打印到日志。
function argumentsList(args){
 if(!Array.isArray(args)||args.length>16||args.some(value=>typeof value!=='string'||!value||value.length>32768||/[\x00-\x1f\x7f]/u.test(value)))throw new Error('发行参数无效：需要有限、完整的命令行参数。');
 return args;
}
function flags(args,allowed){
 argumentsList(args);
 if(args.length===1&&args[0]==='--help')return {help:true};
 const seen=new Set();
 for(const arg of args){
  if(!allowed.includes(arg))throw new Error('发行参数无效：存在未知选项或多余参数，请使用 --help 查看用法。');
  if(seen.has(arg))throw new Error('发行参数无效：选项不能重复。');
  seen.add(arg);
 }
 return {help:false,seen};
}
export function parseManifestOptions(args){
 const parsed=flags(args,['--source-only','--installer-unavailable','--require-signed']);
 if(parsed.help)return Object.freeze({help:true});
 const sourceOnly=parsed.seen.has('--source-only'),installerUnavailable=parsed.seen.has('--installer-unavailable'),requireSigned=parsed.seen.has('--require-signed');
 if(requireSigned&&(sourceOnly||installerUnavailable))throw new Error('发行参数冲突：签名预览要求完整桌面程序、安装器及便携包。');
 if(sourceOnly&&installerUnavailable)throw new Error('发行参数冲突：源码交付与缺少安装器的桌面交付只能选择一种。');
 return Object.freeze({help:false,sourceOnly,installerUnavailable,requireSigned});
}
export function parseSignedBuildOptions(args){
 const parsed=flags(args,['--preflight']);
 return Object.freeze(parsed.help?{help:true}:{help:false,preflight:parsed.seen.has('--preflight')});
}
export function parseSignatureOptions(args){
 argumentsList(args);
 if(args.length===1&&args[0]==='--help')return Object.freeze({help:true});
 if(args.length===0)return Object.freeze({help:false});
 if(args.length!==2||args[0]!=='--file'||!args[1].trim()||args[1].startsWith('-'))throw new Error('发行参数无效：签名检查仅支持无参数或 --file 程序路径；请使用 --help 查看用法。');
 return Object.freeze({help:false,file:args[1]});
}
export const manifestHelp='用法：node scripts/release-manifest.mjs [--source-only | --installer-unavailable | --require-signed]\n无参数：开发发行清单；--source-only：只交付源码与声明附件；--installer-unavailable：开发桌面包缺安装器；--require-signed：完整签名预览，不允许降级。';
export const signedBuildHelp='用法：node scripts/signed-build.mjs [--preflight]\n--preflight：只检查签名配置字段；无参数：构建并验证签名预览，缺少身份或凭据时拒绝。';
export const signatureHelp='用法：node scripts/verify-signatures.mjs [--file 程序路径]\n无参数：核验全部声明的发行代码；--file：只核验指定程序；两种方式均需明确发布者，不能当作功能终验。';
