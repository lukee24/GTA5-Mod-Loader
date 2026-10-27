import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSevenZipListing} from '../packages/scanner/sevenzip-listing';
import {MAX_BYTES} from '../packages/core/security';

const row = (name = 'mods/config.ini', extra: Record<string,string> = {}) => Object.entries({Path:name,Size:'3','Packed Size':'3',Attributes:'A -rw-rw-rw-',CRC:'352441C2',Encrypted:'-',Method:'Copy',Block:'0',...extra}).map(([key,value]) => key+' = '+value).join('\n')+'\n\n';
test('技术目录识别真实7Z/RAR字段、中文空格与空目录，不允许存在歧义',()=>{
  const input=row('mods/中文 空格.ini')+row('empty',{Size:'0',Attributes:'D drwxrwxrwx',CRC:'',Method:'',Block:''});
  const entries=parseSevenZipListing(input,1024); assert.equal(entries[0].path,'mods/中文 空格.ini');assert.equal(entries[1].directory,true);
  assert.equal(parseSevenZipListing(row('plain',{Folder:'-','Alternate Stream':'-','Symbolic Link':'','Hard Link':'','Copy Link':'','Volume Index':'','NT Security':''}),1024).length,1);
  for(const text of [row()+'nonsense\n',row().replace('Size = 3','Size = 3\nSize = 3'),row().replace('Path = mods/config.ini','Path = mods/line\nbreak.ini')])assert.throws(()=>parseSevenZipListing(text,1024),/歧义|重复|未支持/u);
});
test('目录穿越、绝对/设备路径、ADS、通配符及命令样式危险路径先于解压被拒绝',()=>{
  for(const name of ['../escape.ini','mods/../../escape.ini','C:\\outside.ini','/outside.ini','\\\\server\\share','mods/NUL.txt','mods/a:b','mods/*.ini','mods/trailing.','mods//double.ini'])assert.throws(()=>parseSevenZipListing(row(name),1024),/非法路径/u);
});
test('重复大小写、文件目录冲突、链接、加密和分卷不进入后端提取',()=>{
  assert.throws(()=>parseSevenZipListing(row('mods/x')+row('MODS/X'),1024),/重复|大小写/u);
  assert.throws(()=>parseSevenZipListing(row('mods')+row('mods/x'),1024),/文件与目录/u);
  for(const extra of [{Encrypted:'+'},{'Symbolic Link':'../escape'},{'Hard Link':'elsewhere'},{'Alternate Stream':'+'},{'Split After':'+'},{'Volume Index':'0'},{Attributes:'A lrwxrwxrwx'}] as Record<string,string>[])assert.throws(()=>parseSevenZipListing(row('mods/x',extra),1024),/加密|链接|分卷|类型/u);
});
test('文件数、大小、压缩比、字典、CRC和目录数据声明受到上限约束',()=>{
  for(const extra of [{Size:String(MAX_BYTES+1)},{Size:'9007199254740993'},{Size:'-1'},{CRC:''},{CRC:'NOT_A_CRC'},{Size:'1',Attributes:'D'}] as Record<string,string>[])assert.throws(()=>parseSevenZipListing(row('mods/x',extra),1024),/尺寸|CRC/u);
  assert.throws(()=>parseSevenZipListing(row('mods/x',{Size:String(1024**2*2)}),1),/压缩比例/u);
  assert.throws(()=>parseSevenZipListing(Array.from({length:20001},(_,i)=>row('f'+i,{Size:'0',CRC:'00000000'})).join(''),1024),/数量/u);
  for(const Method of ['LZMA2:30','LZMA:31 BCJ','m3:1g','m5:1024m','m3:30'])assert.throws(()=>parseSevenZipListing(row('mods/x',{Method}),1024),/字典/u);
  for(const Method of ['LZMA2:29','LZMA:24 BCJ','m3:512m','m5:524288k','m3:29'])assert.equal(parseSevenZipListing(row('mods/x',{Method}),1024).length,1);
});

