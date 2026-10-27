import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {Store} from '../packages/database';import {SourceLibrary} from '../packages/marketplace/sources';
const root=path.resolve(process.argv[2]||''),mode=process.argv[3];if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-source-atomic-ui-')||!['new','rename','remove','healthy'].includes(mode))throw new Error('来源原子桌面夹具范围无效');
const store=await Store.open(path.join(root,'data'),path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'));store.put('settings','main',{gamePath:'',theme:'dark',accent:'#4B8BFF',scale:1,collapsed:false,reduceMotion:true});const library=new SourceLibrary(store);library.save('base/original','隔离原始收藏（未访问网站）');fs.writeFileSync(path.join(root,'baseline.json'),JSON.stringify(library.view()));
// Actual SQLite statement faults only in this temporary database, not arbitrary mod SQL.
if(mode==='remove')store.db.run("CREATE TRIGGER fixture_delete_failure BEFORE DELETE ON documents WHEN OLD.kind='market-source' BEGIN SELECT RAISE(ABORT,'隔离来源删除失败'); END;");
else if(mode!=='healthy')store.db.run("CREATE TRIGGER fixture_settings_failure BEFORE INSERT ON documents WHEN NEW.kind='market-settings' BEGIN SELECT RAISE(ABORT,'隔离来源选择保存失败'); END;");
store.close();
