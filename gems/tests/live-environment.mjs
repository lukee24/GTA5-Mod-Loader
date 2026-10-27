import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// 显式选择实际游戏目录；只读游戏，所有数据和导入夹具写入独立临时目录。
const root = process.env.GEMS_LIVE_GAME_PATH;
if (!root || !path.isAbsolute(root)) throw new Error('请通过 GEMS_LIVE_GAME_PATH 明确指定已安装的 Enhanced 游戏目录。');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-live-readonly-'));
const source = fs.mkdtempSync(path.join(os.tmpdir(), 'gems-live-fixture-'));
const targetName = `GEMS-readonly-guard-${path.basename(source)}.ini`;
const target = path.join(root, 'scripts', targetName);
if (fs.existsSync(target)) throw new Error('只读守卫目标已存在，拒绝复用。');
fs.mkdirSync(path.join(source,'scripts'));
fs.writeFileSync(path.join(source,'scripts',targetName),'fixture=1');
const app = await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
const errors = [];
try {
  const page = await app.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('heading',{name:'你的模组工作空间'}).waitFor();
  // 只替换测试文件选择器，仍调用实际 IPC 与环境检查后端。
  await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},root);
  const selected = await page.evaluate(()=>window.gems.call('chooseGame'));
  if(!selected.ok || !selected.data.environment.valid) throw new Error('实际游戏目录检查未通过。');
  const environment = selected.data.environment;
  if(selected.data.settings.gamePath !== root || !/^\d+\.\d+\.\d+\.\d+$/u.test(environment.version)) throw new Error('实际路径或游戏版本未读出。');
  if(!environment.components.some(c=>c.name === 'ScriptHookV 版本支持')) throw new Error('缺少实际版本支持记录。');
  if(environment.components.some(c=>['NVE','LWE'].includes(c.name) && c.status !== '未知')) throw new Error('缺少可信数据却推断图形组件状态。');
  let installGuardTest = 'not-run-game-not-running';
  if(environment.running) {
    const imported = await page.evaluate(source=>window.gems.call('import',{paths:[source]}),source);
    if(!imported.ok || imported.data.errors.length) throw new Error('独立夹具导入失败。');
    const planned = await page.evaluate(id=>window.gems.call('plan',{id}),imported.data.state.imports[0].id);
    if(planned.ok || !planned.error.includes('游戏正在运行')) throw new Error('实际游戏运行时安装门禁未返回预期拒绝。');
    if(fs.existsSync(target)) throw new Error('只读预览写入了实际游戏目录。');
    const state = await page.evaluate(()=>window.gems.call('state'));
    if(!state.ok || state.data.mods.length || state.data.transactions.length) throw new Error('阻止预览却产生安装或事务记录。');
    installGuardTest = 'passed';
  }
  await page.reload();
  await page.evaluate(()=>window.gems.call('environment'));
  await page.reload();
  await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();
  await page.getByLabel('界面主题').selectOption('dark');
  await page.locator('nav').getByRole('button',{name:'首页',exact:true}).click();
  await page.getByText(`版本：${environment.version}`,{exact:false}).waitFor();
  fs.mkdirSync('artifacts/ui',{recursive:true});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  await page.screenshot({path:'artifacts/ui/actual-environment-live.png'});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,768));
  for (const theme of ['dark','light']) {
    await page.locator('nav').getByRole('button',{name:'设置',exact:true}).click();
    await page.getByLabel('界面主题').selectOption(theme);
    const names = await page.locator('nav button').allTextContents();
    for(const name of names.map(n=>n.trim()).filter(Boolean)) {
      await page.locator('nav').getByRole('button',{name,exact:true}).click();
      if(await page.evaluate(()=>document.querySelector('main').scrollWidth>document.querySelector('main').clientWidth+2)) throw new Error(`实际环境 ${theme} ${name} 页面横向溢出。`);
    }
  }
  await page.locator('nav').getByRole('button',{name:'首页',exact:true}).click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('main').firstElementChild).opacity==='1');
  await page.screenshot({path:'artifacts/ui/actual-environment-live-1024-light.png'});
  if(errors.length) throw new Error(errors.join('；'));
  if(fs.existsSync(target)) throw new Error('只读测试意外写入了实际游戏。');
  const report = {schemaVersion:1,checked:new Date().toISOString(),scope:'实际目录只读检测与桌面显示，未安装模组或验证游戏助手',environment,installGuardTest,gameTargetWritten:false,uiReadOnlyTest:'passed',gameplayTest:'not-completed'};
  fs.writeFileSync('artifacts/game-environment-current.json',JSON.stringify(environment,null,2));
  fs.writeFileSync('artifacts/live-environment-test.json',JSON.stringify(report,null,2));
  console.log(`通过：实际游戏 ${environment.version} 目录、组件、运行状态及中文深浅主题全部导航只读回归；运行中安装守卫 ${installGuardTest}。没有游戏写入。`);
} finally {await app.close();}

const reopened = await electron.launch({args:['.'],env:{...process.env,GEMS_TEST_DATA:data},timeout:30000});
try {
  const page = await reopened.firstWindow();
  await page.getByText('版本：',{exact:false}).filter({hasText:/\d+\.\d+\.\d+\.\d+/u}).waitFor();
  const state = await page.evaluate(()=>window.gems.call('state'));
  if(!state.ok || !state.data.environment?.valid || state.data.environment.path !== root) throw new Error('重启后首次 state 未包含真实环境。');
  if(fs.existsSync(target)) throw new Error('重启后的只读检测意外写入游戏。');
  const file = 'artifacts/live-environment-test.json';
  const report = JSON.parse(fs.readFileSync(file,'utf8'));
  report.startupEnvironmentTest = 'passed';
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log('通过：实际退出并重启桌面应用后，首页首次查询即显示已绑定游戏的实际检测结果。');
} finally {await reopened.close();}
