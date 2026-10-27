# Steam缺安装记录未知门禁

0.1.44：R49/P2 Steam形目录初始缺ACF走null回退，validateGame可仅凭PE/RPF继续并允许预览后安装/自动恢复。增加record present/missing状态，已定位steamapps/common但缺记录明确ready=false/构建计数未知，环境显示未知且拒绝；既有守卫接入安装/恢复，恢复保留已应用文件与真实待处理原因，外部有效记录恢复后可继续。新增6项，初始修正一处测试断言后1通过/5失败，定向26/26、核心483/483/0跳过、构建通过；真实隔离SQLite/备份/事务/模拟PE-RPF，不算真实Steam更新或游戏。15:40香港时间实际E只读record=present/就绪build25261616/1.0.1158.16/未运行，未保存ACF正文。原Electron3077未重试/绕过，无新依赖/公网/商业许可或游戏写入，完整终验缺口保留，详见STEAM_MISSING.md。

inspectSteam返回SteamStatus新增record=present/missing。只有父级路径不是steamapps/common时返回null（不适用）；downloading仍拒绝。已定位Steam形目录但ACF缺失，返回missing、ready=false、build未知、downloaded/total=null、中文缺记录证据。不会创建/改写ACF、搜索替代记录或调整账户/更新设置。路径结构为保守识别，不是Steam官方接口/账号证明。

inspectEnvironment显示Steam下载与部署未知，并在validateGame拒绝后标游戏目录未就绪/版本未知，不再凭MZ/PE/RPF标记确认缺记录部署。原PE/RPF与进程/路径/组件检查保持，其他平台不凭路径猜Steam状态。正常present记录仍执行0.1.43读取快照与原有限就绪规则。

Installer使用既有guard，预览后记录消失会在执行的首个部署守卫拒绝，不生成备份/目标写入/事务假成功；已发生写入的中断事务恢复会记录恢复待处理及中文原因，保留applied文件和备份。用户或Steam合法恢复有效记录后再恢复，软件不代修记录。未知状态不是可以默认继续的错误提示。

首次识别及快照不是OS锁，检查后仍可能变化；没有跨平台所有部署识别、真实Steam更新并发或断电保证，不能宣传绝对稳定。

测试真实临时SQLite/备份/Importer/Installer、模拟PE-RPF文件标记：6项新增，正确初始5失败1通过（首次一个downloading断言错误日志保留）；定向26/核心483/构建通过。原初始缺ACF返回null历史测试更新为显式unknown策略，无容量/路径/UTF8门禁放宽。恢复缺记录保持new文件，外部记录恢复后真备份还原old文件与回滚状态；不是实际Steam客户端更新或游戏测试。

实际E只读steam-missing-live-current.json记录present/就绪/版本与进程，无ACF正文或账号信息，未修改真实游戏或Steam。原Electron3077未重试，UI/IPC/最终EXE待验收，无新依赖/许可。运行npm run test:steam-missing。
