/** Cancel the caller's wait without claiming to cancel an OS operation that has no cancellation API. */
export function awaitAbort<T>(operation:()=>Promise<T>,signal:AbortSignal):Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve,reject)=>{
    let settled=false;
    const finish=(error:unknown,value?:T,failed=false)=>{if(settled)return;settled=true;signal.removeEventListener('abort',abort);if(failed)reject(error);else resolve(value as T);};
    const abort=()=>finish(signal.reason,undefined,true);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    try{operation().then(value=>finish(undefined,value),error=>finish(error,undefined,true));}catch(error){finish(error,undefined,true);}
    // A late result/rejection is consumed above and cannot start a new request after cancellation.
  });
}
