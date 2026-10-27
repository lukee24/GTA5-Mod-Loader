export class RpfError extends Error {
  constructor(public readonly code:string,message:string,options?:ErrorOptions){super(message,options);this.name='RpfError';}
}
export function fail(code:string,message:string,cause?:unknown):never{throw new RpfError(code,message,{cause});}
