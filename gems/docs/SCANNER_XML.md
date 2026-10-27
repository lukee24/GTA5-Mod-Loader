# XML扫描准入（0.1.34）

OIV assembly.xml与vehicles.meta使用同一独立准入：UTF8最多4MiB、根算第1层最多64层、最多50000个元素（含自闭合）。先扫描预算，再走原XMLValidator及processEntities=false解析；不改原XML内容。评论/CDATA/处理指令内的伪标签和属性引号里的>不会被当作实际结构，未结束或未知声明拒绝。

这是准入预算，不是通用XML标准认证或模型引用验证。原DTD/实体声明保守拒绝不变。OIV文件原先已有4MiB字节门禁，本轮进一步约束结构，并修正通用函数字符计数。OIV超限整个导入失败；vehicles.meta异常沿用中文解析警告，实际spawnNames为空，不猜名称或宣称兼容。普通文件已准备也不代表DLC注册或游戏加载。

测试npm run test:scanner-xml：新增8项含真实自建ZIP OIV与META，核心385/385；初始最先6项3失败，修复最先6项通过后补2项文件测试。npm run test:scanner-xml-ui为原IPC/真实包/SQLite/批量/重启及主题脚本，但本次原Electron被Windows3077阻止，scanner-xml-ui-current.json明确passed=false，未执行本版UI场景，未绕过或再次启动。所有包是明确隔离夹具，不是作者MOD/游戏/最终EXE证据。

未实现：独立扫描工作线程/实时取消、真实容量内存峰值/所有TOCTOU/断电、XML资源引用/完整安装转换及Enhanced效果。结构预算只限制元素/深度与文本字节，不声称所有系统资源绝对安全。原商业签名、第三方资源许可与网站授权缺口保留。
