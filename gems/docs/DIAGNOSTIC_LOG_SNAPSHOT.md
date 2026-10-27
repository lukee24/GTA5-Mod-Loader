# 组件日志只读诊断（0.1.38）

固定检查游戏目录中的ScriptHookV.log、ScriptHookVDotNet.log、asiloader.log、OpenRPF.log、ReShade.log。每个普通独立日志最多读取末尾1MiB，另读取前1字节判断起点是否完整行；完整读取后核对文件/路径身份、链接、大小及纳秒时间。变化、连接/硬链接或读取异常拒绝且保留源，继续其他文件，不修复/转码/写日志。

截取从完整行起点不丢首条错误，从半行开始丢弃首片段后解码。原始行号未知仍为null；完整UTF8及带BOM的UTF16LE按原能力解析，截取UTF16和其他不确定编码拒绝。没有来源认证、OS锁/跨日志同时快照或内存/IO压力认证。

返回findings/readErrors/summary并增加coverage与logs。coverage.read只算快照完整且文本解码通过的日志，missing/failed/truncated为实际文件计数；每条logs给出size/start/bytes/ioBytes/checked，bytes为待解析尾部量，ioBytes可能多1字节边界。最多200条匹配线索，关键词并非确定错误或崩溃因果，无匹配不代表游戏正常，全缺明确未完成日志内容诊断。更多日志源、最近变更归因、分组/二分和真实崩溃验证未完成。

验证npm run test:diagnostic-log-snapshot：新增9项（旧版6失败），定向17/17及核心426/426、构建通过；真实隔离日志与模拟PE/RPF结构，read边界故障注入，未执行游戏程序。实际E目录固定五日志全缺，live-diagnostic-current.json不保存正文，缺日志结果不是游戏加载/真实崩溃或实际组件内容验收。

原Electron被3077阻止且未解除验证，本轮没有再次启动/改名/换父进程/改策略。本版IPC/UI/布局及最终EXE未验收，完整商业与游戏功能缺口保留。
