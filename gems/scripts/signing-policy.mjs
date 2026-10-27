// 纯配置与验收规则；可信性由 Windows Authenticode 实际检查提供。
function required(env, key) {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim() || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new Error(`签名发行缺少有效配置：${key}。`);
  }
  return value.trim();
}

export function signedBuildConfig(env) {
  const mode = required(env, 'GEMS_SIGNING_MODE');
  const publisher = required(env, 'GEMS_PUBLISHER_NAME');
  if (publisher.length > 200) throw new Error('签名发布者名称过长。');
  const win = {signExecutable: true, verifyUpdateCodeSignature: true};
  if (mode === 'certificate') {
    if (!(env.WIN_CSC_LINK || env.CSC_LINK)?.trim()) throw new Error('缺少代码签名证书；拒绝生成未签名发行包。');
    if (typeof (env.WIN_CSC_KEY_PASSWORD ?? env.CSC_KEY_PASSWORD) !== 'string') throw new Error('缺少代码签名证书密码配置。');
    if (env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') throw new Error('签名发现已禁用，不能生成签名发行包。');
    win.signtoolOptions = {publisherName: publisher, signingHashAlgorithms: ['sha256']};
  } else if (mode === 'azure') {
    if (env.WIN_CSC_LINK || env.CSC_LINK) throw new Error('Azure 签名不能与本地证书配置混用。');
    const endpoint = new URL(required(env, 'GEMS_AZURE_SIGNING_ENDPOINT'));
    if (endpoint.protocol !== 'https:' || !/^[a-z0-9-]+\.codesigning\.azure\.net$/u.test(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
      throw new Error('Azure 签名端点必须是对应区域的官方 HTTPS 根地址。');
    }
    // 只提供服务主体凭据模式，避免构建流程临时弹出登录或隐式选择其他身份。
    for (const key of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET']) required(env, key);
    win.azureSignOptions = {
      publisherName: publisher,
      endpoint: endpoint.href,
      certificateProfileName: required(env, 'GEMS_AZURE_CERTIFICATE_PROFILE'),
      codeSigningAccountName: required(env, 'GEMS_AZURE_SIGNING_ACCOUNT'),
      fileDigest: 'SHA256', timestampDigest: 'SHA256',
      ExcludeCredentials: 'ManagedIdentityCredential,SharedTokenCacheCredential,VisualStudioCredential,VisualStudioCodeCredential,AzureCliCredential,AzurePowerShellCredential,InteractiveBrowserCredential'
    };
  } else throw new Error('不支持此签名方式；请选择 certificate 或 azure。');
  return {forceCodeSigning: true, electronDist: 'node_modules/electron/dist', win};
}

export function signingProblems(evidence, publisher) {
  const problems = [];
  if (evidence.status !== 'Valid') problems.push('Windows 未验证此文件的可信 Authenticode 签名');
  if (!evidence.publisher || evidence.publisher !== publisher) problems.push('签名发布者与配置不一致');
  if (!/^[a-f\d]{40}$/iu.test(evidence.thumbprint ?? '')) problems.push('缺少有效签名证书指纹');
  if (evidence.selfIssued !== false) problems.push('签名证书为自签名或无法确认颁发机构');
  if (evidence.codeSigningEku !== true) problems.push('签名证书缺少代码签名用途');
  if (evidence.timestamp !== true) problems.push('缺少签名时间戳');
  return problems;
}
