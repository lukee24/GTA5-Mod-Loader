export interface LogEvidence {
  line: number | null;
  excerptLine: number;
  truncated: boolean;
  evidence: string;
}

export function logEvidence(buffer: Buffer, truncated: boolean, startsOnLine = false): LogEvidence[] {
  let text: string;
  const utf16 = buffer.subarray(0,2).equals(Buffer.from([0xff,0xfe])) && !truncated;
  if (!utf16 && buffer.includes(0)) {
    // 截取 UTF-16 中间字节不能可靠定位边界，明确拒绝误解码。
    throw new Error('日志编码无法可靠读取；请导出 UTF-8 文本后再检查。');
  }
  let input = buffer;
  if (truncated && !startsOnLine) {
    const boundary = buffer.indexOf(10);
    if (boundary < 0) return [];
    input = buffer.subarray(boundary + 1);
  }
  try {text = new TextDecoder(utf16 ? 'utf-16le' : 'utf-8', {fatal: true}).decode(input);}
  catch {throw new Error('日志编码无法可靠读取；请导出 UTF-8 文本后再检查。');}
  const lines = text.split(/\r?\n/u);
  return lines.flatMap((value, index) => {
    if (!/error|failed|exception|unsupported|fatal/iu.test(value)) return [];
    return [{line: truncated ? null : index + 1, excerptLine: index + 1, truncated,
      evidence: value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/gu,'').slice(0,1000)}];
  }).slice(0,200);
}
