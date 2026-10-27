# 有限OIV安装计划（0.1.37）

本后端只执行已实现的顶层add静态计划。只有明确source与目标文本、无额外属性或子指令的操作准入；额外条件/指令、未知包内容/其他游戏目标或未核对包格式版本阻止，并清空推断目标，不安装部分计划。所有映射源都存在才绑定，源/目标重复拒绝，最多20000操作。游戏实际写入仍须原Installer/风险/冲突批准和事务备份，本模块不写游戏。

OIV/OIVS同时包含gems.mod.json时是双重安装入口，默认不擅自选择，方法显示“未执行”，原包保留；没有自动清单冲突修复/人工切换后端。ZIP普通包有GEMS清单仍走原明确GEMS入口，不宣称ZIP已自动识别OIV。

实际mod版本可来自metadata的非负整数major/minor和可选tag，字段为包内自声明，不是作者/更新真实性证明。包格式version与mod版本、target Five与Enhanced兼容必须分开；只有2.2与Five的声明做了有限字段准入，没有完整OIV schema、GUID/颜色/描述渲染或作者真实包验收。无声明的最小片段沿用有限操作解析，兼容性仍未知。

参考[OpenIV团队2.2规范](https://github.com/OpenIV-Team/OpenIV-PackageFormat/blob/master/specification/versions/2.2.md)：核对add和包头/版本字段，规范还有其它资源命令，GEMS尚未实现它们。只查阅并链接，不复制文档正文/实现，不调用或内置OpenIV程序；不是获得作者模组或商业站点权利。

共享JSON/XML快照按独立普通文件/UTF8、1MiB或4MiB、前后纳秒身份与实际扫描SHA保护；XML另外走64层/50000元素准入。观察到变化拒绝不是OS锁或所有TOCTOU/断电保证。原包和失败工作区不自动修改/删除。

验证npm run test:oiv-plan：新增12项自建真实ZIP/文件与元数据/结构边界，最初7项5失败；定向32/32、核心417/417，编译通过。不是真实容量/内存压力、作者资源、IPC/UI、游戏或最终EXE；原Electron3077阻止未验证解除，本版没有重试/绕过或新UI图。RPF/XML/text/delete、多组件、转换/DLC和游戏助手及完整商业终验继续待完成。
