// Explicit development test hook only; records startup error calls without a blocking native dialog.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(process.env.GEMS_DB_FIXTURE_ROOT||'');
if(path.dirname(root)!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('gems-db-ui-'))throw Error('数据库错误记录范围无效');
require('electron').dialog.showErrorBox=(title,message)=>fs.writeFileSync(path.join(root,'notice.json'),JSON.stringify({title,message}));
