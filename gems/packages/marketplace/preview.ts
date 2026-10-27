/** Validate declared dimensions before handing a bounded bitmap to Chromium. Not a model renderer. */
export function previewDimensions(bytes:Buffer){
  let width=0,height=0,mime='';
  if(bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.subarray(12,16).toString()==='IHDR'){
    width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);mime='image/png';
    let offset=8,ended=false,pixels=false;
    while(offset+12<=bytes.length){const length=bytes.readUInt32BE(offset),tag=bytes.subarray(offset+4,offset+8).toString(),end=offset+12+length;if(end>bytes.length)throw new Error('PNG预览块被截断');if(['acTL','fcTL','fdAT'].includes(tag))throw new Error('动画PNG预览尚未支持');if(tag==='IHDR'&&(offset!==8||length!==13))throw new Error('PNG预览头无效');if(tag==='IDAT')pixels=true;offset=end;if(tag==='IEND'){if(length!==0)throw new Error('PNG预览结束块无效');ended=true;break;}}
    if(!ended||!pixels||offset!==bytes.length)throw new Error('PNG预览结构不完整');
  }else if(bytes.length>=4&&bytes.readUInt16BE(0)===0xffd8){
    let offset=2;
    while(offset+3<bytes.length){
      if(bytes[offset++]!==255)break;while(bytes[offset]===255)offset++;const marker=bytes[offset++];
      if(marker===0xda||marker===0xd9)break;if(marker===1||marker>=0xd0&&marker<=0xd7)continue;
      const length=bytes.readUInt16BE(offset);if(length<2||offset+length>bytes.length)break;
      if([0xc0,0xc1,0xc2].includes(marker)&&length>=8){height=bytes.readUInt16BE(offset+3);width=bytes.readUInt16BE(offset+5);mime='image/jpeg';break;}offset+=length;
    }
  }else if(bytes.length>=20&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'){
    if(bytes.readUInt32LE(4)!==bytes.length-8)throw new Error('WebP预览长度无效');
    let offset=12,canvas:{width:number;height:number}|undefined,bitmap:{width:number;height:number}|undefined;
    while(offset+8<=bytes.length){
      const tag=bytes.subarray(offset,offset+4).toString(),length=bytes.readUInt32LE(offset+4),start=offset+8,end=start+length;
      if(end>bytes.length)throw new Error('WebP预览块被截断');
      if(tag==='ANIM'||tag==='ANMF')throw new Error('动画预览尚未支持');
      if(tag==='VP8X'){
        if(length!==10||bytes[start]&2)throw new Error('WebP扩展或动画预览不受支持');
        canvas={width:bytes.readUIntLE(start+4,3)+1,height:bytes.readUIntLE(start+7,3)+1};check(canvas.width,canvas.height);
      }else if(tag==='VP8 '){
        if(length<10||bytes[start]&1||!bytes.subarray(start+3,start+6).equals(Buffer.from([157,1,42])))throw new Error('WebP预览帧头无效');
        if(bitmap)throw new Error('WebP重复预览帧');bitmap={width:bytes.readUInt16LE(start+6)&0x3fff,height:bytes.readUInt16LE(start+8)&0x3fff};check(bitmap.width,bitmap.height);
      }else if(tag==='VP8L'){
        if(length<5||bytes[start]!==0x2f)throw new Error('WebP无损预览帧头无效');const bits=bytes.readUInt32LE(start+1);
        if(bits>>>29||bitmap)throw new Error('WebP无损版本或重复帧不受支持');bitmap={width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};check(bitmap.width,bitmap.height);
      }
      if(length%2&&(end>=bytes.length||bytes[end]!==0))throw new Error('WebP预览填充无效');
      offset=end+(length%2);if(offset>bytes.length)throw new Error('WebP预览填充被截断');
    }
    if(offset!==bytes.length||!bitmap||canvas&&(canvas.width!==bitmap.width||canvas.height!==bitmap.height))throw new Error('WebP预览尺寸或结构不一致');
    width=bitmap.width;height=bitmap.height;mime='image/webp';
  }
  if(!mime)throw new Error('预览图片格式不受支持');check(width,height);return{width,height,mime};
}
function check(width:number,height:number){if(!width||!height||width>1024||height>1024)throw new Error('预览图片尺寸不受支持');}
