import {fail} from './errors';
export interface RpfLimits {maxArchiveBytes:number;maxEntries:number;maxNamesBytes:number;maxExpandedBytes:number;maxDepth:number}
export const DEFAULT_RPF_LIMITS:Readonly<RpfLimits>=Object.freeze({maxArchiveBytes:512*1024**2,maxEntries:100_000,maxNamesBytes:16*1024**2,maxExpandedBytes:128*1024**2,maxDepth:12});
/** Custom options may tighten the tested budgets; expanding support needs a separate review. */
export function captureRpfLimits(options:Partial<RpfLimits>={}):Readonly<RpfLimits>{
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(key=>!Object.hasOwn(DEFAULT_RPF_LIMITS,key)))fail('INVALID_LIMIT','RPF 安全限制字段无效。');
  const limits={...DEFAULT_RPF_LIMITS,...options};
  for(const key of Object.keys(DEFAULT_RPF_LIMITS) as (keyof RpfLimits)[]){const value=limits[key];if(!Number.isSafeInteger(value)||value<1||value>DEFAULT_RPF_LIMITS[key])fail('INVALID_LIMIT','RPF 安全限制必须为已验证预算内的正整数。');}
  return Object.freeze(limits);
}
