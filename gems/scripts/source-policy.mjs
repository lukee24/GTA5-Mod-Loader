// Public source is an allowlist. Local evidence, game files and SDK binaries stay local.
function parts(relative) {
  if (typeof relative !== 'string' || !relative || /[:\x00-\x1f\x7f]/u.test(relative)) return null;
  const segments = relative.replaceAll('\\', '/').split('/');
  if (segments.some(s => !s || s === '.' || s === '..' || /^(\.env(?:\..*)?|\.secrets|secrets|credentials?|certificates|certs|node_modules|dist|release|artifacts|\.git|bin(?:-net48)?|obj(?:-net48)?|\.ui-data|\.oss-private)$/iu.test(s))) return null;
  if (segments.some(s => /\.(exe|dll|asi|pdb|zip|7z|rar|rpf|yft|ytd|ydr|ydd|sqlite|db|log|tap|pfx|p12|pem|key|keystore)$/iu.test(s))) return null;
  return segments;
}

export function sourceEntryAllowed(relative, isDirectory = false) {
  const segments = parts(relative);
  if (!segments) return false;
  const normalized = segments.join('/');
  if (segments.length === 1 && !isDirectory) return /^(package(?:-lock)?\.json|tsconfig\.json|vite\.config\.ts|README\.md|LICENSE|\.gitignore)$/u.test(normalized);
  if (!['assets','desktop','packages','scripts','tests','docs','native'].includes(segments[0])) return false;
  if (segments[0] === 'assets') return isDirectory ? segments.length === 1 : normalized === 'assets/gems.ico';
  if (segments.includes('third_party')) {
    const base = 'native/game-assistant/third_party/shvdne';
    if (isDirectory) return [base,base+'/package',base+'/package/Licenses','native/game-assistant/third_party'].includes(normalized);
    return normalized === base+'/SOURCE.md' || new RegExp('^'+base+'/package/Licenses/[^/]+\\.(md|txt)$','u').test(normalized);
  }
  if (isDirectory) return true;
  if (normalized === 'native/game-assistant/tests/weapon-catalog/.gitignore') return true;
  if (segments[0] === 'docs') return /\.(md|txt)$/u.test(normalized) || normalized === 'docs/DEPENDENCIES.json' || normalized === 'docs/images/dashboard.png';
  return /\.(ts|tsx|mjs|cjs|ps1|cs|csproj|json|html|css|md|txt)$/u.test(normalized);
}

// Paths at the public repository root, outside gems/.
export function repositoryEntryAllowed(relative, isDirectory = false) {
  const segments = parts(relative);
  if (!segments) return false;
  const normalized = segments.join('/');
  if (segments[0] === 'gems') return segments.length === 1 ? isDirectory : sourceEntryAllowed(segments.slice(1).join('/'),isDirectory);
  if (segments.length === 1 && !isDirectory) return /^(README(?:\.[A-Za-z-]+)?\.md|LICENSE|NOTICE(?:\.md)?|CONTRIBUTING\.md|SECURITY\.md|CODE_OF_CONDUCT\.md|SUPPORT\.md|\.gitignore)$/u.test(normalized);
  if (segments[0] === 'docs') return isDirectory || /\.(md|txt)$/u.test(normalized);
  if (segments[0] === '.github') {
    if (isDirectory) return ['.github','.github/workflows','.github/ISSUE_TEMPLATE'].includes(normalized);
    return /^\.github\/(?:workflows\/[^/]+\.ya?ml|ISSUE_TEMPLATE\/[^/]+\.(?:md|ya?ml)|pull_request_template\.md)$/u.test(normalized);
  }
  return false;
}
