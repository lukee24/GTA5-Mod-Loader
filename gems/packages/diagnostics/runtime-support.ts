// 官方支持记录快照；不能替代实时查询、二进制身份核验或游戏内实测。
export const scriptHookSupport = {
  component: 'ScriptHookV',
  release: 'v3889.0 / 1158.13',
  released: '2026-07-15',
  checked: '2026-10-26',
  enhancedVersions: ['1.0.1158.13'],
  source: 'https://www.dev-c.com/gtav/scripthookv/'
} as const;

export function scriptHookVersionSupport(gameVersion: string): 'matched' | 'not-listed' | 'unknown' {
  const version = gameVersion.trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/u.test(version)) return 'unknown';
  return scriptHookSupport.enhancedVersions.some(supported => supported === version) ? 'matched' : 'not-listed';
}

export function runtimeSupportEvidence(gameVersion: string) {
  const record = scriptHookSupport;
  const version = gameVersion.trim();
  const support = scriptHookVersionSupport(version);
  const matches = support === 'matched';
  const knownVersion = support !== 'unknown';
  const conclusion = matches
    ? '游戏版本匹配此官方支持记录；组件二进制和游戏内运行仍待验证'
    : knownVersion
      ? '此游戏版本未被本地官方支持记录覆盖；不能确认兼容'
      : '游戏版本无法确认，不能匹配组件支持记录';
  return {
    name: 'ScriptHookV 版本支持',
    status: matches ? '版本记录匹配，待验证' : '兼容性未确认',
    evidence: `${conclusion}。游戏 ${version || '未知'}；记录的 Enhanced 支持版本 ${record.enhancedVersions.join('、')}；${record.release}，发布 ${record.released}，核对 ${record.checked}。来源：${record.source}`
  };
}
