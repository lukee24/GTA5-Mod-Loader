/** User-facing explanations; preserve concise Chinese domain errors without exposing raw OS errors. */
export function explainError(error: unknown): string {
  const value = error && typeof error === 'object' ? error as {code?: unknown; message?: unknown} : null;
  const raw = String(value?.message ?? error ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 1200);
  const code = typeof value?.code === 'string' ? value.code : raw.match(/\b(E[A-Z]+)\b/)?.[1];
  const messages: Record<string, string> = {
    ENOENT: '所需文件不存在，请检查目录或重新导入模组。',
    EACCES: '没有访问文件的权限，请检查目录权限。',
    EPERM: '系统拒绝访问文件，请检查权限、文件占用或安全软件的提示。',
    EBUSY: '文件正在被其他程序使用，请关闭相关程序后重试。',
    ENOSPC: '磁盘剩余空间不足，请释放空间后重试。',
    EEXIST: '目标文件已存在；为保护已有数据，此操作已停止。',
    EISDIR: '所选路径是文件夹，此操作需要文件。',
    ENOTDIR: '路径中的一项不是文件夹，请检查所选目录。',
    EIO: '磁盘读写失败，请检查磁盘状态并保留恢复记录。',
    EMFILE: '打开的文件过多，请稍后重试。',
    ETIMEDOUT: '操作超时，请检查相关程序的状态后重试。',
  };
  if (code && messages[code]) return messages[code] + '（错误代码：' + code + '）';
  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  return '操作未完成，请查看日志并检查文件或组件状态。' + (raw ? '\n技术信息：' + raw : '');
}
