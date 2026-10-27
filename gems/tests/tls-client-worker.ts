import https from 'node:https';import dns from 'node:dns/promises';import {trustedResponse} from '../packages/marketplace/network';
const port=Number(process.argv[2]),mode=process.argv[3];if(!Number.isInteger(port)||port<1||port>65535||!['asset','doh'].includes(mode))throw new Error('TLS fixture arguments invalid');
const original=https.get;let requestCount=0;
// This child only: DNS fault injection plus transport routing to the parent's loopback fixture.
// Production domain/public-IP checks still run; the normal client options are forwarded to real TLS.
dns.lookup=(()=>Promise.resolve([{address:mode==='doh'?'198.18.0.1':'140.82.112.3',family:4}])) as unknown as typeof dns.lookup;
https.get=((target:any,options:any,callback:any)=>{const object=target instanceof URL?{...options,hostname:target.hostname,path:target.pathname+target.search}:target;const listener=target instanceof URL?callback:options;requestCount++;return original({...object,port,servername:object.hostname,lookup:((_h:any,_o:any,cb:any)=>cb(null,'127.0.0.1',4)) as any},listener);}) as typeof https.get;
try{const response=await trustedResponse('https://api.github.com/repos/author/mod/releases',AbortSignal.timeout(5000));let bytes=0;for await(const chunk of response)bytes+=chunk.length;console.log(JSON.stringify({accepted:true,bytes,requestCount}));}catch(error){console.log(JSON.stringify({accepted:false,error:(error as Error).message,requestCount}));}
