import type {ClientRequest,IncomingMessage} from 'node:http';

/** Bound connection/TLS/header wait separately from an established socket's idle timeout. */
export function responseHeaders(start:(receive:(response:IncomingMessage)=>void)=>ClientRequest,signal:AbortSignal,milliseconds:number,timeoutMessage:string,failureMessage:string):Promise<IncomingMessage>{
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    let request:ClientRequest|undefined,timer:ReturnType<typeof setTimeout>|undefined;
    let settled=false,failed=false;
    const cleanup=()=>{if(timer!==undefined)clearTimeout(timer);signal.removeEventListener('abort',abort);};
    const fail=(error:Error)=>{
      if(settled)return;settled=true;failed=true;cleanup();
      // Reject directly: Node may defer request error/close until a pending Agent supplies its socket.
      request?.destroy();reject(error);
    };
    const abort=()=>fail(new Error('下载已取消或超过时限',{cause:signal.reason}));
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    try{
      request=start(response=>{
        if(settled){response.destroy();return;}
        if(signal.aborted){abort();response.destroy();return;}
        settled=true;cleanup();resolve(response);
      });
      // Keep an error handler for late native errors after explicit cancellation/destruction.
      request.on('error',error=>fail(new Error(failureMessage,{cause:error})));
      request.once('close',()=>{if(!settled)fail(new Error(failureMessage));});
      if(failed){request.destroy();return;}
      if(!settled)timer=setTimeout(()=>fail(new Error(timeoutMessage)),milliseconds);
    }catch(error){fail(new Error(failureMessage,{cause:error}));}
  });
}
