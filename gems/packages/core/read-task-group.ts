/** Bounded independent reads, tracked through shutdown without occupying the mutation gate. */
export class ReadTaskGroup{
  private active=new Set<symbol>();private stopping=false;private waiters:(()=>void)[]=[];
  constructor(private limit=3){if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw new Error('并行读取数量无效');}
  enter(){if(this.stopping)throw new Error('应用正在退出，停止接收读取任务');if(this.active.size>=this.limit)throw new Error('读取任务过多，请等待当前读取完成');const token=Symbol();this.active.add(token);return()=>{if(!this.active.delete(token))return;if(!this.active.size)for(const resolve of this.waiters.splice(0))resolve();};}
  async close(){this.stopping=true;if(this.active.size)await new Promise<void>(resolve=>this.waiters.push(resolve));}
}
