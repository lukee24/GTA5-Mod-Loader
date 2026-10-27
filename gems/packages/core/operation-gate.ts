// 停止接收新任务，等待已开始的任务完成，再释放数据库和窗口。
export class OperationGate {
  private active=false;private stopping=false;private waiters:(()=>void)[]=[];
  get closing(){return this.stopping;}
  enter(){if(this.stopping)throw new Error('应用正在完成任务并退出，请等待');if(this.active)throw new Error('已有任务正在执行，请稍候');this.active=true;}
  leave(){this.active=false;for(const resolve of this.waiters.splice(0))resolve();}
  async close(){this.stopping=true;if(this.active)await new Promise<void>(resolve=>this.waiters.push(resolve));}
}
