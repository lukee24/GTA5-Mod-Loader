import {build} from 'esbuild';
await build({entryPoints:['desktop/main.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/main.cjs',external:['electron'],sourcemap:true});
await build({entryPoints:['desktop/preload.ts'],bundle:true,platform:'node',format:'cjs',outfile:'dist/preload.cjs',external:['electron']});
