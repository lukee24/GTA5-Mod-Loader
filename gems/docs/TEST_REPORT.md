# GEMS 测试报告：当前 0.1.75，保留历史记录

## 0.1.75 RPF文件固定范围快照与预算封存（2026-10-14香港时间）

- rpf-file-snapshot-baseline.tap原3项0通过/3失败：手工构造未加密RPF7二进制实际写盘；FileHandle首次真实read返回时实际同长度修改payload并把mtime恢复2020-01-01，原仍返回original而源为changed!。实际rename原文件/换入同长度新路径，原fd仍返回original而源为replaced。直接公开接口沿父目录junction仍读取，桌面原额外noLinks未改变。不是真实游戏资源或写游戏漏洞实测。
- 新file-snapshot普通无连接路径/父目录身份、lstat/fstat dev/ino/size/mtimeNs/ctimeNs/nlink与固定原范围，64KiB以内循环短读前后核对、两遍实际SHA。limits先完整准入未知/非法/扩大预算拒绝，只收紧默认能力，默认/私有副本冻结；调用者跨await修改原options不污染读取或提取。IO异常保持，finally关闭句柄。
- 新增12项/定向36/36/0跳过（rpf-file-snapshot-current.tap），核心779/779/0跳过（core-0.1.75.tap）。原RPF提取、压缩、嵌套、资源头封装、独立二进制替换/回读和三个转换检测模式以及固定SHA回归保持。正常实际短读完整/请求<=64KiB、第二遍读缓冲差异故障拒绝（未伪称磁盘已损坏）、实际追加/截断保留、失败/EOF句柄关闭与重试、硬链接只读允许/归档副本独立、等待中options变化通过。
- 首次build-0.1.75-initial.log因测试fixture默认Buffer泛型推断TS2345失败；补函数参数显式Buffer类型（无运行逻辑改动）后TS/Vite/main构建通过（build-0.1.75.log，Framer非阻断提示），失败日志保留。不将先前测试通过当编译通过。
- 两遍IO和归档复制有成本，未做512MiB真实资源/内存压力/网络盘或GUI帧率；仅观察变化保护非OS锁/任意ABA、解析结构非游戏加载，不能宣称Legacy转换/加密或DLC注册已支持。
- E盘19:46香港时间只读就绪1.0.1158.16/build25261616，99890851584/99890851584字节，进程未运行。无游戏写入/组件安装/原Electron3077重试绕过，无新依赖/公网/商业许可结论；当前UI/IPC/Enhanced、游戏助手、最终EXE及商业终验未通过。

## 0.1.74 同进程跨数据库对象的游戏目录互斥（2026-10-14香港时间）

- game-directory-exclusion-baseline.tap原3项0通过/3失败，真实Scanner/两个独立SQLite库/Backup/Installer和ini：第一个disable guard明确等待，第二个安装相同字节成功并登记已启用；第一个继续后目标不存在而第二MOD仍已启用。第二库公开恢复/移除MOD记录后的孤立已完成事务恢复也能在另一库文件事务等待中实际删除各自目标。不是静态或假安装。
- game-directory-lease同步完整准入普通无连接根/真实路径/Windows大小写，整批先检查冲突再占用；接入安装、启用（经安装）、公开恢复、启用状态停用卸载和自动恢复。内部回滚沿已有根租约，不嵌套死锁；finally成功异常均释放。已停用卸载只更新库，已移除游戏仍允许。
- 新增11项/相关定向89/89/0跳过（game-directory-exclusion-current.tap）、核心767/767/0跳过（core-0.1.74.tap），构建通过（build-0.1.74.log，Framer非阻断提示）。首次8项/定向86、追加连接/租约边界10项/88均通过，最终补已停用记录卸载后11项/89，未重复无变化失败。零写拒绝用真实数据库完整字节/目标内容确认；释放后真正安装停用卸载、大小写尾斜杠等价、独立根、多根整批先阻止/无部分租约泄漏、原异常内部回滚/重试、坏根/连接拒绝、重复释放不解除新租约通过。
- 仅同进程跨Store互斥，不是跨进程、OS锁、当前GUI多窗口、持久跨库共享所有权或Enhanced实测；不同库顺序操作仍需独立游戏根关联/持久所有权设计。未验证全部路径别名和网络盘。
- E盘19:15香港时间只读就绪，1.0.1158.16/build25261616，下载99890851584/99890851584字节，进程未运行；无游戏写入/组件安装或3077重试绕过。无新依赖/公网/许可结论，当前UI/IPC/游戏助手、DLC/加密RPF/转换、最终EXE/商业终验仍未通过。

## 0.1.73 检查点重复解析优化（2026-10-14香港时间）

- 原2项0通过/2失败见 artifacts/checkpoint-performance-baseline.tap：实际SQLite 1500条/1649125字节，24次SQL读取/24次解析；等价键序空白12次检查/12次解析。是性能基线断言，不是原版本错误删除文件的复现。
- 新增8项独立8/8（checkpoint-performance-isolated.tap）、相关定向81/81（checkpoint-performance-current.tap）、核心756/756/0跳过（core-0.1.73.tap）、TS/Vite/main构建通过（build-0.1.73.log，Framer非阻断提示）。24次真实SQL新读/零解析；等价格式首次完整验证一次，随后零解析，实际字段/目标/哈希/applied变化、坏JSON、超过8MiB和缺行仍拒绝且记录保持。保存单次故障不推进基线/随后重试，明确可选undefined与调用者后续修改安全。既有安装/恢复、容量、最后提交、保存故障与实际子进程中断回归通过。
- 独立同机同一账本24次原readTransaction+完整比较260.27ms，优化62.32ms；只记录观察耗时，不用固定时间门槛/虚构成功率。真实SQL记录/未应用虚拟目标，未创建1500文件或安装大型MOD；不代表GUI帧率、IPC或游戏性能。
- E盘18:45香港时间只读：Steam就绪/build25261616，1.0.1158.16，99890851584/99890851584字节，进程未运行。未启动游戏、未写真实游戏/组件、未重复原Electron3077。当前UI、游戏助手/原生键鼠手柄、DLC/转换/加密RPF/最终发行EXE和商业终验不通过。无新依赖或公网许可结论。

## 0.1.72 已有事务更新容量准入（2026-10-14香港时间）

- transaction-update-initial-failure.log原2项0通过/2失败：实际SQLite存入合法紧凑事务8388607字节（2122未应用虚拟长路径/error填充），原恢复执行中→恢复待处理多6字节，guard调用1次后读取json=null/readable=false，检查点误报事务变化，原合法历史已变不可读。另目标小事务+4条合法已回滚空白历史合计33554428字节，原首次恢复状态保存让guard中完整批次limited=true，最终状态缩小又回到限额内，未提前拒绝。
- 新assertTransactionUpdate在每次检查点保存前调用，既有形状/完整记录/原id准入，不能把更新变新建。以原SQL原文本（含空白）差值计算下一记录单条8MiB/合计32MiB预算；预计max(实际下一JSON字节，去error文本+8192)。旧error替换不再加一份，实际合法大error仍按真实大小；不放宽读取限额或删除历史。
- 新增6项/定向70/70/0跳过（transaction-update-current.log）、核心748/748/0跳过（core-tests-transaction-update-current.log）、构建通过（build-transaction-update-current.log，Framer非阻断提示）。首次修复66/66（transaction-update-first.log）留证，无本轮修复后测试失败；已有安装/恢复检查点、保存故障、真实子进程中断/日志和生命周期回归保持。
- 原两项现在首次guard调用0/明确容量拒绝，原SQLite字节保持，单条readable=true/整批5条仍可读。高文本是有界合法JSON/SQL夹具：不创建2122条虚拟目标、不安装这些模组/资源，没有实体大MOD、系统磁盘满、吞吐/内存压力或当前GUI触发证据。当前普通安装append已有预留，本修复针对已有记录更新和恢复准入。
- 保留足够错误空间、接近8MiB的大记录可真实完成状态恢复/读回已回滚，game目录空且error清除。合计预计含预留恰好32MiB时允许assert和检查点实际保存，新error取代旧4096字符ASCIIerror而不双算；当前表仍可读。下一合法4000字符中文error实际字节更大时明确合计容量拒绝，原库保持，不能低估实际错误。
- 缺失id不能创建、坏下一hash先拒绝/原库保持。容量拒绝后检查点expected未推进，实际原库字节保持、后续健康待处理/error更新可保存并读回。所有操作是实际Store/SQLite，不是假数据库/假成功；数据-only状态测试不当真实游戏验证。
- E只读checked=2026-10-13T21:49:58.662Z（香港10月14日05:49），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；无游戏启动/写入/组件安装，Steam账号自动更新/系统安全策略不变。原Electron3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 无错误空间的历史记录会明确拒绝恢复，需要保留原数据并制定安全归档/维护方案，自动归档未完成；文本预留不是磁盘空间预分配。大历史反复解析/比较的开销、峰值内存/大文件吞吐、取消/准确断电、跨Store同步/ABA/多库同游戏根及全文件库原子仍需验收。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate历史范围不变；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.71 安装本事务检查点（2026-10-14香港时间）

- install-checkpoint-initial-failure.log原3项0通过/3失败：实际Scanner/Backup/SQLite/Installer小ini，在写前guard中修改已存在本事务error/直接删除，或最后guard将当前本事务SQL json改成{bad并flush。旧仍写target、抹审核文本/复活事务/以完成记录覆盖坏JSON，返回MOD已启用；覆盖情况下user original实际变mod content。都是明确受信回调操作当前Store/SQL，非GUI/跨进程数据库攻击或真实游戏。
- 安装初始准备记录成功后复用RecoveryCheckpoint，安装标签；备份返回、guard/目标SHA、applied/完整状态保存、Backup最后await后同步beforePublish和写后核验都核对当前事务。自己成功put才推进；catch先确认最后基线仍一致，才按实际保存清单回滚，记录已变时不盲目恢复未知目标/哈希或保存旧错误。初始检查点JSON规范化且既有形状准入，默认恢复中文标签不变。
- 新增8项/定向74/74/0跳过（install-checkpoint-current.log）、核心742/742/0跳过（core-tests-install-checkpoint-current.log）、构建通过（build-install-checkpoint-current.log，Framer非阻断提示）。首次修复69/69（install-checkpoint-first.log）留证，无本轮修复后测试失败；现有真实子进程中断/日志失败/恢复检查点/guard/输入和生命周期保护通过，不是UI或Enhanced实测。
- 原3项现在发现变化后最新SQL字节保持、新审核文本不覆盖、已删除事务不复活、{bad原文不修复；目标不存在或仍user original、MOD未登记启用。正确备份可能已经保存，不虚称整个准备无写入。实际Backup.put返回后写新审核，安装拒绝、目标未写/SQL保持，正确blob真实内容mod content保留。
- 写入进度中改当前事务error时目标已经mod content；后续完成保存拒绝/MOD为空，最新执行中/applied=true/审核保持。不能说文件未动、完整安装成功或已自动回滚；解除回调后使用最新记录recover，实际目标删除/事务回滚。不会按未知变化记录盲目覆盖资源。
- 最后guard排队微任务改当前记录，实际rename监测确认登记时尚未发布，beforePublish拒绝、published=false，user original/最新SQL字节保持，无启用MOD。省略计划可选trustedRestore时实际初始JSON规范化不误判，正常安装/停用/重新启用/卸载文件与状态正确。
- applied=true标记保存前单次注入Store.put失败，expected未推进；真实账本仍执行中/applied=false，原Error引用保持，按实际清单恢复为已回滚且目标未写/MOD为空；解除故障后重新生成计划真实安装/停用通过。只明确函数故障，非断电/真实磁盘满/提交后数据库损坏。
- E只读checked=2026-10-13T21:13:13.950Z（香港10月14日05:13），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；无游戏启动/文件写入/组件安装，Steam账号/自动更新和系统安全策略未变。原Electron3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 当前main OperationGate/同Store Installer锁串行化写任务，测试直接受信回调不能作GUI交错证据。检查点仅当前Store语义，不自动读外部Store磁盘变化、检测ABA/提供认证或OS锁；部分已写记录变化须核对，正确孤立blob不清理。安装共享所有权其他变化窗口、极限恢复容量/大历史重复解析、内存/大资源吞吐/取消、跨库同游戏根和准确断电还需验收。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate历史范围不变，历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.70 恢复本事务检查点（2026-10-14香港时间）

- recovery-checkpoint-initial-failure.log原3项0通过/3失败：实际Scanner/Backup/SQLite/Installer小ini，guard中改变本事务applied=false/error=新的人工核对记录，旧仍删除target并覆盖新error/报告已回滚；直接Store.remove本事务后旧恢复重新创建记录（recreated=true）；SQL直接把本事务json改成{bad/正常flush，旧catch再put内存图，把坏原文自动改合法恢复待处理。这是受信回调明确操作当前Store/SQL，非当前GUI或外部进程数据库访问/游戏验证。
- 新RecoveryCheckpoint独立捕获最近成功保存语义，读取本事务并深比较；guard、目标SHA、覆盖最终beforePublish/删除guard后和每次自身保存前核对。save规范化JSON/既有事务形状准入，Store.put成功才更新expected；错误处理也先核对，缺失/坏/变化时抛中文错误，不再写旧error或旧完成状态。不是任意坏文档迁移或自动修复工具。
- 新增8项/定向79/79/0跳过（recovery-checkpoint-current.log）、核心734/734/0跳过（core-tests-recovery-checkpoint-current.log）、构建通过（build-recovery-checkpoint-current.log，Framer非阻断提示）。首次修复74/74（recovery-checkpoint-first.log）留证，无本轮修复后测试失败。
- 原3项现在发现变化后保持最新SQLite原字节：applied=false/人工error保持、删除记录不复活、原{bad字节不修复，目标仍mod content。最后覆盖guard修改error时同步beforePublish拒绝，目标仍mod content/新审核记录保持、自有.gems暂存清理；实际目标SHA异步读取中改本事务name同样拒绝，目标和变化后SQL字节保持。
- progress在applied=false已保存后改error，最终完成状态提交拒绝、最新恢复待处理/applied=false/人工审核原文保持。但目标实际已删除，原MOD仍已启用，不能说所有文件没动或完整恢复成功。解除回调后用最新记录recover，状态校正为已停用；没有自动撤销新审核记录或伪造全操作原子。
- 自己保存applied=false时单次注入Store.put失败，expected不推进；当前账本仍前一成功标记，捕获恢复错误后再次合法保存实际applied=false/待处理，目标已经恢复删除、result.error有原保存错误；后续recover完成、MOD停用。只明确函数故障，非真实磁盘满/断电/提交后损坏。
- 仅反转合法记录JSON键序，语义相同所以不误拒绝；正常新增/覆盖真实恢复（原输入保持已完成）、recover校正、再次启用/卸载和原user original或缺失目标状态正确。JSON中undefined规范化与真实Store串行化一致；语义比较不声称可以发现变化后又恢复原值的ABA。
- E只读checked=2026-10-13T20:43:24.621Z（香港10月14日04:43），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；无游戏启动/写入/组件安装、Steam账号自动更新或安全策略改变。原Electron3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 同Store Installer与main OperationGate已串行化写任务，本轮变更由直接受信回调登记，不证明现有GUI可以交错。本检查点只看当前Store内存，不刷新其他Store写磁盘；不同库同游戏根、安装执行阶段事务变化、极限历史恢复文本增长和大记录的完整比较/重复解析/内存压力、取消/准确断电仍需审查。无新依赖/公网/作者资源/商业授权，43项生产许可和开发链8moderate历史范围不变；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.69 恢复最后提交时的共享依赖（2026-10-14香港时间）

- restore-dependencies-initial-failure.log原4项0通过/4失败：真实Scanner/Backup/SQLite/Installer隔离小ini，最后guard或目标SHA读取后，受信回调直接登记合法形状的后续已完成+已启用MOD或执行中/applied=true事务。原恢复删除新增目标（targetExists=false）、错误还原覆盖目标（target=user original），却报已回滚并留下新MOD已启用/依赖applied标记。这些新记录是明确持久化夹具，不是另一个实际MOD包、另一Installer成功安装、游戏对象或当前GUI攻击证据。
- 提取assertRestoreDependencies保持原后续事务顺序/同游戏同目标/启用MOD规则，早期与SHA读取后重复准入；删除最后guard返回后同步复核。覆盖调用Backup.restore可选第六参数beforePublish，在最后await之后同步检查依赖，之后原暂存/目标身份与链接封印再rename；非法类型在工作前拒绝，钩子必须返回undefined，Promise拒绝并处理其拒绝事件。原前五参数和其他调用兼容。
- 初次普通修复59/59（restore-dependencies-first.log），扩展8项时63/63。额外微任务用例在原async回调await guard/复核后排队新的共享登记，旧检查结束到Backup继续提交间仍错误还原（单项1/1失败，restore-dependencies-microtask-initial-failure.log）；所以只在async回调里复核不足，增加真正最后await后的同步钩子。
- 首次同步钩子接入直接转发guard，改变了此前async适配的微任务次序，旧夹具的双层排队登记落在提交后，82项81通过/1失败（restore-dependencies-callback-order-failure.log）。保留原async guard适配顺序，最终夹具实际监测目标rename：publishedAtRegistration=false且published=false，明确共享登记发生在物理提交之前被拒绝；没有把提交后新登记冒充提交前窗口。
- 最终新增11项/定向82/82/0跳过（restore-dependencies-current.log）、核心726/726/0跳过（core-tests-restore-dependencies-current.log）、构建通过（build-restore-dependencies-current.log，Framer非阻断提示）。此前已有实际子进程中断/文件暂存/哈希/生命周期/输入/互斥/metadata回归保持；不是当前UI、GTA进程或硬件断电实测。
- 原4项现在恢复待处理/明确共享或后续未完成错误、实际mod content保持、旧及新applied=true保持；覆盖拒绝后自有.gems暂存清理，未把文件保持说成已回滚。新共享所有者沿真实disable停用，其before/after相同所以资源仍mod content，再recover原事务正确删除或还原user original，双方记录已回滚/模组停用而不误删记录。
- 后续pending夹具先由recover按顺序处理，随后早期事务恢复，真实文件还原/原MOD停用、重复recover空报告。最后guard登记另一游戏目录的同名资源或同游戏无关目标，不误阻原恢复，另一目标实际字节、事务状态与启用记录保持。
- beforePublish中实际改目标为user latest，之后目标身份封印拒绝提交、最新字节保持/自有暂存清理；非法钩子类型不调用异步guard，Promise.reject同步检查明确拒绝并处理异步拒绝，target仍mod content/SQLite原字节保持，没有声称可以撤销回调副作用或执行不可信JS。
- E只读checked=2026-10-13T20:10:24.692Z（香港10月14日04:10），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。没有游戏启动/写入/组件安装、Steam账号自动更新或安全策略变化；原Electron3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 当前Store内存中的关系复核不提供多Store磁盘同步、恶意本地库认证、当前事务跨await身份保护或OS锁/全环境原子；重复有界全批次解析的大历史/大MOD开销、吞吐/取消/准确断电仍需独立验收。main OperationGate/同Store Installer锁已有串行化，因此未证明当前GUI能并行新增所有权。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.68 MOD生命周期提交与元数据保留（2026-10-14香港时间）

- mod-transition-initial-failure.log原3项0通过/3失败：实际Scanner/Backup/SQLite/Installer隔离目录，mods/handling.meta为小合法XML，扫描规则实际分类车辆。停用guard、重新启用真正写入progress、自动恢复guard中按现有readMod/assertModWrite/put保存新品牌/favorite=true，旧最终生命周期put都回写旧品牌/favorite=false。没有实际车辆模型或游戏效果测试。
- 新mod-transition使用isDeepStrictEqual同步比较去除metadata后的完整MOD；只允许metadata不同，品牌/收藏/删除采用最新已存值，生命周期/关联/日期/占用/报告不同明确中文拒绝覆盖。下一记录assertModWrite含实际全批次与写预算，再put并返回；安装首次await前捕获previousMod，停用/卸载和recover状态校正共用提交器。没有更改metadata编辑器、签名认证、资源转换或游戏接口。
- 新增8项/定向66/66/0跳过（mod-transition-current.log）、核心715/715/0跳过（core-tests-mod-transition-current.log）、构建通过（build-mod-transition-current.log，Framer非阻断提示）。首次修复61/61（mod-transition-first.log）留证。
- 首次扩展66项65通过/1失败（mod-transition-reopen-fixture-failure.log）：测试未关闭原Store，就用另一Store写相同SQLite，最后清理调用原Store.close，其已有磁盘并发门禁正确拒绝保存旧内存。明确修正夹具为先正常close原实例再重开，未放宽生产数据库校验/跨Store写保护；最后66/66。
- 原3项现在实际已存新metadata在结果/库保持、文件真实停用/写入/恢复正确。明确metadata删除或只留favorite=false不复活旧品牌/收藏。同步提交器在status/transactionId/bytes/installed/report.name五种合法形状变化时拒绝，当前盘字节保持；该形状准入不是证明新事务关联有完整真实所有权。
- 重新启用写入progress改变旧MOD installed及metadata，最终提交明确拒绝覆盖、新文件真实回滚/新事务已回滚，最新旧记录日期/metadata保持；解除回调后以最新记录重新启用/停用成功。坏最新metadata（favorite字符串）或下一记录负bytes直接提交器拒绝，原库/文件与输入状态保持。
- 正常停用时新品牌收藏已实际保存，关闭原Store再重开SQLite读回已停用/最新metadata；在重开实例真实启用/卸载、文件存在/删除与最终状态已卸载/metadata保持均通过。不是只检查内存对象，也不声称跨实例同时写是安全。
- 源检查main OperationGate.enter会拒绝已有任务；setVehicleMeta和文件命令位于相同gate，因此本轮未证明现有GUI可以交错。原漏洞/修复范围为直接Core受信回调，当前Electron UI/IPC未运行，不能将这些隔离回调当renderer攻击或真实游戏线程。
- E只读checked=2026-10-13T19:41:03.346Z（香港10月14日03:41），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；无启动/游戏写入/组件安装/Steam账号自动更新或安全策略变化。原3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 最后MOD提交比较/合并不是OS锁、前段操作权限或全库文件原子，若停用文件已还原但MOD提交因生命周期变更拒绝，应核对已回滚事务/当前MOD，不伪称完整停用。完整输入预算、跨await事务/所有权、多库共游戏目录、大MOD吞吐/取消/准确断电还需独立审查。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate历史范围不变；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.67 同Store文件事务互斥（2026-10-14香港时间）

- installer-exclusion-initial-failure.log原3项0通过/3失败：真实扫描/备份/SQLite/安装后，用明确Promise闸门持有exclusive等待，公开restoreTransaction仍返回已回滚并删除原安装文件（busy=true/targetExists=false）。在真实disable第一guard等待时同Store另一Installer恢复同一事务并删除目标；另一实例还可在已有exclusive等待期间真正安装第二MOD，已启用/secondTargetExists=true。第一/第三闸门本身不写文件，第二是实际停用调用；不称真实线程/游戏进程或当前GUI重入证明。
- 新activeStores WeakSet绑定Store对象；exclusive同时查实例busy和Store锁，在fn前同步获取，finally成功或异常均释放。公开restoreTransaction沿exclusive，私有restoreWithinTransaction仅内部已持锁的安装失败/disable/recover调用，不重复获取导致正常回滚被拒绝或等待死锁。0.1.66持久清单绑定、私有返回/原输入不回写和已有文件/哈希/所有权/最后守卫保持。
- 新增8项/最终定向97/97/0跳过（installer-exclusion-current.log），核心707/707/0跳过（core-tests-installer-exclusion-current.log），构建通过（build-installer-exclusion-current.log，Framer非阻断提示）。首次修复92/92日志installer-exclusion-first.log保留，无本轮修复后生产测试失败；最终文档前中间源码只给既有实际CLI附件回归使用。
- 原3项现第二操作明确中文拒绝，原文件与SQLite原字节保持，释放后原停用可完成。真实公开恢复guard等待时其他实例recover/disable/uninstall三个入口零guard调用/库不改/目标保持；释放后实际目标删除、busy两实例false，另一recover校正MOD已停用。公开恢复本身仍只修改事务/文件，不虚称已自动改MOD状态。
- 进度回调启动另一个recover的Promise被明确拒绝并有处理，原恢复完成/无死锁，之后正常recover校正MOD。真实重新启用进度抛最初Error后，内部回滚在原锁内实际删除新文件、记录已回滚/原MOD仍停用，最初Error引用保持；锁释放，另一Installer能启用/卸载并真实验证文件与MOD状态。
- 空恢复输入准入拒绝及exclusive明确Error都保持原库、finally释放，另一实例正常停用；另一独立Store且独立game目录事务不被全局误阻，原持锁目录保持。未测试不同Store共同写同一库或游戏根为安全，不将单Store互斥扩大成OS/跨进程锁或全账本原子。
- E只读checked=2026-10-13T19:08:50.310Z（香港10月14日03:08），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。没有启动/写入真实游戏、安装组件、更改Steam账号/自动更新/系统安全策略。原Electron3077无解除证据，不重试/改名/换父进程/绕过；当前UI/IPC/Enhanced/助手/最终EXE未验收。
- 同进程同Store范围明确，完整输入图预算/跨等待账本变化/多库共用游戏根/准确断电、大MOD吞吐和取消仍需独立验收。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.66 恢复请求绑定真实持久化清单（2026-10-14香港时间）

- recovery-input-initial-failure.log原4项0通过/4失败：真实Scanner、Backup、SQLite和隔离game目录，合法身份但换changes为无归属mods/user.ini及实际SHA后旧恢复删除用户文件；覆盖事务before改null，原目标删除而未还原user original；state改恢复待处理/applied=false让真实installed mod保持却报告已回滚。guard回调换原request目标/hash也实际删除无归属文件、原安装文件留存。非当前GUI攻击/E盘损坏/真正运行游戏；无第三方二进制执行。
- 新recovery-input同步复制并完整形状检查，全部身份/状态/error和changes长度/顺序/target/before/after/applied比对真实读取账本，不匹配在guard和首次put之前拒绝。恢复仅用持久化私有图，返回Transaction不改请求；install catch重读实际事务，不把保存失败后的内存增量当已保存权限；recover接收返回结果校正MOD和日志。原源/目标/所有权/最后guard/路径身份核验保持。
- 首次定向39项37通过/2失败（recovery-input-first.log）：两个既有commit-guard用例仍断言原输入被改的旧契约。明确调整为返回result、同时核对真实库恢复待处理、原tx保持已完成；保留目标用户新字节/运行中不删除等原保护断言。不是放宽生产门禁或掩盖文件失败。
- 最终新增9项/定向89/89/0跳过（recovery-input-current.log），核心699/699/0跳过（core-tests-recovery-input-current.log），构建通过（build-recovery-input-current.log，Framer非阻断提示）。覆盖事务读取/准入、日志失败、生命周期、实际Node子进程中断既有回归；子进程不是Electron/Enhanced实测。
- 清单增删/哈希/状态/错误6种明确变更全在guard零调用/原库原字节保持条件下拒绝；冻结请求实际还原user original且原对象保持，返回/库为已回滚，旧请求再次使用不写库并明确拒绝，重新读已回滚记录幂等。guard/进度期间真实修改原输入id/根/状态/清单/error，实际只恢复原目标/库原id，无归属用户文件保持；不可复制输入不执行附带函数/零写。
- 两处事务put单次故障分别在完整changes追加和applied标记提交前注入，真实原库不含尚未保存增量；安装以最初Error引用拒绝、依实际保存记录回滚、之前停用MOD保持，解除故障后重新启用/停用实际内容正确。此是明确函数故障，非物理断电/数据库提交后损坏或整个文件与库原子验收。
- E只读checked=2026-10-13T18:43:39.247Z（香港10月14日02:43），record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；未启动/改游戏文件/安装组件或改变Steam自动更新/安全策略。main无任意事务恢复IPC，本轮直接Core API证据不宣称GUI授权突破。
- 私有复制不保护恶意本地库篡改，不锁物理文件；完整图预算/复杂输入、跨等待账本语义改变、多实例或直接API并发仍需独立审查。原Electron3077未解除，不重试/改名/换父进程/绕过；当前UI/IPC/Enhanced/助手/最终EXE未验收。无新依赖/公网/作者资源/商业授权，43项生产许可与开发链8moderate历史范围不变，历史助手22528字节NotSigned，source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。

## 0.1.65 安装输入独立图与审批实际清单（2026-10-14香港时间）

- install-input-initial-failure.log原5项0通过/5失败：真实Scanner/Backup/SQLite/Installer临时目录，overwrite字符串false被当truthy，原用户ini实际换为mod new/已启用；binary字符串false允许scripts目录文本ini；plan.conflicts=[]但files.beforeHash非null仍无确认覆盖。直接guard回调改原plan.gamePath后旧事务/game文件写到另一个未被原计划选定目录；guard中改原plan/report目标为根UNEXECUTED_FIXTURE.asi/binary=true，初始批准binary=false仍写该根文件/已启用。ASI内容是明确ini文本、未加载/执行，guard是隔离noop/修改回调，不算真实游戏环境审批或E盘受损。
- 新packages/installer/install-input.ts在exclusive内任何await/read/write之前structuredClone整体plan/report/approved；不能复制则中文拒绝，审批对象须且仅两自身布尔overwrite/binary，不接受truthy替代。后续参数改为该独立图，不改调用者；覆盖判断增加实际files.beforeHash非null，原高风险路径/扩展名、来源/目标SHA/字节、事务和MOD准入与末段guard保持。没有宣称此helper本身验证全计划 schema或认证人类审批。
- 新增9项/定向97/97（install-input-current.log，含core/生命周期/提交guard/大小/事务写/MOD准入）、核心690/690/0跳过（core-tests-install-input-current.log）、构建通过（build-install-input-current.log，Framer非阻断提示），首次修复32/32留证，无生产测试失败。新版本中间源码用于现有实际CLI附件读取，最终文档后再次归档/CRC/源SHA。
- 原字符串/空摘要3项现在拒绝，用户文件/SQLite原字节/空blob和无事务保持；实际两个输入变更测试仍执行入口原目录/低风险mods/a.ini，未在另目录或根ASI写，MOD记录对应原报告。不是拒绝外部改原对象，而是该变化不影响已取得的操作输入。
- null/数组/空/缺字段/数字/null值/truthy字符串/unknown审批，在guard前拒绝、guard计数0、盘库/目标/备份不变；明确真实overwrite=true后安装写mod new，停用还原user original。Caller guard中改原report.id/name及审批overwrite=false，记录仍入口id/name/原真实批准，原调用者保持后来改值，没有被写回。
- 实际写入progress回调把原report.hash改为invalid-caller-hash，安装返回/数据库readMod仍原合法SHA，不把坏报告存成后续不可读MOD；停用删除本次新增目标正常。不可复制附带函数值的报告前置拒绝/guard和函数体执行均0/库原字节不变，健康报告后可重试安装/停用。该函数值是显式JS边界，不是执行MOD脚本；不能由此称Getter或任意不可信代码不会被调用。
- 检查desktop/main源：rememberPlan已有structuredClone私有缓存，install仅从缓存id取plan/report并沿原确认对话；本轮未改该段或请求信任renderer提供plan。直接API malformed/mutating夹具不能当当前GUI实际绕过证据，当前UI/IPC没有运行。Bool确认不提供认证/人类授权证明，物理源/文件/部署仍按原实际校验而非clone担保。
- 尚未增加复制前全plan/report字节/深度预算、大图/并发压力/复制峰值/取消与实际UI吞吐验收。structuredClone非JS沙箱/OS文件锁，不保证全数据同时一致点；恢复/其他输入生命周期未在本轮全部覆盖，不能当全站MOD自动化/游戏加载验收。
- 10月14日02:13香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、版本1.0.1158.16/running=false，checked=2026-10-13T18:13:49.831Z。未启动/写入真实游戏/安装组件或改变Steam账号自动更新/安全策略。原Electron3077不重试/改名/换父进程/绕过，当前UI/IPC/Enhanced/助手/最终EXE未验收；无新依赖/作者资源/公网/商业许可，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.64 handling副本写入核验与清理所有权（2026-10-14香港时间）

- handling-write-initial-failure.log原3项0通过/3失败：真实隔离saveHandlingCopy在handling.meta的fsync边界改为corrupted handling，旧函数成功返回预期afterSha256但实际副本已坏；report.json打开wx前移走original.meta并换入foreign original/抛Error，旧cleanup按名称删除foreign（foreignExists=false）；注入报告失败再注入unlink权限错误，旧函数抛清理错误而非最初报告错误。actual文件/故障，未声称真实游戏/用户原配置已损坏。
- 新saveHandlingCopy在原UUID普通父目录捕获每个自有文件inode/长度/期望SHA，wx防覆盖，目录再次复核后才写/刷新/关闭，再实际固定双SHA与身份验证。三个文件写完重新全量核验并同步复查所有封印，防较早文件在末段报告读取中变更。core/atomic-write的原verify改名导出verifyOwnedFile供复用；atomicWrite调用同一实现，既有整体政策不改。新增文件仍原文/handling/report三项独立副本，源码输入不写。
- 新增7项/定向48/48（handling-write-current.log，含复制、历史、编辑/属性定位和atomicWrite）、核心681/681/0跳过（core-tests-handling-write-current.log）、构建通过（build-handling-write-current.log）。首次修复29/29/扩展33/33日志保留，无生产测试失败；新版本中间源码只供实际CLI附件读取，最终文档后重新归档/CRC/源SHA。
- 原3项现在损坏拒绝/不返回报告，外部换入original.meta和移走原文件保持，清理失败不遮盖最初Error引用；每个用例物理input.meta原XML保持。清理只同原目录/本次inode/普通独立文件，unknown/多链接/目录外移和删除失败保留，没有伪称全部清理完成。
- 最终report.json第二次实际读取fd关闭后真改较早original.meta，整体同步封印拒绝确认保存成功；刷新original.meta fd关闭后真实目录换址或junction，新目录的foreign original/handling与外移原XML都保持。明确路径/IO故障夹具，非系统安全策略绕过或游戏启动。
- 正常两个独立参数副本实际original/output SHA等于各报告、三文件nlink1，HandlingHistory.verify均静态通过/gameWrites=false，原输入保持。第二次报告失败不改变之前完成副本任一原字节；失败目录出现在历史时issue存在/model=null，只有之前成功副本有效，不捏造未完成配置。历史核验不是作者真实性/游戏兼容、自动应用或精确马力/极速证明。
- 仍逐文件直接写新UUID目录、非组事务/目录原子或并发观察者完全隐藏；新增准确崩溃/断电和持久性试验未做。封印非OS锁/最后毫秒竞态证明，测试小XML和旧历史1001项边界不当大资源/批量/吞吐压力，当前UI/IPC/参数真实游戏效果未验收。
- 10月14日01:41香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，checked=2026-10-13T17:41:44.727Z。无真实游戏启动/文件写入/组件安装、Steam账号自动更新或安全策略改变；原Electron3077不重试/改名/换父进程/绕过。本版UI/IPC/Enhanced/最终EXE未验收，无新依赖/作者资源/公网/商业许可，43项生产许可和开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.63 快照计划只读与源路径绑定（2026-10-14香港时间）

- snapshot-plan-initial-failure.log原3项0通过/3失败：真实Backup.snapshot直接传预检回调，把plan.files[0].absolute从A换为同游戏目录B，旧成功record.path=mods/a.ini、实际blob为different B；把plan.gamePath换为另一隔离目录，旧record游戏根变了但blob仍original A；改plan.id为changed-id，旧成功返回id但对应id侧车文件不存在（仍原UUID名称）。actual临时文件/JSON/原字节证据，不声称当前桌面容量回调会改计划、已触发真实E盘错误恢复或加载第三方插件。
- SnapshotPlan字段readonly/files readonly元素，planSnapshot返回根对象、数组和条目全部Object.freeze，绝对源字段只读取一次，再用同一值核对并登记。先完成全清单/预算后封存，不能让回调改变id/gamePath/source/relative/文件数/预算；beforeWrite非函数中文拒绝，TypeError转中文预检失败并附cause，其他原Error仍保持引用，复制使用plan.gamePath。SnapshotRecord输出没有改为冻结，未把全部库/数据接口一并宣称不可改。
- 新增8项/定向63/63（snapshot-plan-current.log，含快照准入/大小、公共atomicWrite、blob和生命周期）、核心674/674/0跳过（core-tests-snapshot-plan-current.log）、构建通过（build-snapshot-plan-current.log，Framer非阻断提示），首次修复31/31留证。没有本轮生产测试失败；类型变化后的故意违规回调测试用any做运行时越界，不放宽生产类型。新版本中间源码用于现有实际CLI附件读取，最终文档后重归档/CRC/源SHA。
- 旧3项变更现在预检拒绝，blob空/侧车目录未创建，原A/B字节不变。根/files/条目实际Object.isFrozen，push、estimatedBytes、relative改动抛错；正常计划估计JSON预算与实际record长度一致，blob内容original A。
- async回调中实际改原input源/relative并push第二项，等待setImmediate后私有冻结计划仍仅原A，最终record.path=mods/a.ini/hash为实际A。async预检明确原Error拒绝则无blob/JSON，故障解除同原清单可健康捕获。此输入对象变化是显式direct API测试，不是网络请求/界面线程或真实游戏进程切换。
- Getter源字段首次A、后来返回B的明确JS对象夹具，实际读取一次/同A匹配与登记，最终blob实际SHA对应A。该用例是源码边界，不表示安装不可信代码/运行压缩包脚本；普通JSON不携带Getter。
- 真实Store/SQLite容量回调assertSnapshotCapacity只读执行一次，可读冻结条目；Backup.snapshot→saveSnapshot/readSnapshot→另一Store.open重开，id/来源条目/实际blob关联保持且id侧车JSON存在。源/原文件保持，不是假数据库或模拟安装结果；只隔离小ini，不涉及Enhanced/UI或实体大资源。
- 计划不可变非OS源文件锁/全环境同时一致点，物理源在后续每个put仍按实际读取政策；不撤销回调副作用，不冻结输出record/所有库。侧车与库仍不是一事务，维护正确孤立blob/断电/大文件/容量/取消/超时未因此通过。
- 10月14日01:10香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，checked=2026-10-13T17:10:06.541Z。无真实游戏启动/写入/组件安装、Steam账户自动更新或安全策略变化；原Electron3077不重试/改名/换父进程/绕过。本版UI/IPC/Enhanced/助手/最终EXE未验收，无新依赖/作者资源/公网/商业许可，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.62 公共同步文件写入核验与所有权（2026-10-14香港时间）

- atomic-write-initial-failure.log原3项0通过/3失败：真实隔离atomicWrite在fsync边界改坏tmp，旧函数返回成功并把target改为corrupted temporary；beforeCommit中真实用户改写target，旧rename覆盖为verified new data；实际关闭fd后tmp移走/新foreign temporary/抛原错误，旧finally按名字删foreign（foreignExists=false）。实际文件/明确函数故障，未声称真实用户数据库或E盘损坏。
- 提取packages/core/atomic-write.ts，security仍公开atomicWrite原接口。输入类型/同步回调检查、相对路径resolve保持；payload先取期望SHA/bytes（20GiB规则），原目标/普通全父目录准入，创建缺失父目录后原已存目录与原leaf须不变。独立wx暂存捕获自有inode，写入/fsync/关闭后固定fd完整两遍实际SHA/大小/纳秒身份核验，原目标复核后调用同步条件，之后同步复查tmp/target再rename，提交后另核验真实内容。只清理同普通目录的自有独立inode，替换/外移/链接/失败保留。
- 首次定向33项31通过/2失败（atomic-write-first.log）：数据库fsync期间外部改写现在更早在atomic目标检查拒绝，原仅“数据库更改”文案不匹配，精准增加“提交前目标发生变化”；另一旧fs.readSync仅按64KiB/第二调用注入，新tmp核验也用该缓冲，注入点已偏移。修改测试以实际SQLite dev/ino筛选读fd后在第二库读取注入，仍必须原数据库错误且保留外部字节；没有放宽生产门禁或掩盖目标损坏。
- 新增11项最终定向91/91（atomic-write-current.log，含SQLite准入/并发、快照、生命周期/真实子进程中断/core）、核心666/666/0跳过（core-tests-atomic-write-current.log）、构建通过（build-atomic-write-current.log，Framer非阻断提示）。扩展39/39留证；新版本中间源码给现有实际CLI附件读取，最终文档后重归档/CRC/源SHA。
- 字符串中文/Uint8Array/空内容、新父目录和相对路径实际写后字节一致/nlink1；回调真改坏tmp阻止提交，原同步拒绝Error引用保持、之后可重试。Promise.reject回调明确拒绝、不提交，拒绝被处理不产生无主异步异常，原目标保持；不把已执行回调可能副作用当可撤销。
- 每次fs.readSync实际最多3字节仍完整核验；提前EOF拒绝、句柄真实关闭（fstat EBADF）、原内容保持。回调目录真实换址并建立新普通目录，新目标/同名foreign tmp、外移旧目标/原tmp均保持。并未用名称猜清理所有权。
- 真实SQLite store.put：在暂存fsync真写not SQLite，提交拒绝、磁盘原库完整/内存仍old；解除故障再次put为new，另一真实Store.open读回new。真实Backup.snapshot记录JSON tmp改坏拒绝、不返回record、无快照JSON，源ini不变，已正确保存blob保留/实际SHA匹配；解除故障后同blob复用且JSON记录读回一致。不是垃圾清理/全快照数据库原子或真实游戏验证。
- 原子rename完成后外部实际改坏目标，返回“已提交但校验失败”/published=true，坏对象保留且无原tmp；不声称旧文件没写、不擅自回滚外部内容。20GiB仅参数上限，没有实体容量/硬件压力/大SQLite或RPF导出峰值/同步UI性能、取消/超时验收。单文件观察核验非OS锁/断电/全文件和库一致性。
- 10月14日00:42香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、版本1.0.1158.16/running=false，checked=2026-10-13T16:42:54.581Z。未启动/写入真实游戏/安装组件或改变Steam账号、自动更新、安全策略。原Electron3077无解除证据，不重试/改名/换父进程/绕过。本版UI/IPC/Enhanced/助手/最终EXE未验收，无新依赖/作者资源/公网/商业许可，43项生产许可和开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.61 源码工具参数及版本文件准入（2026-10-14香港时间）

- source-input-initial-failure.log原2项0通过/2失败：真实本工程source-archive/source-output/source-policy复制至隔离目录，以Node子进程实际运行。package.version='../../../outside/user'时，旧path.join把输出定位至outside/user-source.zip，实际已有用户字节被覆盖、exit0/externalChanged=true；--outpt敏感占位值被忽略、旧归档被改且exit0。明确局部开发工具配置/命令参数缺陷，不是假定网络远程输入或真实用户工程/E盘损坏。
- 新source-input.mjs共享parseSourceOptions/readSourceVersion：参数数组最多16/每值32768/控制字符与空值拒绝，仅无参数或独立help，不回显异常值；两CLI在读取项目/动态加载yazl/yauzl前完成。普通package.json路径拒绝链接/连接/nlink!=1，64KiB首读预算，固定fd完整短读、两次实际SHA/纳秒身份复核并关闭后再查；严格UTF8和JSON、安全80字符版本规则后才拼输出/核验路径。JSON/UTF8解析错误不附原文cause，其他IO原因保留于中文外层错误；项目原文件不修复。
- 新增10项/定向60/60（source-input-current.log，含source-output/发行输出/参数/清单/签名），核心655/655/0跳过（core-tests-source-input-current.log）、构建通过（build-source-input-current.log）。最初14/14及扩展22/22保留日志，无生产测试失败；版本升级后中间源码包只供现有实际CLI附件读取，最终文档后再归档/CRC/源SHA。
- 实际两CLI在坏JSON且没有node_modules的隔离工程中--help中文退出0，不读取/改项目或旧归档。重复help/混合help+未知/未知带值/多余参数/17项都先给参数错误，既不被缺依赖抢先击穿，也不回显secret-placeholder（只是非真实凭据字符串）。verify入口失败早于打开ZIP/生成证据；正常当前完整源码核验由最终命令独立运行。
- 非安全版本null/数字/空/缺段/斜线/穿越/控制字符/空格/81字符/数组对象，两CLI都在缺依赖前中文拒绝，外部目录/旧归档保持。JSON损坏/null/数组/坏UTF8/实际65537字节文件拒绝且原字节不自动写回；含敏感占位值的坏JSON实际子进程stderr不显示该值。未称所有合法npm SemVer支持，+build仍不在安全版本规则。
- 实际正常版本0.0.1/1.2.3-beta.1/10.20.30-RC.1以及其他正常项目元数据可读、返回原标识。实际fs.readSync每次3字节短读仍完整双读；读取中真实同长度改1.2.3→1.2.4并utimes，拒绝且保留外部新文本。真实项目硬链接/根目录junction拒绝、外部项目字节保持；参数纯规则结果冻结，类型/长度/控制字符预算明确。不是进程间压力/断电或游戏输入验证。
- 输出ZIP安全模块保持0.1.60政策；本轮新增源参数检查不让ZIP核验输出JSON/其他发行记录因此自动原子或安全。没有OS锁/全输入同时快照或关闭后长期不变保证，实际构建/UI/游戏仍按各自证据测试。
- 10月14日00:09香港时间实际E只读record=present/ready=true/build25261616、99890851584/99890851584字节、版本1.0.1158.16/running=false，checked=2026-10-13T16:09:50.865Z。无真实游戏启动/写入/组件安装、Steam账号/自动更新或系统安全策略变化，原Electron3077不重试/改名/换父进程/绕过。本版UI/IPC/Enhanced/最终EXE未验收，无新依赖/作者资源/公网/商业许可，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.60 源码归档输出与所有权保护（2026-10-13）

- source-output-initial-failure.log原2项0通过/2失败：隔离复制本工程真实source-archive/source-policy脚本，以node子进程运行，无Electron；既有ZIP路径硬链接到外部用户字节，旧createWriteStream截断并改写外部文件且exit0/externalChanged=true。release变为junction时旧CLI在outside生成GEMS-0.0.1-source.zip且exit0。actual临时目录/真实Windows硬链接与连接，并非真实发行用户文件损坏。
- 新scripts/source-output.mjs完成路径/普通目录父身份和现有目标独立普通文件预检（200MiB内），wx随机暂存，64KiB有界完整双SHA读取/纳秒身份封印；Transform按实际输出字节限200MiB且实时SHA，pipeline明确拥有写流关闭，刷新句柄独立打开/关闭，不混用destroy/manual close。流结束后暂存SHA/字节与产出一致、fsync后再复核，旧目标完整复核后同步tmp/target封印，再rename和实际提交后SHA。source-archive接入，源/ZIP结构核验仍另由verify-source执行。
- 新增12项定向50/50（source-output-current.log，包括发行输出/参数/清单/签名），核心645/645/0跳过（core-tests-source-output-current.log）、构建通过（build-source-output-current.log）；最初修复2/2和扩展9/9保留日志，没有生产测试失败。版本升级中间源码包用于现有实际CLI读取，最终文档后重新归档/CRC/源SHA/清单。
- 实际CLI首次和重复普通输出生成可读ZIP，yauzl读取到真实docs/proof.md和新脚本，旧源码字节保持、输出独立nlink1/无tmp。隔离子项目通过node_modules连接复用开发依赖，连接被source-policy排除，不是打包依赖/运行GEMS/作者MOD资源。
- 实际流yield部分后抛原Error，已有输出保持、cause引用保留、published=false、自有tmp清理；fsync时真写坏tmp，旧归档完整；流中目标新建/改写都保留用户新字节并拒绝。刷新open前将tmp移走并换foreign temporary/抛错，外部tmp与外移原数据都保持。最终目标读取fd关闭后真实用户改写，末段封印捕获，不覆盖。
- rename注入原Error，旧字节不变、tmp清理，解除故障后实际payload字节/SHA与返回相符。此直接helperpayload为明确测试数据，不作为有效ZIP/MOD；实际CLI另验证ZIP结构。刷新fd关闭后真实目录换址或junction，外部同名归档/tmp与外移旧归档/原tmp保持，不依据文件名误删。
- 实际流51个4MiB复用Buffer（输入204MiB）在第51块拒绝，最多前200MiB暂存，旧输出保持且tmp清理。是实际流/临时文件IO、恒定输入Buffer复用，不是完整204MiB源码ZIP、fsync持久容量/磁盘耗尽或物理压力。已有超200MiB在打开前拒绝使用明确BigInt元数据代理，未制造实体超限旧文件。
- 单文件rename不保证全发行配对/硬件断电/目录持久性或OS最后竞态；提交后外部破坏可检测失败但不自动回滚，unknown/多链接/外移暂存保持需维护。源码输入一致时点、其他输出/版本/参数审查仍列待办，不把本轮当全部发行路径/Windows签名或最终安装通过。
- 23:40香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。无真实游戏启动/写入/组件安装、Steam账号或自动更新/安全策略变化，原Electron3077无解除证据，不重试/改名/换父进程/绕过。本版UI/IPC/游戏/最终EXE未验收。无新依赖/作者资源/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围，历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.59 快照恢复报告实际长度/SHA配对（2026-10-13）

- snapshot-size-initial-failure.log原2项0通过/2失败：真实隔离blob先是1字节x或37字节损坏内容，在hash首个bigint lstat边界外部修复为原17字节verified snapshot。旧独立stat已取1/37，随后SHA正确并返回报告却仍标size1/37。这是明确外部修复夹具，不是SHA碰撞、有效源任意增长仍得到旧hash或程序自动修复。当前Installer0.1.55门禁会拒绝错长度，未证实可通过当前桌面审批安装坏内容。
- snapshotReport移除独立stat/旧hashFile组合，调用inspectFileHash并使用其实际SHA/bytes，普通文件/路径/20GiB/固定读取和变化规则沿用现有模块，不重复放宽。每个blobSHA仍必须与快照已存哈希一致。中文失败保留原cause，不把缺失/失败当可恢复；函数不修改游戏/数据库或备份。
- 新增6项、定向60/60（snapshot-size-current.log，含快照准入/长度/备份blob/生命周期/Backup）、核心633/633/0跳过（core-tests-snapshot-size-current.log）、构建通过（build-snapshot-size-current.log，Framer提示非阻断）。首次定向28项27通过/1失败（snapshot-size-first.log）：集成夹具backup在Store.root外，Installer正确以“文件超出允许目录”拒绝；将夹具放到data/backup与生产位置一致，坏报告不写库断言改查gems.sqlite而非该已创建数据目录，生产准入未放宽。
- 两个修复前长度边界最终返回size17与实际源一致，SHA仍实际读取一致，游戏源ini始终未改；实际read回调中append或remove备份，两者明确拒绝/附cause，外部改变保持、源ini保持，无SQL库创建。0字节快照报告为0，后续真实坏blob使整报告失败，不返回只完成前面文件的半报告。
- 实际Backup.snapshot→SQLite保存/读回→外部改当前用户文件→外部修复blob→snapshotReport→Installer预览/安装/停用：report/plan/MOD记录均17字节，计划无blocker，执行还原verified snapshot，停用恢复later user content，原快照引用/正确blob保留。此Installer guard明确noop、仅隔离文件；不是Enhanced运行许可/加载或真实用户游戏效果，也不把外部修复改写当GEMS功能。
- 本轮没有物理20GiB/大资源压力、全环境快照一致时点/磁盘峰值/取消超时或历史大小错误自动维修。新增同次证据仍非OS锁或无竞态承诺，继承公共SHA边界；快照恢复仍不删除后来新增文件，不称全时间点还原。
- 23:08香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、版本1.0.1158.16/running=false。未启动或写真实游戏/安装组件/更改Steam账户自动更新和安全策略；原Electron3077无解除证据，不重试/改名/换父进程/绕过。当前UI/IPC/助手/资源/最终EXE未验收。无新依赖/作者资源/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围，历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.58 备份blob独占发布与暂存清理（2026-10-13）

- 原blob-stage-initial-failure.log：3项0通过/3失败。真实本地临时ini，在fsync边界改坏暂存，旧put返回正确源SHA但blob实际为late corruption；copy后同哈希目标新建external existing blob，旧rename覆盖为verified backup并返回；刷新前暂存被移走并替换为foreign temporary，注入原错误后旧finally删除外部新文件（foreignExists=false）。这三个是实际隔离文件操作及明确函数故障，不声称真实用户游戏备份已丢失。
- put源使用实际同次SHA/bytes；暂存必须独立普通文件/所有普通父目录原身份，复制后及fsync后重新核验大小/SHA，末段封印同步核对。复用restore-stage既有政策，错误可含“恢复临时副本”，未伪称资源转换。blob-stage新模块对已有blob固定读取/目标与目录身份复查，坏对象保持、不自动修复。
- 新blob通过fs.linkSync同目录独占建立目标名，EEXIST只实际核验正确赢家，不rename覆盖；ENOTSUP等失败中文拒绝、保留cause且不降级。本次发布后tmp/target必须同本次inode、普通/同父身份且各nlink=2，才解除tmp；成功正常最终blob为独立nlink=1并实际复核SHA/长度。已有只读blob的硬链接政策未放宽或统一禁止。
- 新增10项最终定向97/97（blob-stage-current.log，包含暂存恢复/守卫/公共SHA/旧Backup/生命周期/真实子进程中断/core），核心627/627/0跳过（core-tests-blob-stage-current.log）、构建通过（build-blob-stage-current.log）。首次修复19/19和扩展9/9日志保留，没有生产逻辑测试失败；版本升级后的中间源码包用于现有CLI回归附件读取，最终文档后再次归档核验。
- 首次最终源码核验失败（source-blob-stage-verification-failure.log）：打包命令stdout重定向到被同一次归档包含的artifacts日志，归档之后该日志继续写入，造成源文件哈希不一致。是交付记录写法错误，不是核心测试失败；保留失败日志，最终归档/核验/清单改为直接输出，停止修改包内证据后重新完成三步。失败时生成的中间清单不作为最终核验交付。
- 实际4次并发put同内容四结果同SHA、只一正确blob/无tmp/nlink1；零字节去重与恢复正确。实际link调用瞬间才新增坏目标保留拒绝、正确目标保留复用，涵盖晚于末段普通路径检查的目标出现；不是网络/跨进程压力或对所有路径换址无锁保证。
- 不支持硬链接由明确ENOTSUP函数夹具，不是真实exFAT设备；拒绝/no blob/源不变，故障解除后正常保存。实际发布完成后外部改坏目标拒绝成功、保留坏blob/再次保存仍拒绝；未擅自删除证据。实际关闭刷新fd后换址目录或建立junction，外部同名blob/tmp与外移原tmp保持；已有blob读完后同内容换inode拒绝并保留新旧文件。
- 实际Scanner/SQLite/Installer用户目标ini备份暂存损坏：目标user original完整、无MOD、事务已回滚/全部applied=false、无已登记blob；故障解除后重新计划/安装写mod new，停用还原user original，实际每个保留blob SHA等于文件名且nlink1。该Installer guard为隔离noop，不代表Enhanced写入许可或真实游戏效果。原包和缓存未模拟结果。
- 新独占发布点准确进程中断/断电/目录持久性尚未新增实测，现有3项子进程生命周期回归通过只支持原覆盖范围；OS最后竞态/外部变化、未知暂存维护、大文件/峰值/取消/超时/非NTFS待验。新策略可能在其他备份盘拒绝，不能称已覆盖全部用户配置。
- 22:44香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。无真实游戏启动/文件写入/组件安装、Steam账户/自动更新/安全策略变化；原Electron3077未重试/改名/换父进程/绕过，本版UI/IPC/游戏助手与最终EXE未验收。无新依赖/作者资源/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned、source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false。


## 0.1.57 最后提交条件与目标复核（2026-10-13）

- commit-guard-initial-failure.log原3项0通过/3失败：真实副本copy边界将测试guard变量running=true，旧install仍写mod value/已启用，旧disable仍还原user original/已停用；直接恢复新增文件时目标实际fs.read回调切为运行中，旧unlink仍删除/已回滚。是实际隔离Scanner/SQLite/Backup/Installer文件操作，运行中状态是显式模拟callback，不是真实GTA/系统进程切换或E文件受损证据。
- Backup.restore可选第四参数beforeCommit，非法非函数在工作前拒绝；目标SHA和暂存核验完成后调用，异常引用不变。Installer安装/恢复两处传原guard，新增文件unlink前再次guard；异步回调后同步核对目标及父目录身份、tmp封印，未知/运行中/部署未就绪不继续提交。主进程原new Installer(...guardGame...)未改变；模块源接入/编译不是当前真实IPC/游戏证明。
- 共享core/path-identity从restore-stage提取原目录dev/ino/stamp政策，旧restoreDirectoryIdentity公开别名保留，tmp仍要求全部父目录存在/普通。commit-target记录现有普通目标或null并允许缺失父目录的明确missing标记，缺失不是创建/无条件允许；回调期间目录/目标出现或改变会拒绝。
- 首次13项12通过/1失败（commit-guard-message-failure.log）：原restore-stage目录换址测试只接受tmp/连接错误，现在更早被目标变化检查拒绝；只扩展精准文案类别，原外部/旧/tmp保护断言保持。首次全量616项615通过/1失败（core-tests-commit-guard-missing-parent-failure.log）：新checkpoint要求所有父目录存在，早期restore注入失败尚未创建新父目录，自动回滚被误留待处理。修正commit-target缺失目录标记（tmp政策不放宽），新增真实早期失败回滚测试，未把这是原旧版漏洞。
- 最终新增11项、定向77/77（commit-guard-current.log，含Backup/restore-stage/生命周期/真实子进程中断/core旧例），核心617/617/0跳过（core-tests-commit-guard-current.log）、构建通过（build-commit-guard-current.log），保留Framer非阻断提示。更新生命周期backup.restore装饰器转发第四参数，不人为绕过钩子。版本升级后中间源码包给现有实际CLI附件读取，最终文档后重归档/CRC/源SHA，前者不是最终交付。
- 实际安装/停用准备后模拟running、进程未知、Steam部署不就绪时目标原字节/MOD原状态保持，pending事务可有写前applied=true但不说已提交；模拟条件恢复后recover将未提交标记消除，再安装/停用正常，原已启用MOD恢复后状态已停用。不是启动/关闭真实游戏或真实Steam更新。
- 真实异步beforeCommit期间现有目标改写/缺失目标新建，guard返回成功仍拒绝，保留用户新字节/清理自有tmp；unlink最后guard中真实用户改写，保存待处理/原MOD已启用/用户字节保持。回调实际在tmp正确SHA和目标未改时一次执行，非法回调不写。缺失新父目录捕获不创建，后来mkdir会拒绝旧checkpoint；真实恢复早期错误仍能无目标写入回滚。实际fs.write/read/rename与显式函数故障相结合，不是假安装结果。
- 准备mkdir/临时副本仍可能在最终guard之前发生；不是整个准备阶段零写入、OS进程锁、最后毫秒/磁盘空间/物理压力/取消/超时保证。大文件和真实游戏运行切换没有以这些小ini/变量夹具冒称验收。
- 22:19香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无真实游戏启动/写入/组件安装/Steam账户或自动更新/安全策略改变。原Electron3077无解除证据，不重试/改名/换父进程/绕过，本版UI/IPC/助手/资源/最终EXE未验收。无新依赖/作者资源/公网下载/商业授权，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned，source-only无桌面交付，commercialReady=false/fullRequirementsPassed=false，完整商业终验未通过。

## 0.1.56 恢复暂存提交和清理身份保护（2026-10-13）

- restore-stage-initial-failure.log原3项0通过/3失败：实际已复制并第一次校验过的tmp在fsync阶段被写late corruption，原Backup.restore在rename后才报错，原目标已经是坏字节；最后核对目标的open边界把tmp移走/替换普通坏文件，原目标同样被改后报错；同边界将tmp换成指向外部样本的真实硬链接（合法SHA）则原restore未拒绝。第三项旧断言失败在后续diagnostic之前，原日志没输出目标nlink，不伪称测得该数值；native link和成功返回是真实执行，未执行样本/外部程序或触及E/真实用户文件。
- first-current原3组加旧backup6共9/9；最终新增10项、定向54/54（restore-stage-current.log，含原Backup/SHA/快照/生命周期44），核心606/606/0跳过（core-tests-restore-stage-current.log），构建通过（build-restore-stage-current.log），原Framer非阻断提示保留。版本升级后中间源码包只供已有实际CLI附件读取，最终文档后重新归档/CRC/source SHA，前者不是最终交付。
- restore-stage单独模块记录每层普通父目录dev/ino，不比较会自然变化的目录mtime；tmp首次copy完成捕获普通独立文件nlink=1、大小/纳秒身份。同fd SHA/真实长度在fsync前后都核验，hashOrNull目标核对后同步再查tmp/目录身份然后rename；原目标预期和写后SHA保持。临时源同字节却更换inode、hardlink、父目录换址/连接、同inode可见mtime/内容变化也拒绝。
- 实际fsync后损坏、目标核对时替换坏文件/硬链接/同字节新inode、同inode写15字节corrupted data!并主动utimes到2020，都保留原目标；同长度案例用真实改时间确保可观察元数据，不声称无可见时间变化也能检测。被替换的新tmp及移走旧tmp保留，自有同inode损坏tmp可清理；源/外部hardlink样本不改。
- 实际嵌套目录在target fd关闭边界改名，原目录及暂存移走，当前位置改普通新目录或junction到外部样本目录，放入同名外部目标和tmp；恢复拒绝，外部两文件/移走原目标/旧tmp全部保留。所有路径都在本测试独立临时根下，故障后的最终test.after仅清理已创建夹具，不等于软件自动清理未知对象。
- fsync原始注入错误引用保留、原目标和来源不改，自有tmp清理且后续重试成功；源blob实际坏字节在copy前拒绝，copy调用0、坏blob不自动修复；正常和0字节恢复结果nlink=1/正确SHA、无自有tmp残留。大文件和真实硬件断电/IO峰值没有用这些小样本冒充。
- 实际扫描/SQLite/Backup/Installer覆盖用户ini：第二阶段暂存被写坏，恢复在提交前拒绝，事务已回滚/applied=false/无已启用MOD/原用户字节保持；错误tmp清理，原包保留。恢复hooks后重新预览安装成功、停用还原用户字节。guard为显式空回调，只证明隔离文件事务，不代表Enhanced故事运行/真实崩溃/游戏内助手或当前IPC。
- 21:47香港时间实际E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无游戏启动/写入/组件安装或Steam账号/更新/安全策略变化。原Electron3077无解除证据、不重试/改名/换父进程/绕过，本版UI/IPC/最终EXE与游戏未验收。无新依赖/作者资源/公网下载/商业授权，43项生产许可与开发链8moderate保持历史范围；历史助手22528字节NotSigned，source-only/无桌面交付，commercialReady=false/fullRequirementsPassed=false，完整商业终验未通过。

## 0.1.55 文件长度与SHA配对、安装字节统计（2026-10-13）

- file-size-initial-failure.log原4项0通过/4失败：扫描缓存在walk枚举后的首个BigInt lstat边界实际追加，自建文件size记录16/实际28，返回旧size配新SHA；报告size置0但保留正确SHA，plan.bytes=0且无blockers；计划与报告同时置0直接API安装实际16字节却记0；单改plan.bytes=1实际16却记1。后两项是真实隔离Installer/SQLite/备份写入，但错误报告/计划为人为DTO，不声称当前桌面不可变预览可被直接篡改或真实E/用户游戏受损，亦不称四个独立P1。
- first-current原4项修复后全通过，新增完整10项/定向56/56（file-size-current.log，含原公共SHA/事务/MOD/生命周期）。首次全量595通过/1失败（core-tests-file-size-message-failure.log），旧源缓存测试把8字节tampered替换7字节value=1，新增预期长度检查提前拒绝，文案是文件大小而不是原缓存发生变化。将这一既有测试扩展为8字节变化匹配文件大小、7字节value=2同长度变化匹配哈希错误，并检查零事务/备份/目标且坏缓存保留，未改生产规则；最终核心596/596/0跳过（core-tests-file-size-current.log），构建通过（build-file-size-current.log），原Framer非阻断提示保留。
- inspectFileHash从原hashFile引擎提取同固定fd的readonly hash/bytes证据；options.expectedBytes严格整数/非负/最多20GiB/单键，错大小在内容open/read前拒绝，原普通文件/身份/长度/64KiB异步/变化和关闭逻辑保持。hashFile字符串与hashOrNull缺失语义兼容。扫描entry的hash/size来自同一次实际核验，要求枚举大小相同；Installer.plan/install每个源核验大小再SHA，新增总plan.bytes等于已核验文件和的校验在第一笔事务/备份/目标写入前，旧负容量MOD分类和空/重复事务门禁保持。
- 实际文件SHA/bytes/frozen对象/空文件0字节；0/高估/异常预计参数（null/空对象/数组/undefined/负数/小数/NaN/20GiB+1/字符串/未知字段）内容open调用0、源不改。大数只是options数值边界，无真实20GiB文件或压力。现有公共SHA10项仍覆盖真正短读/IO故障/外部修改，不虚造大小证据。
- 实际低估和高估都拒绝预览/直接执行；错长度/SHA或总容量不能保存事务/MOD/blob/写目标，原DB及源保持。高估修正元数据后真实安装/停用正常。原预览后缓存实际追加执行拒绝并保留用户追加；普通多文件含空ini实际扫描、安装记录/DB plan.bytes与目标stat大小和一致，停用移除新增目标并保留原始包。
- 顺序小包测试：先成功安装实际ini，第二独立导入错size失败，第一实际目标/DB原字节/已启用MOD/事务/备份不变，再停用第一成功。只两个本地ini包，不算50辆车队列/转换/DLC/作者真实MOD或游戏验证。Game guard明确空回调，不假称真实环境/故事加载。
- 版本升级后的中间源码包用于既有真实CLI附件读取，最终文档完成后另归档/CRC/source SHA校验；历史助手DLL仍22528字节NotSigned/不执行，source-only桌面未交付，commercialReady=false/fullRequirementsPassed=false。21:11香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无真实游戏启动/写入、组件/Steam账号或更新/安全设置改变。原Electron3077不重试/改名/换父进程/绕过，本版UI/IPC/游戏与最终EXE未验收。无新依赖/作者资源/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围，完整商业终验仍未通过。

## 0.1.54 公共文件SHA长度与变化检查（2026-10-13）

- file-hash-initial-failure.log原3项1通过/2失败：原createReadStream首次data事件实际追加字节，hashFile仍返回摘要；在创建原流前实际删除路径，hashOrNull返回null而不拒绝。正常/空文件SHA与初始缺失原已通过。只修改临时自建ini，不是两个真实用户游戏漏洞/P1或任意缓存可绕过安装SHA门禁的证据；原Installer多数内容不符已拒绝。
- 首次修正保留固定fd流+手动关闭，在3个断言通过后产生异步EBADF重复close，整个测试文件失败（file-hash-stream-failure.log）。修正为固定fd上的异步fs.read回调分块与单一finally关闭，不依赖ReadStream所有权，不隐瞒新实现错误。对应变化测试从原流接口改为实际fs.read回调边界，仍真正追加/删除文件；原复现日志的接口和最终接口区别明确。file-hash-first-current.log最终3项通过且无异步异常。
- 首次扩展定向32项31通过/1失败（file-hash-fixture-failure.log）：新集成测试把数据库路径误写gems.db，实际为gems.sqlite，尚未运行增长缓存验证。仅修正测试路径，不放宽生产规则；最终新增10项、定向32/32（file-hash-current.log，含原备份/生命周期22），核心586/586/0跳过（core-tests-file-hash-current.log），构建通过（build-file-hash-current.log），原Framer非阻断提示保留。升级后中间源码包仅供已有真实发行CLI读取，文档完成后最终包另归档/校验。
- 实际公共函数先检查各层链接/普通文件/20GiB，首读捕获dev/ino/size/mtimeNs/ctimeNs/nlink，固定fd/实际长度、每次最多64KiB异步读取，短读完整循环、提前EOF/非法返回长度拒绝，完成后fd与路径再核对；仅初始ENOENT由hashOrNull返回null，中途ENOENT包裹变化，不误当初始缺失。初始空文件正确SHA并关句柄；只读硬链接允许，不偷偷扩大其他记录独立文件规则。
- 实际追加/删除/路径换名+替换/截断/同长度改写并主动修改真实时间戳都拒绝，外部新/旧文件或截断保留；同长度测试主动utimes用于保证可观察元数据，不声称无时间戳变化也有内容快照保证。每次最多3字节读取1024字节最终正确SHA，人工提前EOF无截断摘要；注入异步原错误引用保持、fd随后EBADF证明已关，正常后续核验通过。IO故障与短读为显式接口夹具，不算硬件坏盘/压力。
- 实际目录/junction拒绝且文件不变，实际硬链接SHA通过只读；仅对实际小文件lstat元数据注入20GiB+1，读/open调用0、原字节保持，没有真的创建/读取20GiB资源。持续追加不无限追读由固定上界代码与有限追加测试支持，未运行无限写者或超时/吞吐压力。
- 实际Backup.put源读取中追加拒绝、blobs空、追加源保留。完整隔离链实际文件扫描/SQLite/缓存→Installer.plan读取缓存时追加→中文blockers/无目标/无事务/无blob/DB原字节/作者源保持→测试外部把缓存恢复原字节→正常预览/安装/停用成功。guard为明确空回调，目标只是自建ini目录，不算Enhanced版本/游戏加载或实际助手测试。
- 20:44香港时间实际E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；无真实游戏启动/写入、组件安装/Steam账号或自动更新/系统安全变化。原Electron3077无解除证据、不重试/改名/换父进程/绕过，本版UI/IPC/最终EXE/助手/转换/DLC/加密RPF未验收。无新依赖/作者资源/公网下载或商业许可，43项生产许可与开发链8moderate保持历史范围；commercialReady=false/fullRequirementsPassed=false，完整商业终验保留。

## 0.1.53 发行证据输出路径与暂存保护（2026-10-13）

- release-output-initial-failure.log原3项0通过/3失败：复制本工程实际脚本到独立临时目录，用自建字节附件（不是有效ZIP/MOD）和实际历史助手DLL副本，仅调用清单读取。manifest和SHA256SUMS分别硬链接到同夹具outside/user.txt，原CLI退出0/外部字节被改/另一输出也被改；第二输出改目录时原退出1但首清单已改。没有触碰真实E、用户原文件、原发行清单或执行DLL；不声称远程利用或三个独立P1。
- release-output-first-current.log前三组修复后全部通过；新增完整10项。首次定向38项37通过/1失败（release-output-fixture-failure.log）：测试在第二个临时句柄未关的fsync边界尝试父目录改名，被Windows文件占用阻止，故原目录未换。把外部改名注入移到句柄关闭后的首次lstat边界，实际替换成功并确认拒绝/外移暂存保留，不放宽生产检查。首次构建失败为TypeScript禁止直接赋值readonly lstatSync（build-release-output-type-failure.log），仅测试显式类型转换修正；生产逻辑不变。
- 最终定向38/38（release-output-current.log，含原CLI/发行/签名28），全核心576/576/0跳过（core-tests-release-output-current.log），构建通过（build-release-output-current.log），保留原Framer非阻断提示。版本升级后中间源码包供已有真实CLI成功路径读取，文档后另重新归档并核验CRC/源SHA，前者不代表最终交付。
- 实际新模块两个固定目标整批预检：父目录各层非链接普通目录并记录dev/ino，旧目标独立普通文件/大小最多8MiB，固定句柄完整短读双SHA/纳秒身份复核；wx暂存、写入fsync、实际SHA与预期文本比对，全输出复核后逐文件rename。原manifest成功路径接入；signed CLI测试的隔离原脚本复制清单加入新模块。
- 实际临时文件验证：两种硬链接、目录拒绝且外部/旧记录不改；正常实际CLI生成/更新/校验列表与实际附件摘要一致，首次无输出可创建；输出非法类型/超8MiB、已有超8MiB拒绝保留；实际write/fsync第二暂存注入失败，两旧输出保持/自有暂存清理；同长度实际外部改写、原缺失文件被新增，拒绝并保留外部变化；readSync每次最多2字节仍完整更新，提前EOF拒绝；junction不写，父目录实际换址后不提交/不删除外移暂存。
- 第二rename注入失败明确published=['manifest.json']/部分提交错误，第一为新清单、第二仍旧字节。此测试明确揭示剩余非原子配对限制，不把“逐文件rename”冒称整体原子；无断电/硬件/多进程压力、最后竞态或整体读者配对验收。清理失败只保留，不自动抹其他人文件。
- DLL副本及原实际CLI/Node签名回归只读，历史助手仍22528字节NotSigned，不加载/执行/签名；源清单commercialReady=false/fullRequirementsPassed=false。20:12香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；没有游戏启动/写入、Steam账号/更新或安全策略改变，原Electron3077不重试/改名/换父进程/绕过。无新依赖/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围，UI/IPC/助手/资源/最终EXE完整商业终验仍未通过。

## 0.1.52 发行参数完整准入（2026-10-13）

- release-cli-initial-failure.log原3项0通过/3失败。对原实际manifest CLI运行source-only+requre-signed、source-only+未知赋值、重复source-only，各自退出0/manifestChanged=true/SHA256SUMS不变；断言失败后的finally恢复本工程原清单。初始循环在第一例失败后停止，多余位置参数/冗余交付组合初始只由代码审查确认，最终测试才实际覆盖。不是三个独立签名绕过/游戏破坏漏洞。
- 首次修正3项在本工程实际CLI均通过（release-cli-first-current.log）；再扩展到9项，将无效CLI和帮助测试改为实际原脚本复制到独立临时目录运行：有非法package.json、旧清单/校验值哨兵，没有发行附件/开发依赖。退出1且中文发行参数错误/哨兵保持，证明在包读取/证书/构建/写入前结束；独立帮助退出0，不创建artifacts，不与全量其他CLI测试竞争真实release文件。未替换OS/模块接口或伪造签名输出。
- 新增9项、定向28/28（release-cli-current.log，含原发行10/签名9），全核心566/566/0跳过（core-tests-release-cli-current.log），构建通过（build-release-cli-current.log），原Framer非阻断警告保留。升级版本后先生成中间源码包供已有实际CLI成功路径读取，最终源码包另在文档完成后归档/校验，中间包不是最终交付。
- 参数单元测试含3种交付/无参数、有限数组/17项拒绝、32769字符拒绝、控制字符/异常类型、重复/顺序组合、缺路径/多路径/开关被当路径拒绝；疑似秘密字符串只是非真实凭据夹具，错误不回显值。中文空格路径作为独立argv值保持，不做命令拼接或执行目标。
- 原release-manifest测试继续实际生成本工程当前source-only清单、读取实际历史助手DLL和Windows签名，签名/源码冲突仍拒绝；该DLL22528字节NotSigned/未执行，默认清单始终commercialReady=false/fullRequirementsPassed=false。完整签名构建/安装/游戏不是本轮成功路径。
- 19:44香港时间实际E只读record=present/ready=true/build25261616、99890851584/99890851584字节、版本1.0.1158.16/running=false。无真实游戏启动/写入、Steam账号/更新/系统安全策略变化。原Electron3077未重试/改名/换父进程/绕过，本版UI/IPC/最终EXE与游戏未验收；无新依赖/公网下载/商业许可，43项生产许可与开发链8moderate保持历史范围。

## 0.1.51 环境快照准入与恢复报告（2026-10-13）

- snapshot-admission-initial-failure.log原4项1通过/3失败：源A登记恢复路径B可保存；较后越界原noLinks已阻止外部复制但前一blob可保存后报错，初始失败含中文分类不同；重复目标/坏输入准入不足，正常快照原已通过。不称三项均复制了目录外数据/真实游戏破坏/RCE。
- 新增12项、定向32/32（snapshot-admission-current.log，含事务/恢复准入），其后增加预算参数类型守卫与20001输入数量断言、最终全核心557/557/0跳过（core-tests-snapshot-admission-current.log），构建通过（build-snapshot-admission-current.log），原Framer非阻断提示保持。包版本升级后中间源码包供发行CLI测试；最终文档后另归档/CRC/源SHA与清单，中间包不代表最终交付。
- 实际临时ini/SQLite/Backup：源与相对目标匹配、大小写重复、穿越/较后越界、坏/未知字段、20001项在blob/sidecar前拒绝；源和外部文件不变。所有输入先检查实际普通文件/链接/每文件20GiB，然后内容备份，预算模板空hash仅估计（+64字节每SHA），没有把占位hash保存成备份；实际小记录紧凑JSON预算一致。
- main捕获callback在任何blob前完整验证现有DB和预计文本预算，坏历史拒绝不保存；单/全快照读取验证键/字段/UTC日历/路径/hash/重复/20000条目。SQL8MiB单条、10001实际null行在JSON.parse前拒绝，五条各7MiB空白+合法JSON约35MiB超过32MiB拒绝，原库保留。是数量/文本预算，不是真实20GiB文件或等量有效环境/性能压力。
- record同id不可覆盖；空目录实际创建0条目快照可读，但snapshotReport明确空快照无可恢复文件。损坏/删除blob及错误游戏路径拒绝生成报告，其他blob/源/库不改；恢复blob原字节后可读报告，未自动修复。
- 完整实际链：两个ini+根dinput8.dll（仅未执行文本夹具）捕获/入库→外部改当前ini/DLL并新增later.ini→全部blob核验报告→Installer真实预览/覆盖审批参数/备份事务→恢复捕获字节→停用恢复之前用户字节，later.ini一直保留，SQLite重开快照一致。guard在该隔离测试为显式空回调，不算真实Game环境/故事加载或DLL执行，根DLL警告显示其可能原始游戏组件。
- 一个自建mods/run.bat仅保存文本字节，捕获与schema合法；实际Installer仍拒绝禁止目标、无事务/游戏改动。捕获保留不等于所有类型可自动恢复，未执行bat。主进程原Snapshot报告映射提取到独立snapshot-report，通过hash核验后仍需原guard/冲突/所有权/安装事务；报告兼容始终游戏内待测试。
- main当前snapshots/restoreSnapshot和保存接入，UI文本改“文件记录·恢复前核验”、空按钮disabled/title中文；没有运行Electron/IPC/截图，原3077不重试/换名/换父进程/绕过，不能把编译当UI验收。
- 19:22香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无真实游戏启动/写入、组件/Steam账户/更新/系统安全改变。无新依赖/网站下载/第三方内容/商业授权；43项生产许可和开发链8moderate保持历史范围，schema2/source-only仍有未签名历史助手DLL，两终验标记false，完整原缺口保留。

## 0.1.50 发行签名证据完整性（2026-10-13）

- release-manifest-initial-failure.log原2项全失败：实际运行本工程0.1.49 source-only CLI，清单有助手DLL但authenticode缺失、codeSigning=no-executable-delivered；原DLL字节比较不变。是发行证据遗漏/误分类，不把它称DLL已执行或商业完整标记曾为true（原两终验标记一直false）。
- 开发回归失败均保留：release-manifest-reader-failure.log初次11项9通过/2失败，新增读取器stream+显式close使EBADF二次关闭，改固定FD有界循环；release-manifest-fingerprint-failure.log19项18通过/1失败，实际同长度写入未被仅属性指纹发现，加入签名前后双次实际SHA；release-manifest-digest-scope-failure.log修改时一次外层摘要变量引用错误，修正返回initial.sha256。未修改实际助手/Node字节或系统策略，CLI失败没有新成功签名结论，不隐藏这些本轮实现错误。
- 新增10项，定向19/19（release-manifest-current.log，含原9项签名/构建配置），核心545/545/0跳过（core-tests-release-manifest-current.log），构建通过（build-release-manifest-current.log），原Framer非阻断提示保留。包版本升级后先生成中间源码包，供全量实际CLI读取当前版本文件；最终文档完成后重新归档/CRC/source SHA并生成清单，中间包不作最终交付验收。
- actualManifest真实子进程执行原scripts/release-manifest source-only，未复制/替换OS签名结果；实际助手DLL22528字节、SHA3908c8895842084ae9ad9ad386a6f6c7180c49349d2a7f38e261e5baf7c0f399、Windows NotSigned，未配置真实发布者/策略passed=false，原字节保持。实际Node签名读检查为原测试，未载入DLL/启动Electron。signed/source-only冲突在写前拒绝、既有manifest与SHA256SUMS逐字保持。
- 模块把EXE/DLL/ASI计为代码；完整签名目标声明桌面/安装器/便携（各至少1MiB）与助手DLL（至少16KiB），真实完整签名构建仍缺条件，范围声明测试不是四份可信签名实际成功。纯规则Valid/发布者/时间戳/自签名/用途/未知和冲突状态夹具仅测试分类，不创建证书/调用签名服务/添加信任。
- 真实临时数据文件（名称data.zip但仅8192字节已知数据，不声称是有效ZIP或程序）：硬链接、父目录junction、不足大小拒绝；实际readSync后同长度改写/路径替换拒绝并保留新旧字节，短读每次3字节最终精确SHA、提前EOF拒绝。源/外部文件不自动修复。双SHA用于属性没显示改变时的内容复核，未把临时测试当硬件断电/多进程压力或验证所有签名期间竞态。
- 默认系统Auth检查移至独立authenticode.mjs，verify-signatures原公开authenticode导出保留；各代码文件实际状态和完整签名策略分开，只有预期发布者/指纹/非自签名/用途/时间戳全部通过才显示verified-authenticode，单Valid为authenticode-valid-publisher-unverified，未知/冲突不通过。默认schema2/source-only显式无桌面交付但包含1个unsigned代码附件。
- 18:53香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。没有真实游戏启动/写入、组件安装或Steam账户/更新/系统安全设置变化。原Electron3077无解除验证、不重试/换名/换父进程/绕过，UI/IPC/游戏/最终EXE未验收。无新依赖/第三方内容/网站下载或商业授权；只调用Windows证书验证机制，不承诺系统证书链网络行为已抓包/离线验收。43项生产许可/开发链8moderate保持历史范围，commercialReady=false/fullRequirementsPassed=false，完整终验缺口保留。

## 0.1.49 导入报告读写准入（2026-10-13）

- import-admission-initial-failure.log原5项1通过/4失败：坏哈希、类别/未知字段/相对原始路径/异常生成名可继续手动保存，相关null MOD可被当作未启用。坏JSON原SyntaxError已拒绝且不写，只是缺少中文分类；正常手动目标→实际安装/恢复原已通过，不能把四项称四个漏洞/真实游戏破坏。
- 首次定向35项34通过/1失败（import-admission-fixture-failure.log）：旧manual-targets已启用夹具只有status，新增完整MOD准入正确将其认定坏记录，未走原预期尚未安装文案。更新该测试为完整有效MOD DTO（未造真实交易关联，只测试编辑门禁），不放宽生产校验。最终新增12项、定向42/42（import-admission-current.log），核心535/535、0跳过（core-tests-import-admission-current.log），构建通过（build-import-admission-current.log）；原Framer非阻断提示保留。
- 从0.1.48 MOD内嵌报告提取core/import-report同一规则：SQL键/报告id、UTC日历、实际字段类型/类别/相对路径/绝对source/hash/大小/布尔/重复源、有限来源HTTPS无凭据/元数据和多行README；MOD原包裹错误/规则保留，旧12项全部通过。main现有导入State/导出保护/预览/原目录读取使用readImports/readImport，扫描/快照生成报告保存走saveImport；手动目标检查整批MOD并用同一导入保存，纯生成函数未宣称全面持久化检查。
- 实际临时scan/SQLite/源文件/缓存/Installer/Backup：坏JSON/字段/键/报告不被改写、源ini保持；正常手动目标可安装并恢复新增文件，作者/版本/来源/多行说明持久化重开一致。新预计写入超8MiB拒绝、现有同id预算计算不重复计数、无关坏历史阻止新报告保存，不留下新id或局部样本。
- SQL单条8MiB、10001真实null行、五条各7MiB空白+合法报告JSON约35MiB超过32MiB时，在JSON.parse前拒绝且原库保留；预计1100条8192字符警告超8MiB拒绝。只验文本/数量预算，未有对应作者大包/20GiB IO/有效10000 MOD/内存峰值压力。
- 离线运输夹具实际传输自建ZIP字节、执行完整Downloads下载/SHA/scan/SQLite：在实际scan之后人为注入warnings=null的DTO，先中文拒绝，失败无reportId/假已分析/孤立报告，ZIP保持；同服务后续正常包已分析。已有坏导入时健康扫描最终整体拒绝、旧null保留、重开下载失败。运输是显式内存HTTP响应夹具，没有公开站点访问/作者资源，坏DTO不是声称真实包触发扫描器该类型漏洞。
- 原下载报告+已分析的单次writeBatch保持，先预检而不先保存报告，原7项提交/SQL/rename/外部DB/子进程中断回归通过。不是OS锁或所有关联/断电保证。
- 18:12香港时间E仅只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；未真实游戏启动/写入、安装组件或Steam账户/更新/系统安全变化。原Electron3077未解除验证、不重试/换名/换父进程/绕过，未跑本版UI/IPC/截图/最终EXE。无新依赖/网络/第三方资料/商业授权；43项生产许可/开发链8moderate保持历史范围，source-only、commercialReady=false/fullRequirementsPassed=false，完整原终验缺口保留。

## 0.1.48 MOD记录完整准入（2026-10-13）

- mod-admission-initial-failure.log原5项1通过/4失败：异常状态漏掉后安装所有权、无关坏MOD不阻止安装；初始恢复夹具为无关坏MOD，会被旧流程忽略并回滚。键与id错误原transaction关联已阻止文件修改，本项仅错误分类不同，不算另一个文件漏洞。
- 将恢复夹具改为较早已安装MOD的实际坏JSON后，仅从本新工程0.1.47源码包读取原Installer/index单模块，在临时具名模块运行前5项（新Store仅增加未被旧代码调用方法）。mod-admission-corrected-initial-failure.log同为1通过/4失败，保存实际targetExists=false（异常状态共享删除）、pendingState=已回滚（发现较早坏JSON前已改新事务）。临时旧模块/测试已删除，不回退生产代码、不读取旧work。不是Electron/原0.1.47整个发行物重测。
- 新增12项，最终定向56/56（mod-admission-current.log），全核心523/523、0跳过（core-tests-mod-admission-current.log），构建通过（build-mod-admission-current.log）。全量后只修正上述恢复测试夹具，最终56项再次通过；无生产代码改变，不重复全量。原Framer非阻断提示保留。
- 真实临时scan/SQLite/Backup/Installer：异常共享状态、坏JSON/键错/报告id错/负容量/未知字段/类别/源URL凭据/布尔/日期/重复源路径拒绝；数据库磁盘原字节及SQL行/原游戏夹具/备份不改变。正常A→B共享覆盖：不能先停用A，停用B保留A的实际文件，再停用A删除新增文件；品牌收藏/多行README保持，停用→重启用→卸载→SQLite重开通过。
- 单条8MiB以上文本、10001实际null SQL行、五条各7MiB空白+合法JSON原文本（约35MiB）超过总限时JSON.parse调用0，拒绝且原库保留。新预计MOD的1100条8192字符合法警告超8MiB拒绝，同id替换正确扣除旧文本；纯DTO/文本预算夹具，无对应物理大型MOD或硬件IO/内存峰值压力。
- 新预计MOD全字段/容量预检在第一条事务保存与备份/目标写入之前；main品牌收藏写入调用同一预检，main State/导出目录使用准入MOD。manual-targets独立旧状态判断、import/snapshot记录、全事务关联/维护与性能未补齐，准入不是作者认证/内容SHA实测/数据库锁。
- 原Electron3077未解除验证，未重复启动/改名/换父进程/安全策略，未跑本版UI/IPC或新截图/最终EXE。17:45香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无真实游戏启动/写入、组件/Steam设置/账号改变。无新依赖/网络请求/第三方材料或商业许可；43项生产许可与开发链8moderate保持历史范围，source-only、commercialReady=false/fullRequirementsPassed=false，完整原终验缺口保留。

## 0.1.47 新安装事务预检（2026-10-13）

- transaction-write-initial-failure.log初始4项1通过/3失败：过长报告name会持久化为不符合现有读者的事务、空计划生成已完成/已启用记录、重复计划可发生事务变更后才拒绝。正常安装读回/停用原已有保护；不把三项都称真实游戏破坏/P1或最终可利用漏洞，修改仅隔离目录。
- 新增8项，定向28/28（transaction-write-current.log，含事务读取/恢复准入），核心511/511、0跳过（core-tests-transaction-write-current.log），构建通过（build-transaction-write-current.log），原Framer非阻断提示保留。
- 真实临时scan/SQLite/Backup/Installer：name301、空plan.files、重复目标计划拒绝在任何事务/备份/目标写入之前，比较数据库原字节、game空、blobs空、transaction/mod0；正常install记录经同一准入器读回、停用真实恢复。report/name为明确人为错误DTO，不是声称扫描器正常生成301字符名字。
- 完整20k变化元数据预计JSON超8MiB拒绝，无对应20k物理文件/资源；五个真实SQLite合法已回滚空记录、各6MiB空白+JSON原文本（约30MiB）仍可读，新12000项计划单条低于8MiB但预计总量超32MiB拒绝，磁盘原字节和历史保留。该容量是文本/元数据夹具，非有效同体积真实事务/MOD或内存/IO峰值压力。
- 相同id不覆盖原事务；合法新计划返回确切JSON字节+8192错误预留，仅计算不先保存。该余量针对当前explainError消息上限及状态字段，不是磁盘/锁或未来任意错误保护；初始tx按原渐进保存，完整预检不是整个安装/数据库硬件原子。
- 安装器已接入assertTransactionAppend后再保存第一条准备事务，原读/路径/哈希/所有权/备份/平台守卫不变。原Electron3077无解除验证，不重复启动/换名/换父进程/改策略，未跑本版UI/IPC/新图/最终EXE。
- 17:14香港时间E仅只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，没有真实游戏启动/写入、组件/Steam/系统安全变化。无新依赖/第三方资料/网络请求/商业许可；43项生产许可和开发链8moderate保留历史范围，source-only、commercialReady=false/fullRequirementsPassed=false，完整原终验缺口保留。

## 0.1.46 事务读取入口统一（2026-10-13）

- transaction-readers-initial-failure.log初始7项1通过/6失败：预览/安装/停用坏事务技术错误、直接恢复坏结构先写、无原记录可造已回滚、合法输入未先检查其他事务。正常生命周期原通过。部分失败是原错误非准入中文断言，不误称全部曾绕过文件写入；没有真实用户数据损坏/P1/RCE证明。
- 新增11项，定向33/33（transaction-readers-current.log，含恢复准入/事务日志/真实进程中断），核心503/503、0跳过（core-tests-transaction-readers-current.log），最终build-transaction-readers-current.log通过。全量之后仅调整10000上限中文提示为“自动归档尚未支持”，重新构建通过；无逻辑/安全条件变化，不重复全量。
- 真正临时scan/SQLite/Backup/Installer：坏事务预览、预览后新增坏记录安装、停用/卸载/重新启用拒绝；比较原数据库字节和内存行、已启用/停用状态与当前mod文件，拒绝时无目标/新备份或假安装记录。直接恢复坏参数不修改传入state、原事务或用户样本文件；无原记录不造回滚；其他坏事务先拒绝；基本modId/游戏目录/name/trustedRestore身份改变拒绝。
- 单条缺失返回undefined，坏JSON中文拒绝，超8MiB SQL前置标记不进入JSON解析（调用0）、原库字节保持；10000条实际合法已回滚空变更历史（非有效完整大库压力）仍可读取，新安装拒绝、总数不增/游戏目录空/backup blobs空。正常安装→停用→重新启用→卸载实际文件写入/移除与状态通过。
- 已核对Installer.index和desktop/main没有直接transaction get/list旁路；state/绑定原目录判断用共享读者。main源已接入，不因core测试宣称真实IPC/UI通过。直接恢复只核对基本身份，保留内部回滚局部变化语义，未承诺任意外部参数的授权/来源认证或其他MOD/导入/快照文档保护。
- 原Electron3077无解除验证，本轮不再启动/改名/换父进程/改策略，无本版UI/IPC/新图/最终EXE。16:42香港时间实际E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false；未启动/写真实游戏、安装组件或更改Steam与系统安全。
- 无新依赖/第三方素材/公网请求/商业许可，43项生产许可与开发链8moderate保留历史范围；source-only、commercialReady=false/fullRequirementsPassed=false，原完整终验缺口保留。

## 0.1.45 恢复事务整批准入（2026-10-13）

- recovery-admission-initial-failure.log初始7项2通过/5失败：坏JSON技术错误、null/坏字段进入恢复后才失败或保存变更，新事务先恢复再发现较早null，字段/目标/超文本缺门禁。正常空准备和合法中断恢复原已通过。不是五个独立漏洞/真实用户数据损坏/P1或远程执行，初始文件改动仅临时目录。
- 新增9项，定向22/22（recovery-admission-current.log，含既有事务日志与进程中断），核心492/492、0跳过（core-tests-recovery-admission-current.log），构建通过（build-recovery-admission-current.log），原Framer非阻断提示保持。共享target-policy为原validateTarget逻辑提取，Installer公开导出/其他调用不变，全回归通过。
- 真实临时SQLite/Backup/Installer/源和目标文件：坏JSON/null/数组/changes=null、SQL键与id不一致、modId/日期/状态/布尔/名称/未知字段、SHA/before空值/applied类型、穿越/程序目标/重复大小写目标/变更未知字段拒绝；每次核对数据库磁盘字节与内存行一致，guards=0。较早坏事务阻止较新合法部分事务恢复，其partial文件字节保持。
- 单条真实超8MiB JSON在解析前拒绝，10001实际SQLite null文档计数在解析前拒绝、不处理受限样本（解析调用0）；20001变更拒绝，已完成未应用/空变更、已回滚仍applied矛盾拒绝。数量数据仅准入边界，不是有效大库/容量或IO压力，合计32MiB代码门禁未做有效全容量压力。
- 合法空准备事务仍真实记录已回滚且不造文件/MOD；合法中断从前后实际SHA备份恢复用户old文件，Store重开仍读已回滚。准入未升级备份/身份认证或兼容结论，不覆盖其他raw文档/手动单次恢复入口，未声称全部数据格式保护完成。
- 本版主进程startup调用的recover代码已接入，但原Electron3077无解除验证，不重复启动/改名/换父进程/策略，未运行UI/IPC/启动坏事务错误框/新截图/最终EXE。16:13香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无真实游戏启动/写入、组件安装或Steam/系统安全变化。
- 无新依赖/第三方内容/公网站点请求/商业许可，43项生产许可与开发链8moderate保留历史范围；source-only、commercialReady=false/fullRequirementsPassed=false，完整需求/终验缺口保留。

## 0.1.44 Steam缺记录未知门禁（2026-10-13）

- steam-missing-initial-failure.log初始6项全部失败，其中非Steam测试误把downloading的既有抛异常写成布尔返回判断。修正断言、不改生产代码再测initial-corrected为1通过/5失败：非Steam/下载暂存原保护通过，首次缺记录/环境/预览后安装/自动恢复与记录恢复流程旧版不守未知状态。不是六个漏洞；旧版安装写入只发生在本测试临时模拟game/mods里，不是真实E或用户文件损坏证据。
- 新增6项，定向26/26（steam-missing-current.log），全核心483/483、0跳过（core-tests-steam-missing-current.log），构建通过（build-steam-missing-current.log），原Framer非阻断提示保留。0.1.43快照的初始缺失断言按本次明确新政策改为missing/ready=false，1MiB/变化/UTF8原保护保持。
- 真实临时ACF/SQLite/备份/Installer/模拟PE-RPF标记，未执行游戏：缺记录结构返回record=missing/ready=false/未知build/null计数且不创建ACF；inspectEnvironment.valid=false、Steam组件未知、version未知；正常记录预览后删ACF，install拒绝在任何备份/游戏文件/事务记录前，数据库原字节和用户样本existing文件保持、blobs空、mod/transaction0。
- 中断事务已应用new installed文件与前后实际SHA备份，缺记录恢复保留文件/applied=true，存恢复待处理及中文缺失原因；测试作为外部步骤恢复有效ACF后，真实recover还原original user且applied=false/已回滚，ACF原文不被软件改写。独立validateGame恢复正常，同目录外的平台检查仍null/仅文件头验证，未当Steam或游戏兼容证明；downloading原拒绝保留。
- steam-missing-live-current.json与game-environment-current.json：15:40香港时间E只读record=present/ready=true/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，无ACF正文/账号字段。未启动/写真实游戏、安装组件或更改Steam账户/更新和安全策略。模拟部署缺失/恢复不是实际Steam更新或故事模式。
- 原Electron3077未解除验证，不重复启动/改名/换父进程/策略，无本版UI/IPC/截图/最终EXE。无新依赖/第三方内容/网络请求/商业许可，43项生产许可和开发链8moderate保留历史范围；source-only、commercialReady=false/fullRequirementsPassed=false，完整需求与终验缺口保留。

## 0.1.43 Steam安装记录快照（2026-10-13）

- steam-snapshot-initial-failure.log初始7项1通过/6失败：同长度改写/替换路径返回旧就绪、硬链接/坏UTF8接受、正常短read被一次读取拒绝、validateGame接受读取中变化。原超1MiB读取前拒绝与初始缺失策略已有保护。不是6个独立漏洞、真实Steam更新或已证实P1数据覆盖。
- 新增9项，加原环境定向20/20（steam-snapshot-current.log）；全核心477/477、0跳过（core-tests-steam-snapshot-current.log），构建通过（build-steam-snapshot-current.log），Framer原非阻断提示保持。
- 隔离真实ACF/最小模拟x64 PE与RPF标记（未执行）：readSync原生读返回后实际同长度改flags4到1、新旧路径替换、硬链接、非法UTF8字节、每次3字节短读实际中文/BOM解析、读完后移除、5字节后提前EOF；观察到变化不返回就绪，源/外部新旧文件/原模拟PE-RPF字节保留，移除不重建。文件改动只在本测试进程边界，未替换inspectSteam回复，不是真实Steam并发更新压力。
- 复用readTextSnapshot的普通独立文件、1MiB、循环完整读取、严格UTF8、fstat/lstat纳秒身份与路径复核；仅添加Steam标签和中文重新检查提示，GEMS/XML原保护与全量回归通过。初始缺失与快照期间移除区分，后者中文变化拒绝而不降级为非Steam。没有原生锁或消除最后TOCTOU。
- steam-snapshot-live-current.json与game-environment-current.json：15:10香港时间实际E只读manifest/版本/进程，ready/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false，未保存ACF正文/账号字段。不是Steam完整性验证或单机加载。没有启动/写游戏、安装组件、改Steam账户/更新/安全策略。
- 原Electron3077无解除验证，未重试/改名/换父进程/策略，未跑本版UI/IPC/新截图或最终EXE。无新依赖/网站请求/第三方资料/商业授权；43项生产许可和开发链8moderate保留历史范围，source-only、commercialReady=false/fullRequirementsPassed=false，原完整终验缺口保留。

## 0.1.42 ZIP条目解压边界（2026-10-13）

- archive-entry-initial-failure.log初始8项2通过/6失败。旧版接受65层条目、长路径、带正文目录/空目录错误CRC，或scan最终虽拒绝却已创建超深目录；正常64层和已有文件保护已通过，不误称六个独立漏洞或ZIP Slip/P1越界。
- 新增11项定向11/11（archive-entry-current.log），核心468/468、0跳过（core-tests-archive-entry-current.log），构建通过（build-archive-entry-current.log）；原Framer非阻断提示保留。
- 真实自建单条ZIP，实际local/central目录头、stored/DEFLATE字节与CRC，不替换extractZip结果。65层目录及65父目录文件、超过4096相对路径（64父目录）在该条目mkdir前拒绝，目的根为空；非空目录/空声明CRC错误拒绝，实际合法空DEFLATE目录可创建、损坏压缩流拒绝；正常恰64目录层+文件实际walk/中文内容回读，源ZIP逐字保持。
- 正常scripts/value.ini实际scan/缓存/报告目标，已有user文件不覆盖；失败scan原包/保存的original.zip一致、失败workspace contents空且failure.txt明确64。该测试只有一条坏条目，不等于多条ZIP失败后所有先前内容为空，原允许失败工作区保留部分已解压文件。
- 输入流打开后目标父目录为用户普通文件，实际mkdir失败仍在finally销毁；测试只包裹原yauzl openReadStream记录真实Readable，不提供假流/假回复，用户文件保留。不是OS句柄压力或所有竞态验证。
- 原Electron3077无解除验证，本轮未再次启动/换名/换父进程/改策略，无本版UI/IPC/新截图/最终EXE或作者MOD与游戏验收。14:40香港时间E盘只读ready/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。没有启动/写游戏、安装组件或Steam/系统安全变化。
- 无新依赖/第三方资料/作者资源/网站请求/商业授权，43项生产许可与开发链8moderate保持历史范围；source-only、commercialReady=false/fullRequirementsPassed=false，原完整功能与终验缺口保留。

## 0.1.41 来源收藏文档准入（2026-10-13）

- 初始8项全部失败（source-admission-initial-failure.log），实际运行未修SourceLibrary，不是提取或模拟回复。坏JSON绕过view的try/catch，错误null/未知字段选择、来源键不匹配、超字节读取、错误日历和全量解析均复现。不是八个独立漏洞或远程执行/P1数据破坏。
- 新增9项，加既有来源与原子保存定向30/30（source-admission-current.log），最终核心457/457、0跳过（core-tests-source-admission-current.log），最终构建通过（build-source-admission-current.log）。首次build测试辅助函数返回unknown导致类型错误（build-source-admission-initial-type-failure.log），将只读检查helper改为泛型保留类型，不改生产限制/测试行为；原Framer非阻断提示保留。
- 真实临时SQLite：坏JSON/{bad/null/false/数组/未知字段、数据库键不匹配、16KiB按UTF8超限、select/save/remove/recordRead中文拒绝、无效日历/时区/尾字符拒绝、有效秒/1位/3位毫秒UTC保持、已有坏日历与字段、Store重开保留坏原文。每次只读或拒绝操作比较磁盘字节和内存SQL行，正常收藏仍可用，不删除或自动填补。
- 101个真实SQLite收藏行最多解析51个收藏+1个当前选择、显示50且明确限制，非大库容量/内存峰值压力；全部记录计入新增50上限，不自动删除坏记录。源文档16KiB和SQL键200字节在JSON解析前截断为拒绝标记，未返回部分JSON。
- 原SourceLibrary被主进程/商店复用，返回sourceIssues既有结构不变。但原Electron3077无解除验证，不重复启动/换名/换父进程/策略更改，未跑本版UI/IPC/截图/最终EXE或公网读取，不以编译/后端当桌面验收。
- 14:09香港时间实际E盘只读manifest/版本/进程：ready/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。没有游戏写入/启动、组件安装或Steam/系统安全变化。无新依赖/网站请求/第三方材料/商业授权；43项生产许可/开发链8moderate保留历史范围，source-only、commercialReady=false/fullRequirementsPassed=false，原完整终验缺口保留。

## 0.1.40 手动安装目标（2026-10-13）

- 初始提取0.1.39原setTargets分支行为，8项日志initial-failure为1通过/7失败。其中两项是测试断言错误：原程序拒绝文案包含“程序”而正则未列入；SQLite JSON省略undefined可选字段，原报告比较未序列化。修正测试而未放宽生产安全保护，再运行未修代码，initial-corrected为3通过/5失败；并非七个漏洞或实际Electron运行。
- 修复后新增11项定向11/11（manual-targets-current.log），核心448/448、0跳过（core-tests-manual-targets-current.log），构建通过（build-manual-targets-current.log），原Framer非阻断提示保留。
- 真实自建a/b.ini目录经scan/缓存/SQLite；同源跳过后重复、null/数组/错类型/未知项目字段、大小写源匹配与重复、缺源/重复目标/穿越/程序、全跳过仍阻止安装、重复保存警告去重、保留Legacy/DLC阻碍与兼容状态、启用记录禁止编辑、单路径/数量上限；错误逐字核对磁盘及内存行、源作者字节不改。保存故障用隔离SQL触发器，重开确认原目标。
- 纯计划后续缺源错误输入原报告不改，大小写歧义原记录拒绝；20000个FileEntry元数据getter读取恰20000次验证一次索引，1300长相对路径元数据合计超8MiB拒绝，输入未截断/修改。不是20000真实文件或容量/内存峰值压力。
- 原IPC已改用同一saveManualTargets；原tests/ui.mjs对预览绑定原报告的断言和执行设计保留，但本版没有跑Electron。原3077未解除验证，不重复启动/换名/换父进程/改策略，UI/IPC/最终EXE未验证，无新截图。
- 13:39香港时间E盘只读：ready/build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。未启动/写游戏、安装组件或改变Steam及系统安全；无新依赖/公网请求/商业授权，43项生产许可及开发链8moderate按历史范围保留。source-only、commercialReady=false/fullRequirementsPassed=false，完整原需求缺口保留。

## 0.1.39 设置与窗口准入（2026-10-13）

- 初始8项2通过/6失败，settings-admission-initial-failure.log；模块最初提取0.1.38对应读取/更新分支原行为进行隔离复现，没有声称成功启动Electron或六个独立漏洞。坏JSON为中文断言失败，原解析错误确会抛出；超限解析前保护原不存在。
- 新增11项定向11/11（settings-admission-current.log），最终核心437/437、0跳过（core-tests-settings-admission-current.log），构建通过（build-settings-admission-current.log），原Framer非阻断提示不变。
- 真实SQL.js/临时SQLite、主设置null/数组/字段/坏JSON/超64KiB、窗口坐标/尺寸/开关、无效请求/混合请求整份拒绝、普通更新禁止游戏路径、合法中文路径/负屏坐标/保存及重开、坏记录重开继续拒绝；每次错误比较内存SQL行与磁盘字节。测试SQL触发器阻止更新，内存和磁盘回到原值，不伪造Store回复。默认仅用于缺失，不创建记录，返回独立副本。
- 主进程已接入启动恢复前检查及设置更新/目录绑定/窗口保存。因原Electron3077未解除验证，未重复启动/绕过，没有本版UI/IPC/实际多屏/DPI/最终EXE证据，未验证启动错误框实际显示和自动恢复时序。
- 13:09香港时间E盘只读manifest/文件版本/进程：ready、build25261616、99890851584/99890851584字节、1.0.1158.16/running=false。未启动/修改游戏、安装组件、改变Steam或安全策略。
- 无新依赖/公网请求/作者资料/商业授权，43项生产许可与开发链8moderate保持历史范围；源码交付commercialReady=false/fullRequirementsPassed=false，原完整需求缺口保留。

## 0.1.38 诊断日志快照（2026-10-13）

- R43/P2初始9项3通过/6失败（diagnostic-log-snapshot-initial-failure.log）：全缺日志文案、短读尾部遗漏、同长度内容变化/路径替换仍返回旧线索、硬链接读取、完整尾行首条错误丢失。原UTF8/UTF16与半行截取等已有保护；没有证实P1数据覆盖/RCE或唯一崩溃原因。
- 修复后定向 **17/17**（diagnostic-log-snapshot-current.log），最终核心 **426/426、0跳过**（core-tests-diagnostic-log-snapshot-current.log），build-diagnostic-log-snapshot-current.log通过，Framer原非阻断提示不变。copy-failure.log为16/17，一项旧中文前缀匹配未保留，调整为“部分日志无法读取或解析”后原断言通过；initial-type-failure.log为测试mock重载unknown不能用于Math.min，增加已知数字参数类型，不放宽生产保护。
- 隔离真实文件、模拟最小合法PE/RPF目录（未执行程序）：实际UTF8证据/行号/原字节与因果未确认、全缺日志真实计数、短read每次7字节补全、读取后等长改写/路径替换拒绝并保留新旧文件、硬链接拒绝且后续日志可读、1MiB完整首行保留及半行剔除、UTF16LE原编码不改。读取故障仅本测试进程注入，不替换诊断回复，不算真实游戏资源或崩溃效果。
- 文件尾最多1MiB另加1字节确定边界，BigInt身份/链接/纳秒及路径前后复核；统计是安全读取且解码成功的文件数，另有缺失/失败/截取与每个文件实际总字节/start/解析字节/物理读取字节/时间。不是原生锁或跨日志同时快照；截取原始行号仍null，不猜测。
- live-diagnostic-current.json：实际E盘五个固定组件日志均缺失，coverage read0/missing5/failed0/truncated0、findings0，明确“尚未进行日志内容诊断”，未保存日志正文。只是实际目录缺日志的只读结果，不是日志功能在真实组件/崩溃场景或游戏加载通过。
- 07:42香港时间E盘manifest/文件版本与进程只读：ready/build25261616、99890851584字节下载完成、1.0.1158.16/running=false，game-environment-current.json；没有游戏写入/启动/组件/Steam/系统安全变化。原Electron3077未解除验证，本轮不再启动/改名/换父进程/改策略，UI/最终EXE没有新验收或截图。
- 无新依赖/第三方材料/公开请求/商业许可或签名，43项生产许可/开发链8moderate历史范围保留；source-only、commercialReady=false/fullRequirementsPassed=false，原完整功能/游戏/资源转换/DLC/助手/网站/发行与可靠性缺口保留。

## 0.1.37 有限OIV计划准入（2026-10-13）

- R42/P2初始7项2通过/5失败（oiv-plan-initial-failure.log）：add额外属性/子节点可被忽略；双重清单方式名为GEMS而最终目标来自OIV；未知内容仍保留scripts目录推断目标；重复元数据名字被忽略。旧版blocker仍能阻止一些写入，不能将所有失败称已绕过写入/远程执行或P1。
- 最终新增12项与GEMS清单/XML回归定向 **32/32**（oiv-plan-current.log）、核心 **417/417、0跳过**（core-tests-oiv-plan-current.log），build-oiv-plan-current.log通过，原Framer非阻断提示不变。
- 实际自建OIV ZIP/CRC解压/assembly元数据和文件，支持add正确路径；额外recursive/if/replace、condition子节点明确blocked、目标空；OIV+GEMS双清单blocked且真实显示方法/不採用GEMS名称，未知archive不留推断目标、重复metadata拒绝，重复源/目标/缺源保护。所有原包字节保留，无程序/脚本执行。
- 声明2.2/Five头实际有限解析，mod metadata主/次3/4及测试标签组成真实3.4版本，不用包格式2.2冒充mod版本或Enhanced支持；其他game/未知包版本/额外execute阻止，坏/负/分数版本拒绝。共享XML快照有效UTF8/4MiB/单链接/身份与实际SHA，坏UTF8/超限/硬链接/摘要差异拒绝、原字节保留；后续缺源不部分改目标及20001操作拒绝。JSON原12项均共用快照回归通过；所有大枚举是结构/元数据夹具，非真实包容量压力。
- 查阅OpenIV团队公开格式2.2资料核对字段边界（链接见OIV_PLAN.md），未复制/打包第三方实现或文档正文，没有新依赖/授权。仍不执行OpenIV程序，不实现完整OIV标准/RPF/条件/格式转换，不算作者实际包/游戏测试。
- 原Electron3077未有解除验证，本轮不再次启动、不换父进程/改名/改策略，未运行本版IPC/UI/布局/最终EXE，没有新图或声称历史UI升级。
- 07:11香港时间E盘只读manifest/版本/进程：ready/build25261616、99890851584字节下载完、1.0.1158.16/running=false，game-environment-current.json。没有游戏写入/启动/组件或Steam/安全变更。
- 43项生产许可/开发链8moderate历史范围保留，未复制第三方资源，只有公开资料查阅而非新网站商业权利或MOD下载。source-only、commercialReady=false/fullRequirementsPassed=false，原全部资源/转换/DLC/助手/网站/可信发行及可靠性缺口保留。

## 0.1.36 数据库打开快照（2026-10-13）

- R41/P2初始8项1通过/7失败（database-open-snapshot-initial-failure.log）。旧版同长度外部写/路径替换、已有硬链接被读取，SQL异步初始化期间更改/删库/日志/链接出现仍返回旧快照；稳定合法库不改原文已有测试通过。未证实P1数据覆盖/远程执行，原保存时哈希与日志保护并未因此失效。
- 修复后新增8项与既有数据库准入/并发定向 **26/26**（database-open-snapshot-current.log），最终核心 **405/405、0跳过**（core-tests-database-open-snapshot-current.log），build-database-open-snapshot-current.log通过，Framer原非阻断提示不变。
- 真正SQL.js数据库先建立old/new等长度且不同的合法导出；原地改写、路径重命名后新文件、硬链接及SQL初始化期间更改/日志出现/删除/新增硬链接拒绝，源/新文件/旧移出文件/日志字节均保留、删除路径不重建。正常打开get读取真实old值，不改磁盘。注入只在本测试进程的read/close边界，初始化修改通过microtask真实文件操作，不替换Store回复；不是独立外部进程压力或实际断电。旧版本意外返回Store时测试只释放WASM，不调用会保存的close，防止测试改变原外部证据。
- 首读独立普通文件/容量/读取完整与fstat/lstat纳秒身份，初始化返回前重新核对日志与当前SHA；提交哈希读取额外拒绝非普通文件/多链接并复核路径。观察到变化拒绝不是原生锁/完全TOCTOU或权限认证；其他document内容准入、自动恢复/迁移和真实容量压力仍待完成。
- 原Electron3077未有解除证据，本轮未再启动/换父进程/改名/修改策略，未跑本版IPC/UI/布局/最终EXE。本版编译及405不算桌面或游戏验收，历史UI截图不升级当前结论。
- 06:39香港时间E盘只读：ready/build25261616、99890851584下载完成、1.0.1158.16/running=false，game-environment-current.json。未改/启动游戏、安装组件、Steam设置或系统安全。
- 无新依赖、第三方材料、公开请求/商业许可或签名，43项生产许可与开发链8moderate按历史范围保留；source-only、commercialReady=false/fullRequirementsPassed=false，原完整功能/资源/转换/DLC/助手/网站/可信发行及可靠性缺口保留。

## 0.1.35 GEMS清单准入与映射（2026-10-13）

- R40/P2，gems-manifest-initial-failure.log初始8项3通过/5失败：空/坏元数据被接受或忽略、异常来源保存、坏对象/操作抛技术错误、超操作数无明确门禁。旧有重复/路径/正常包保护不是新增漏洞；未确认XSS/远程执行、密码上传或P1。
- 最终新增12项，core-tests-gems-manifest-current.log **397/397、0跳过**；build-gems-manifest-current.log通过，Framer原非阻断提示不变。gems-manifest-current.log为最后加摘要测试前11/11，不将该日志改说12；第12项同长度变化/旧摘要/大小写摘要/坏摘要在最终全量通过。
- 初始附加容量夹具把20k长映射JSON写超1MiB，gems-manifest-capacity-fixture-failure.log10/11；生产正确拒绝。改短路径保留1MiB上限，20k元数据FileEntry映射只读path一次并实际正确绑定目标。它是算法/元数据容量夹具，不是20k物理文件/IO或内存峰值压力。
- 真实自建目录/文件/gems.mod.json扫描，正常名称/作者/版本/来源，严格类型/长度/控制字符、HTTPS/凭据/坏URL、null/错误版本/列表和操作格式、20001操作、重复源/目标/非法路径、大小写匹配和缺源均核验。原包内容不改，不执行unknown run字段；硬链接/坏UTF8/超字节、读取中变化拒绝且原数据保留；缺失后续映射不部分改写推断目标，摘要不同即使长度相同拒绝。不接SQLite/IPC/UI或实际游戏安装，不把helper正确当完整安装实测。
- 沿用0.1.34原Electron被3077阻止的未解除证据。本版没有再次启动、换名/换父进程/改策略，桌面与最终EXE未验证；没有本版新UI图，不引用历史布局作为当前版本验收。
- 06:10香港时间E盘只读manifest/版本/进程：ready/build25261616、99890851584字节下载完成、1.0.1158.16/running=false，game-environment-current.json，无游戏写入/启动/组件/Steam或系统安全变更。
- 无新依赖、作者材料、公开请求、第三方商业许可或签名；43项生产许可和开发链8moderate仍按历史范围保留。source-only、commercialReady=false/fullRequirementsPassed=false，完整资源/转换/DLC/助手/网站/发行与可靠性缺口不变。

## 0.1.34 通用XML准入（2026-10-13）

- R39/P2初始6项3失败/3通过（scanner-xml-initial-failure.log）：中文按字符、65层和超50000元素被接受；语法/DTD拒绝与正确文本等旧行为已有保护。scanner-xml-current.log修复后的最初6/6；再加2项实际文件/OIV测试，最终core-tests-scanner-xml-current.log **385/385、0跳过**，build-scanner-xml-current.log通过，原Framer提示不变。无实际OOM/内存峰值或P1结论。
- 新增8项：UTF8字节、65层、50001元素拒绝，恰64层/50000元素保留实际内容，评论/CDATA/PI中70伪标签与引号内>不误计数，坏结构/未完声明/DTD/实体拒绝；真实隔离vehicles.meta超深只警告且spawn为空/源不改，真实自建OIV ZIP深层metadata拒绝并保留原包/原缓存/失败原因。不算作者MOD或完整资源适配。
- 桌面脚本test:scanner-xml-ui已编写（原IPC/真实ZIP和SQLite/批量/重启/布局，不伪造成功回复），但本次在首次electron.launch失败，未执行桌面场景/截图。scanner-xml-ui-current.json passed=false，scanner-xml-ui-current.log及scanner-xml-launch-policy.json记录Windows事件3077，2026-10-13 05:37:47香港时间阻止现有原Electron运行时。未重复失败启动、换名、换父进程或改安全策略；不能把385或编译当桌面/最终EXE通过。历史0.1.33UI证据仍只是历史版本。
- 05:37香港时间只读E盘：ready/build25261616、99890851584字节下载完、1.0.1158.16/未运行，game-environment-current.json，无游戏写入/启动/组件或Steam/安全变更。
- 无新依赖/第三方材料、公开请求、商业授权或签名；43项生产许可、开发链8moderate按历史范围保留。source-only、commercialReady=false/fullRequirementsPassed=false。当前原开发Electron也被禁止启动，本版UI和原完整游戏/转换/DLC/助手/网站/发行与可靠性缺口保留。

## 0.1.33 目录扫描条目限额与句柄恢复（10月12日实现，10月13日续验）

- R38/P2：旧遍历只按文件计数，空目录无界；readdirSync一次分配目录数组。scanner-walk-initial-failure.log初始1/5通过、4失败，其中深度仍能拒绝，句柄与读取故障测试是新流式接口保护，不是四个独立旧漏洞。修复后scanner-walk-current.log5/5，最终core-tests-scanner-walk-resumed.log **377/377、0跳过**。
- 原core-tests-scanner-walk-current.log缺最终结论且原执行会话不可续，保留为中断/不完整证据，不能算通过。恢复后适当重复全量确认。build-scanner-walk-initial-type-failure.log记录测试mock声明readonly/重载类型报错，修正测试类型访问/断言，不放宽生产安全条件；build-scanner-walk-current.log最终通过，原Framer非阻断提示不变。
- 新增5项：实际中文嵌套目录/文件大小、整目录readdir拒绝而流式通过、虚拟40001空目录枚举触发全局40000限额与关闭计数、实际子目录原生读取故障关闭父子句柄并保留文件、实际65层拒绝且全部已打开句柄关闭。枚举预算测试替换迭代器并缓存固定祖先/模拟不存在虚拟子目录，仅核验算法上限，不冒充40001物理目录或Windows压力；其他场景走真实路径核对。
- scanner-walk-ui-current.json/log：实际Electron/原IPC/真实目录文件与SQLite，明确第二次原生readSync故障及选择路径边界注入；失败无import成功记录、失败工作区仅failure.txt/空contents、所有故障句柄关闭，同批正常包实际缓存成功，解除故障后手动重试/退出重启保留两份实际记录，mods/transactions均0，源文件未改。深色错误及浅色1024重试截图ui/scanner-walk-*.png已目视，键盘关闭和无横向溢出通过。非作者MOD/游戏/最终EXE验收。
- 10月13日05:33香港时间只读E盘manifest及游戏文件版本/进程：ready/build25261616、99890851584字节下载完成、1.0.1158.16/未运行，game-environment-current.json。无游戏写入/启动/组件安装/Steam及系统安全变更。
- 没有新依赖/网络请求/作者材料/商业授权，43项生产许可与开发链8moderate历史范围保留。source-only、commercialReady=false/fullRequirementsPassed=false，原完整功能/网站/资源转换/DLC/助手/可信发行及可靠性缺口保留。

## 0.1.32 handling属性定位完整性（2026-10-12）

- R37/P2初始4项全失败：handling-attributes-initial-failure.log。双/单引号作者属性内伪value、同原值提交误改作者内容、重心多轴伪坐标复现，未修改输入或游戏。
- 修复后定向38/38（handling-attributes-current.log），最终核心 **372/372、0跳过**（core-tests-handling-attributes-current.log），build-handling-attributes-current.log通过，原Framer非阻断提示不变。新逻辑解析开标签实际属性边界、完整跳过引号值，保留所有其他内容；仍以真实XML回读确认输出。
- handling-attributes-ui-current.log与handling-history-ui-current.json为0.1.32：实际Electron原IPC，明确XML夹具带作者伪value且含>，质量1500→1600真实保存，逐字比较输出只改实际value，源/原文快照/报告/SHA保护与副本核验、损坏拒绝/重试、退出重启、键盘/双主题小窗通过；quotedAuthorAttributePreserved=true，图ui/handling-history-dark.png及light-1024.png已目视。仅原生选择边界注入路径，不替换IPC或后端结果。没有作者真实MOD、游戏效果、Windows所有DPI或最终EXE结论。
- 22:13香港时间只读E盘：部署就绪/1.0.1158.16/running=false，game-environment-current.json。无游戏写入、启动、组件安装、Steam或安全策略变化。
- 无新依赖/公开网络请求/第三方材料或商业许可，43项生产许可和开发链8moderate仍按历史范围。源码交付，commercialReady=false/fullRequirementsPassed=false；原网站全自动/转换/DLC/助手、真实游戏与可信发行/可靠性缺口保留。

## 0.1.31 车辆配置副本历史与内容核验（2026-10-12）

- 新增12项、最终 **368/368、0跳过**，core-tests-handling-history-current.log；handling-history-current.log12项，build-handling-history-current.log通过，原Framer非阻断提示不变，无新依赖。
- 真实独立副本/报告/原文/SHA只读、空历史不创建数据、无效UUID/尾部换行在读取前拒绝；原文/输出变化、更新摘要仍有额外修改、伪造before/重复/错误轴拒绝；外部私有路径实际监测零读取，文件连接/硬链接与目标原文保护、缺/坏/大/状态不支持报告、坏UTF8/超4MiB、输出读取后报告变化的最终身份检查。101真实副本/1102条目验证100展示/1000读取的实际限额，全部原数据保留。无原生锁/断电/作者来源或实际游戏资源结论。
- handling-history-ui-current.json/log：实际Electron/原IPC，空数据→编辑器实际读入/保存→历史初始未核验→读取真实文件核验；原报告/快照/输出不改，修改输出后拒绝SHA不符/标核验失败，刷新移除旧成功、修正后重试、空失败目录报告异常/模型日期数量未确认且禁用、Tab/Esc/焦点恢复、实际退出重启仍须重新核验。原生选择仅注入明确隔离XML路径，不替换IPC或核验回复；mods/transactions仍0，未绑定/写游戏。
- 目视稳定深色1440/浅色1024/损坏提示ui/handling-history-*.png，长路径/哈希换行、滚动、关闭/底部控件可见；数字车库工具栏小窗也检查无水平溢出。未补Windows所有DPI/多显示器。12项和UI均为明确XML夹具，不代表作者MOD、Enhanced模型或最终签名EXE验收。
- 核验重建预期XML并检查真实前后数值，不仅信任报告哈希；但报告可改、无来源认证，攻击者同时使原文/输出/报告自洽不能据此证明真实来源或原包未改。列表报告格式≠文件核验，内容一致≠游戏兼容/效果；成功带时间并在刷新/重启清除，非实时监控。
- 21:43香港时间E盘只读：Steamready/build25261616/99890851584字节完成，1.0.1158.16/running=false，game-environment-current.json。未联网请求受限API、未安装/启动游戏或组件、未改系统/Steam策略和游戏文件。
- 43项生产许可/开发链8moderate历史范围保留，无新第三方材料/授权。source-only，commercialReady=false/fullRequirementsPassed=false；车辆游戏应用/音效/RPF/转换/DLC/助手/完整网站下载与可信发行、原生可靠性等原完整终验缺口不变。


## 0.1.30 下载文档准入与启动保护（2026-10-12）

- R36/P2，初始7项全部失败，download-admission-initial-failure.log；实际Store/null/坏JSON与启动SQL拒绝复现异常/部分整理风险，不是远程代码执行证据。修复后新增12项，最终 **356/356、0跳过**，core-tests-download-admission-current.log；download-admission-current.log12项，build-download-admission-current.log通过，原Framer非阻断提示不变。此前355为新增入队前拒绝测试之前结果，当前以356为准。
- SQL层限制跨入JS的行容量/类型，JSON结构/字段核对；10001条历史、约18MiB合法文档文本超合计限额、31条未完成历史等真实SQLite夹具停止自动整理、原DB字节/文档不改。null、原始坏JSON、超大/超深/类型/状态/时间/路径/公开元数据、原标识不匹配拒绝；正常旧记录/未知附加字段保留。日历无效日期拒绝，失败记录可能超限接收一个块的计数真实保留。校验不是文件内容/报告引用或完整数据库模式覆盖。
- 正常未完成记录一次writeBatch提交，第二条SQL触发拒绝整批回退，不抛出应用启动异常；新异常出现后列表与新入队前拒绝，不先创建新排队记录。启动、报告通知、重试入口去掉原始list/get旁路，避免仅修服务而桌面仍解析坏数据。原生文件锁、断电与所有文档类型未因此实现。
- download-admission-ui-current.json/log：实际Electron5场景（null、坏JSON、启动整理触发拒绝、正常、全部不可展示）、原IPC/真实本地INI导入/设置、退出重启、原生SQLite逐字比较异常download JSON仍与基线一致；正常改变为已中断并保留额外字段。服务停止时取消禁用、无执行进度条、显示历史状态，不把不可展示记录说成空队列。深色1440/浅色1024稳定动画图已目视检查ui/download-admission-*.png，中文提示/布局正常。均为明确隔离夹具，无HTTP/游戏操作，未替换IPC成功回复。
- 健康队列集成回归test:download-retry-offline-ui在0.1.30通过，实际ZIP/SHA/安全扫描/报告/重启和原生SQLite原记录保护保留，网络只是明确HTTP/DNS夹具；没有重复0.1.29已拒绝的公开请求，不称公网新功能通过。
- 21:12香港时间E盘只读后端：Steamready/build25261616/99890851584字节完成、1.0.1158.16/running=false；game-environment-current.json更新。没有游戏写入/启动/组件安装/故事模式或系统/Steam策略更改，不重试被阻止发行程序。
- 43项生产依赖许可与开发链8moderate按历史范围保留，无新依赖/商业授权。交付source-only，commercialReady=false/fullRequirementsPassed=false；下载修复不替代资源/转换/DLC/助手/全网站自动化/可信发行或原完整终验。


## 0.1.29 下载记录手动重试（2026-10-12）

- 新增11项、最终 **344/344、0跳过**，core-tests-download-retry-current.log；download-retry-current.log11项通过；build-download-retry-current.log通过，原Framer非阻断提示不变。无新依赖。
- 实际临时SQLite/ZIP/哈希/安全扫描与记录：新任务/原包和失败记录不改、分支进行中/已分析重复拒绝、取消/中断重试、关联丢失/旧无标识拒绝、队列保存SQL拒绝无新记录/请求、重开不自动下载。公开目录重新核对/新地址、名称/来源/版本/声明大小/摘要变化、删除/无效来源/取消和读取失败均拒绝。读取响应为明确隔离目录，不是作者实际包或游戏证据。
- 初始10/11：重启测试保留旧Store后打开并写入另一实例，退出旧Store正确拒绝外部变化，并非重试功能失效；download-retry-initial-failure.log保留。修正为先关闭旧实例再重开，定向11及最终344通过，未放宽生产数据库保护。
- 真实公开GitHub尝试在首次API读取被访问/额度限制拒绝：download-retry-ui-public-blocked.log，download-retry-ui-current.json为passed=false；未产生下载/扫描/游戏操作，未重复同一请求或改身份/认证。不能把历史公开下载当本功能新验收通过。
- download-retry-offline-ui-current.json/log：实际Electron/原IPC/完整后端/真实160B ZIP及1文件扫描、作者摘要比对、目录首次故障反馈再手动重试、重新读取后新任务、当前来源空不误换模组、原失败记录完整保留、旧无标识禁用/原因、报告入口、真实退出重启与原生SQLite只读检查、深色1440/浅色1024通过并目视检查ui/download-retry-*.png。网络HTTP/DNS传输响应为明确夹具，只在测试进程，不替换UI或IPC成功回复；publicNetwork=false，不能称TLS/公网/作者MOD或游戏实测。
- 后端新记录仅公开发布元数据与关联，JSON可选字段不改SQLite表/schema；重试不存下载URL或令牌，沿用已有来源/API/下载安全策略，不执行包内程序。无自动重试、断点续传、残留清理或所有站点下载新能力。
- 20:41香港时间E盘后端只读复核：Steamready=true/build25261616/99890851584字节完成、实际1.0.1158.16/running=false；记录game-environment-current.json。没有游戏写入/组件安装/启动/故事模式、签名策略修改或再次失败EXE尝试。
- 本轮source-only，完整功能、网站商业许可、43项依赖许可/开发链8项moderate、可信发行和转换/DLC/助手/实机/原生可靠性缺口保留，commercialReady=false/fullRequirementsPassed=false。


## 0.1.28 桌面车辆配置副本编辑（2026-10-12）

- 新增8项会话/草稿测试；最终核心 **333/333、0跳过**，core-tests-handling-ui-current.log；定向22项handling-ui-core-current.log。构建最终通过build-handling-ui-current.log，原Framer非阻断提示不变，无新依赖。
- 后端真实普通UTF8/BOM文件、前后读取身份/大小/时间复核、容量/硬链接/无效编码拒绝、会话ID/模型/修改验证、外部后改输入不覆盖、打开失败保留旧会话、返回对象变更不污染原值；草稿仅实际字段/轴，空串/NaN/Infinity/超容量/挡位拒绝。不是本地竞态/断电/物理合理调校证明。
- handling-editor-ui-current.json/log：真实Electron/原IPC/本地XML与输出文件、13组场景，20字段/重心三轴逐项通过控件修改、实际保存回读，原文件不变/快照/SHA/报告、重复保存禁用、多模型/放弃草稿、损坏输入、本地保存错误/清理/重试、Tab/Esc焦点、关闭迟到结果和重启文件/旧会话检查。文件选择路径/取消/延迟为原生对话边界注入；报告故障只在自有测试进程，未伪造安装结果。所有XML均隔离夹具，非作者包或游戏效果。
- 目视检查1440深色、1024浅色/中文长文件名/滚动/报告及120%应用缩放，ui/handling-editor-*.png。输入样式统一主题。最初缩放截图使用CSS像素853×640而Electron内容缩放，造成截图裁切；不能仅据此认定实际窗口缺陷。已限定面板到可用区域并增加viewport几何/关闭/底部控件断言，换Electron原生1024×768捕获核验全部可见，初始截图保留；不称Windows各DPI或多显示器终验。
- 初始全量332/333：Windows进程命令达到10秒截止，按生产规则先加“进程未知”证据，旧测试错误假定第0项一定是Steam；core-tests-handling-ui-initial-failure.log保留。改测试按真实组件名称断言，并要求未知进程有证据，未改生产安全守卫。定向environment11项通过后最终333/333。初始UI脚本误用ElectronApplication不存在的waitForFunction且退出未释放选择Promise，只终止已核对身份的自有测试进程树；已改检查/释放未决选择，完整脚本通过，未终止用户游戏/窗口。
- 18:06香港时间后端只读E盘，安装记录就绪、1.0.1158.16、running=false，artifacts/game-environment-current.json；桌面开发版快捷方式-VerifyOnly通过。没有游戏写入、组件安装/启动/故事模式验证，未重复受Device Guard拦截的发行启动。
- UI副本功能已测试，完整车辆参数游戏应用和原需求仍未终验；音效/RPF/事务应用/真实资源和游戏验证保留。43项生产许可、开发链8项moderate及网站商业许可/签名授权缺口不变。交付source-only，不把333项当全功能测试覆盖率。


## 0.1.27 handling配置读写与副本引擎（2026-10-12）

- **新增14项、核心325/325、0跳过**，core-tests-handling-current.log；build-handling-current.log最终构建通过，原Framer提示不变。此前322/324为补BOM/声明/全部字段和导出失败前的中间结果，最终以325为准。
- 11项解析/编辑覆盖20个声明支持的字段逐项实际XML读写、重心多轴与多模型选择、原文其他字节/作者字段/子配置/换行/引号/注释/BOM保护、类型/结构/DTD/CDATA/非法数值/挡位/未知字段/重复修改/缺字段拒绝、作者属性带value后缀不误定位、非UTF8声明拒绝。3项真实副本测试含独立UUID/原文/哈希/报告、验证失败不创建目录、报告写入拒绝清理本次文件并保留先前副本。均为明确隔离XML，不是作者真实MOD/Enhanced文件验证。
- handling-cli-current.json/log实际Node CLI子进程读/改/导出，输入及快照BOM字节/真实SHA一致、输出回读数值变化，原文件不改；自身临时输出按验证路径清理。输出目录加入源码排除规则，不分发作者/用户配置。CLI是开发工具，不是桌面编辑UI或普通用户安装器功能，installed=false/gameWrites=false。
- 完整车辆参数页面、单位换算、加密RPF handling、安装事务/恢复与单机实机效果没有验收，当前仍开发中；没有给出精确马力/极速或伪装游戏已生效。参考公开接口只确定字段关系，不集成在线框架或继承第三方代码，不作为Enhanced兼容证据。
- 本轮不新增游戏写入/组件安装/公网下载，不重复无改动桌面/游戏启动。最近实际环境记录1.0.1158.16安装就绪、未运行；本轮配置输入为隔离临时目录。签名发行与完整功能缺口保留。
- 用户再次明确全部承诺功能逐项测试后才可销售，并选择未来网站VIP获取软件下载资格/账号或口令，暂不提供签名信息。商业服务未实现、当前未通过可信签名发行启动/安装或全部功能终验；密码销售方式不能代替验收。依赖43项与开发链8项moderate沿用历史范围，未增加依赖/许可。

## 0.1.26 总下载时限与SHA边界（2026-10-12）

- **新增10项、核心311/311、0跳过**，core-tests-download-timeout-current.log；download-timeout-current.log10/10，build-download-timeout-current.log最终构建通过，原Framer提示不变。此前310是补清理拒绝前的中间结果，最终以311为准。
- download-timeout-initial-failures.log原8项中7失败：总时限误取消/原因遮蔽、超时后正常后包、取消抢占已超时原因、失败状态SQL拒绝不停止、持久化错状态，以及大写/混合SHA。用户先取消这一项原先通过。实际临时Store/PassThrough/ZIP/scanner，30分钟定时只在当前测试进程改40ms，生产时限未改变；迟到回调用相同生产回调验证，不是实等30分钟的公网压力测试。
- 新增非字符串摘要边界，第一次夹具调用把undefined改为默认null，8/9失败点属于夹具未注入非法值，download-timeout-fixture-initial-failure.log和core-tests-download-timeout-fixture-initial-failure.log保留；改为显式字段覆盖后通过。检查拒绝时无保存/网络/幽灵排队记录。GitHub解析原先已规范为小写，大小写缺陷在Downloads输入契约中，未宣称现有来源都受影响。
- 补清理权限故障时，本轮首次修复只保留timeout、遮住EACCES，download-timeout-cleanup-initial-failure.log保留。最终超时理由加附加错误，实际partial残留且没有报告；正常路径删除partial。通用ABORT_ERR仅保留中文超时，原取消先因不变。失败SQL拒绝保留下载中/排队物理基线、立即停止，后包未创建目录；重启保存拒绝的任务仍按原中断处理。
- download-timeout-ui-current.json/log实际Electron读取真实后端离线种子：超时失败/中文原因、正常第二ZIP的大写作者SHA及一条真实扫描报告、报告文件清单、关闭重启/原生SQLite只读/原包哈希核对。深色1440、浅色1024最终截图已目视检查，无横向溢出；未替换IPC/渲染数据。显示的fixture-author网址未访问，不把离线流说成公网下载或真实30分钟等待。UI在补附加清理错误分支之前通过，最终通用ABORT_ERR分支行为不变且核心再次覆盖，未重复整套UI。
- 16:58香港时间E盘只读：安装就绪1.0.1158.16、valid=true/running=false，StateFlags4、buildid/TargetBuildID25261616，下载99890851584/99890851584、部署103219693669/103219693669。game-environment-current.json与game-deployment-download-review-current.json留证；没有游戏/Steam/安全策略写入或故事模式/助手测试。
- 没有新增依赖/网站授权；43项生产许可和开发链8项moderate为历史证据。source-only源码CRC/逐文件SHA核验，无可信签名EXE/安装器；全库搜索/下载、Nexus、商业授权、转换/DLC/助手及原生锁/断电/压力等仍未终验，软件不自动安装下载包。

## 0.1.25 站点规则解析与有界匹配（2026-10-12）

- **新增14项，核心301/301、0跳过**，core-tests-robots-current.log；robots-current.log定向14/14，build-robots-current.log最终TypeScript/Vite/Electron构建通过，原Framer指令提示不变。
- robots-initial-failures.log原13项中12失败：空Disallow没有结束分组、子串产品匹配、CR换行、UTF8/百分号/编码分隔符、查询字符串、字面星号/美元、锚定长度优先、原64KiB不足500KiB、非法字段/控制字符/无结构内容、规则/计算限额、目录服务异常规则。复杂28通配符旧RegExp在自有测试子进程2500ms内未完成，被execFileSync超时终止；修复后正常返回。只终止本轮夹具进程，不是软件原生故障恢复或性能SLA/压力验收。
- 另补一项真实本地流集成，规则MIME错误/Access Denied不发目录请求且不缓存；修复后手动重试重新读取正常text/plain规则，合法空规则可用。规则文件读取上限512KiB、项目/模式/URI/计算超限明确拒绝，完全不按截断/部分规则放行。参照RFC9309匹配要求；异常行更严格、扩展规则未完整实现，不能宣称协议认证。测试数据是自有离线文本/流，不把它冒充网站授权或真实爬虫大量运行。
- 加入MIME检查后旧预览容量夹具把robots响应也标为text/html，37/38中此项拒绝，robots-fixture-mime-initial-failure.log保留；只修正夹具头为text/plain，容量断言保持，没有放宽生产MIME验证。客户端身份抽取到client-identity.ts，实际User-Agent仍GEMS-Mod-Studio，不改名或模拟其他爬虫。
- catalog-alias-live-current.json与catalog-alias-live-robots-current.log实际Electron/IPC/HTTPS：真实站点规则与分类读取成功，20条奔驰目录、迈巴赫实际筛选3条，共用缓存返回各自正确查询，没有伪造回复或错页告警；本轮未复跑完整下载/刷新/主题链路。截图为目录/布局证据，不宣称所有作者图片完成；作者图片背景本机保存、源码排除。
- 16:28香港时间只读E盘：1.0.1158.16、valid=true/running=false、安装就绪，StateFlags4、buildid/TargetBuildID25261616，下载99890851584/99890851584、部署103219693669/103219693669；game-environment-current.json与game-deployment-robots-current.json留证。未写游戏/Steam/系统安全、未启动故事模式或安装组件。
- 无新依赖/商业许可；43项生产许可与开发链8项moderate按历史证据保留。源码CRC/逐文件SHA和source-only清单交付，无可信签名EXE/安装器；全站搜索/下载、Nexus、商业站点/图像授权、转换/DLC/助手和并发/断电/压力等仍未终验。

## 0.1.24 目录缓存一致性、过期和共享取消（2026-10-12）

- **新增12项、核心287/287、0跳过**，core-tests-catalog-cache-current.log；定向catalog-cache-current.log12/12。R31缓存10项：catalog-cache-initial-failures.log原代码9项失败，正常刷新失败保留缓存这一项原先通过。涵盖奔驰/迈巴赫相同URL缓存及并发查询、独立条目副本、五分钟边界/无过期图片请求/重读恢复、同目录后续页失效且保留其他目录、新元数据优先、失败刷新保留、时钟回退、图片途中条目过期/换图拒绝。时钟仅本测试进程Date.now局部替换并finally恢复，不更改Windows时钟；预览封装为离线小PNG，不称真实模型或图片渲染。
- R32共享取消2项：catalog-shared-cancel-initial-failures.log原共享等待路径两项失败，取消后仍pending。接入awaitAbort后取消立即结束该调用方等待，首调用流未中止，迟到成功/失败均消费并保留取消结果；真实本地PassThrough流，非公网中断/取消所有OS操作。首调用方仍驱动底层请求与截止，不承诺独立共享请求生命周期。
- 构建首次被新增测试夹具类型阻止：pendingResponse被声明IncomingMessage却使用PassThrough.end，build-catalog-cache-initial-failure.log保留。修正交叉类型后最终TypeScript/Vite/Electron构建通过build-catalog-cache-current.log，原Framer提示不变；没有把仅运行时测试通过当作首次编译通过。
- catalog-alias-live-current.json/log实际Electron/IPC/HTTPS，无回复替换：奔驰/迈巴赫同一真实分类页面20条，返回查询分别正确，缓存观测相同；UI从这20条真实数据得到3条迈巴赫，没有错页告警。该截图只验证元数据/布局，图片当时仍在读取，不声称此处图片成功。catalog-refresh-live-current.json与catalog-refresh-live-cache-current.log另复测真实兰博基尼20+20=40条→刷新20条/1页、实际作者图片解码与深浅小窗口。仅受影响路径，不重复全部网站/下载安装。作者截图本机留存并从源码排除。
- 15:58香港时间只读E盘后端与清单：安装就绪、1.0.1158.16、valid=true/running=false，StateFlags4、buildid/TargetBuildID25261616，下载99890851584/99890851584、部署103219693669/103219693669字节；game-environment-current.json、game-deployment-cache-current.json留证，无Steam/游戏或系统安全写入，没有故事模式/助手实测。
- 无新增依赖或商业授权，43项生产许可与开发链8项moderate沿用历史记录；source-only源码CRC/逐文件SHA核验，无可信签名EXE/安装器。全站搜索/直接下载、Nexus、商业站点/图像授权、转换/DLC/助手、原生锁/断电/大库/压力等仍未终验；缓存修复不是全网一致索引或图片像素持续刷新。

## 0.1.23 来源对话框异步故障（2026-10-12）

- R30/P2：catalog-dialog-initial-failures.log保留旧代码5/5失败，错误显示在inert背景而非窗口、等待期间未锁按钮、迟到成功误关闭第二个窗口、失败重试反馈和焦点不符合预期、迟到错误污染新页面。修复后catalog-dialog-ui-current.json/log5/5通过：实际Electron新沙箱渲染真实CatalogBrowser，目录与来源Promise是可控离线测试夹具；不代表公网或OS浏览器真实启动。
- catalog-dialog-ipc-current.json/log单独走真实产品界面、真实HTTPS20条目录与实际IPC/条目来源校验，只在自有Electron进程替换shell.openExternal为明确拒绝的OS边界故障。错误在可交互对话框内可见；两次重试使用同一已验证HTTPS作者URL；Tab/Esc/关闭/焦点恢复通过，深色1440与浅色1024无横向溢出且最终截图已目视检查。没有替换目录/IPC回复，也没有实际打开外部浏览器；作者预览背景截图只留本机，从源码归档排除。
- TypeScript/Vite/Electron构建通过build-catalog-dialog-current.log，原Framer提示不变。本轮只修改renderer来源对话框和测试/文档，未改core/scanner/installer/network；不重复无变化的全量核心/完整目录下载测试，最近核心275/275、0跳过是0.1.22记录，5个桌面场景不加入核心数量。成功请求后关闭在离线夹具验证；真实外部浏览器启动没有验收。
- 15:34香港时间只读inspectEnvironment及Steam清单仍就绪：1.0.1158.16、valid=true/running=false，buildid/TargetBuildID25261616，下载99890851584/99890851584、部署103219693669/103219693669字节。game-environment-current.json与game-deployment-dialog-current.json留证，没有启动/写游戏、安装组件或改Steam/安全策略。
- 没有新增依赖/网站授权；43项生产许可和开发链8项moderate沿用历史证据，不重新宣称安全认证。源码CRC/逐文件SHA核对与source-only清单交付，无可信签名EXE/安装器；签名身份、商业站点/图片许可、全库搜索/自动下载、Nexus、转换/DLC/助手、真实故事模式及并发/断电/压力仍未终验。

## 0.1.22 目录分页、刷新和失败重试（2026-10-12）

- **新增10项，核心275/275，0跳过**，core-tests-catalog-paging-current.log；TypeScript/Vite/Electron构建通过build-catalog-paging-current.log，原Framer模块指令提示不变。catalog-state-current.log定向10项覆盖第一页失败、第二页失败/原页重试、刷新失败、清空旧结果、非粘滞refresh参数、迟到成功/失败、重复ID更新、错页/分类拒绝、20页/末页和不修改输入。
- R29/P2：catalog-paging-initial-failures.log保留旧代码四项失败：无原页重试入口、多页刷新仍请求第二页、等待期间按钮未禁用、重复ID保留旧版本。实际Electron新沙箱窗口渲染真实CatalogBrowser，读取响应为可控离线夹具，测试不导入产品、不模拟真实网站。修复后catalog-paging-ui-current.json/log四项全部通过；夹具只用于异常状态证据，不能替代后台、公网或游戏测试。
- catalog-refresh-live-current.json/log另行使用真实桌面/IPC/HTTPS，没有替换回复：兰博基尼第一页20条、第二页20条、合计40条；重新读取立即清空网站卡片，成功后20条/已载入1页，与后台当次条目一致。实际作者图片由Chromium解码；深色1440与浅色1024无横向溢出、无未处理页面错误，最终截图已目视检查。仅复测本次受影响翻页/刷新/主题，不重复上轮飞机/武器及全部下载安装；作者截图仍只留本机，从源码排除。
- 15:09香港时间只读inspectEnvironment/Steam清单：版本1.0.1158.16、valid=true/running=false，StateFlags4、buildid/TargetBuildID25261616；下载99890851584/99890851584字节，部署103219693669/103219693669字节。game-environment-current.json与game-deployment-paging-current.json留证。没有启动游戏、写E盘或改变Steam/系统策略；故事模式及助手仍未测试。
- 未增加生产依赖或第三方授权；43项生产许可和上轮审计结果是历史证据，本轮不重复审计或称已解决开发链8项moderate。源码归档与逐文件校验另见release清单；无可信签名EXE/安装器。跨页网站变动不是一致快照，全库搜索、全部站点自动下载、Nexus注册、商业展示授权及原资源/游戏/并发/压力终验缺口保留。

## 0.1.21 应用内真实目录与取消/背景读取修复（2026-10-12）

- **新增28项，核心265/265，0跳过**，core-tests-catalog-current.log：取消故障7、目录12、预览5、只读任务组4。此前254/259/263为中间实现记录，最终以265和本版代码为准。TypeScript/Vite/Electron最终构建通过build-catalog-current.log，保留原Framer指令提示；CSS压缩后只复测构建/视觉，随后补PNG动画/结构和异常下载量/评分边界，再运行受影响核心。最终统计的265为这些修改之后的完整结果，没有把重复运行增加到数量中。
- R27/P2：旧cancel先abort/改任务再put，SQL/rename拒绝没有同步停止服务。download-cancel-initial-failures.log记录7项中5项失败；修复后download-cancel-current.log7/7。覆盖活动/排队取消保存拒绝、物理rename拒绝、真实外部Store提交、正常流取消/partial清理/queued不启动、后续通知拒绝不覆盖首因。实际临时数据库与流，无公网或游戏文件；失败记录不能保存时保留下载中/排队基线并明确会话停止。
- catalog-live-ui-current.json/log实际Electron/IPC/HTTPS：GTA5-Mods20条兰博基尼、实际类型仅全部类型/汽车，无凭空轿车；20飞机、20武器；至少3张真实作者图片由Chromium解码为500×333。应用内真实名称搜索、无匹配空状态、下一页、类型与服务端数据一致、对话框Tab/Esc通过。GitHub合入和下载沿用已有后端；本轮没有新的GitHub实际文件下载或Nexus授权。
- 初次UI测试错误地要求每个标题含Lamborghini，实际LB Silhouette条目通过原站标签确认品牌；修正验证标签后继续，catalog-live-ui-initial-failure.log保留。随后图片失败确认站点.jpg实际是WebP（本机原始18876字节），preview分离并按RIFF/VP8/VP8L/VP8X和尺寸判断，拒绝动画/超限/截断/重复帧，catalog-preview-initial-failure.log保留。封装夹具不是实际渲染图片；真正图片解码由联网UI测量。
- R28/P2是在本版开发验收发现的图片独占门禁问题，非0.1.20既有目录功能。图片读取中设置被“已有任务正在执行”拒绝；catalog-read-lock-initial-failure.log和本机失败截图保留。ReadTaskGroup最多3读，不放宽OperationGate写互斥；4项独立测试与最终实际Electron主题切换通过，退出仍取消并等待读取。
- 首次通过后的1024浅色首屏图片过低，进一步压缩标题/筛选/工具栏，catalog-visual-live-current.json/log限定复测最终1024浅色首屏/1440深色与真实图片和主题切换，不重复飞机/武器等业务测试。两张最终图片均已目视检查：中文无裁切、无横向溢出，真实图片在首屏可见。作者预览截图只留本机，源码包排除catalog-live-截图、原始HTML和图片字节，避免把作者图作为程序内置资源。
- 页面4MiB/60项，最多20页、缓存24页/5分钟，图片1MiB/1024每轴，robots1小时，DOM不执行站点脚本，不放行CSP任意远程图片。目录限制、实际站点拒绝和资源版本未知不伪报成功。完整历史/性能/全DPI/商业授权/全部站点直接下载、真实游戏和最终签名EXE仍未验收。
- PNG按块检查动画控制、截断/完整结束和尾随数据，未实施完整CRC/像素内容鉴定，不能把它称为完整PNG验证；预览边界参考W3C PNG第三版、Google WebP容器规范。异常/缩写下载量和格式不明评分保留未知，不能把1.2K误读为12；普通实际网站字段解析不变。最后两项只影响这些分支，真实WebP目录UI证据继续保留，不重复全部公网业务。
- 新增Cheerio1.2.0/MIT；生产许可证原文43项已更新，dependency-production-catalog-current.json已知漏洞0；完整npm审计8项moderate在开发链，dependency-audit-catalog-current.json保留，未运行强制依赖升级，不把生产审计当全软件安全证明。14:43香港时间只读刷新E盘1.0.1158.16、valid=true/running=false，SteamStateFlags4/构建25261616/下载部署完成；桌面快捷方式目标再次核对。未改变Steam、安全策略或安装任何游戏组件。

## 0.1.20 下载完成记录关联提交（2026-10-12）

- R26/P2真实复现：下载先保存import报告，再保存download的已分析状态，第二步SQL/rename拒绝留下孤立报告；报告首次物理提交后独立子进程直接exit(73)，重开仍报告存在而下载正在扫描。download-atomic-initial-failures.log保留7项中5项失败；故障仅临时SQLite/自有子进程，未执行MOD命令或涉及真实游戏。
- **新增7项，核心237/237，0跳过**，core-tests-download-atomic-current.log。最终下载SQL拒绝、报告SQL拒绝及下一包成功、一次物理关联提交、最终rename权限拒绝且临时文件清理、另一真实Store外部提交保护、子进程落盘后非正常退出/重开、完成和失败记录均拒绝时停止队列。download-atomic-current.log定向7/7通过。原包真实ZIP字节保留，下载与报告引用一致，mods/transactions未生成。
- 实际Electron桌面读取/IPC/报告查看/关闭重启通过，download-atomic-ui-current.json/log，并以Node原生SQLite只读复核一条报告对应成功下载、失败无链接。种子是实际Downloads/scanner/SQLite、本地ZIP字节流和临时SQL触发器，后续界面无后端回复替换；这是离线持久化/显示集成，不是公网下载IPC链路，本轮不重复公网请求。真实SHA用于比较缓存原包，不能表示车辆或游戏兼容。
- 首次UI脚本错误地在报告页等待默认不显示的atomic.ini而超时，initial-failure.log保留；改为点查看文件并检查真实mods/atomic.ini后通过，不修改产品返回值。浅色初次截图处于动画过渡，保留download-atomic-light-transition.png；等待真实opacity=1后重跑受影响UI，最终深色1440×940/浅色1024×768均已目视检查，中文错误与成功状态、唯一报告入口正常，无横向溢出。
- TypeScript/Vite/Electron构建通过build-download-atomic-current.log，原Framer Motion指令提示不阻断。只修改完成记录关联保存，没有新生产依赖、迁移或第三方授权；桌面快捷方式仍指向同一工程，重开使用本次构建。不声称实际快捷方式启动、最终签名EXE/安装器、真实游戏或全部软件终验已通过。
- 原包/缓存文件与数据库未构成整体事务；16MiB关联JSON上限、旧孤立报告不自动修复、失败缓存清理/原生锁/断电/压力、签名/转换许可/RPF/DLC/助手和游戏实测阻碍保留。13:14香港时间后端刷新环境，E盘只读核对安装就绪、1.0.1158.16、valid=true/running=false；Steam构建25261616、下载/部署完成。桌面快捷方式-VerifyOnly再次通过，无正常用户实例启动或游戏写入。

2026-10-12 验收标准补充：新增 SOFTWARE_ACCEPTANCE.md，明确最终质量门槛及证据要求，链接至开发/商业发行说明；源码验证脚本要求归档包含该文档。本次未重跑核心或游戏测试，不增加核心通过数量，最近230项仍属于下面R25修复。用户随后提供游戏已关闭的新状态，补跑普通桌面回归，见下一节；本次另核验源码归档CRC与逐文件SHA一致性，结果见release/GEMS-0.1.19-source-verification.json。

## 0.1.19 桌面入口与游戏关闭后的回归（2026-10-12）

- 用户确认个人发布者、手动处理防火墙并关闭游戏。只读Steam记录仍就绪，实际程序版本1.0.1158.16；后端inspectEnvironment在05:00:43 UTC确认valid=true/running=false并刷新game-environment-current.json。没有启动游戏、修改Steam或防火墙规则。
- 新建scripts/create-desktop-shortcut.ps1，建立%USERPROFILE%/Desktop/GEMS（开发版）.lnk；实际COM读取核对现有Electron目标、绝对工程参数和工作目录，随后-VerifyOnly再次通过。入口使用正常用户数据；没有通过该快捷方式启动正常用户实例，本轮只验证链接目标与已有开发文件，不冒称正式程序安装/签名验收。
- npm run test:ui实际完成、退出码0，证据artifacts/desktop-acceptance-current.log：22页、深浅主题/缩放、临时游戏结构中的实际IPC安装与恢复、重新启用预览、覆盖取消、预览绑定、停用后卸载保护、RPF嵌套/提取取消/原文件保护、弹窗焦点/Esc/错误层级、真实SQLite重启中断恢复和外部修改保护、120个真实隔离安装事务的车库及搜索通过。游戏运行守卫未替换；测试数据目录独立，未写实际E盘游戏。这是开发运行时回归，不是商业EXE或游戏内验收。
- 本轮实际截图dashboard-1024.png与error-over-plan.png已目视检查，小窗口浅色中文没有裁切、错误提示层级和下层遮罩正常。没有据此声称全部DPI/多显示器、长期压力或真实车型渲染通过。
- 未改生产应用逻辑、依赖或版本号，增加验收约定与可重复创建的桌面入口；商业签名、转换授权/DLC/助手、并发/断电和完整发行门槛仍未通过。

日期：2026-10-12。平台为当前本机 Windows x64（构建工具报告 10.0.26300），Node.js 24.19.0、.NET SDK 8.0.425。独立新工程 `gems/`。当前 E 盘 Steam 增强版安装就绪，版本 1.0.1158.16，游戏已退出；初始 0.1.2 测试时尚在下载。所有“通过”仅限定为对应对象，**不是 Enhanced 游戏内验收**。当前回归见上面的0.1.20；后续保留历史记录。

## 0.1.19 来源关联文档原子保存（2026-10-12）

- R25/P2四项旧代码故障确认：新增/改名/读取source提交后remember失败，移除清空选择后DELETE失败。source-atomic-initial-failures.log保留4/4失败；旧0.1.18实际Electronsource-atomic-ui-initial-failure.log明确记录拒绝新增但收藏已出现、选择仍原值。SQLite触发器只在临时库注入指定语句失败，不模拟后端成功结果或改真实库。
- **新增10项，核心230/230、0跳过**，core-tests-source-atomic-current.log：四类SQL中断、一次真实rename/重开数据、最终落盘拒绝/整批内存和物理字节保留/临时清理、无效操作/重复/空字符/JSON序列化/数量/UTF8内容上限、另一真实Store提交后不覆盖、序列化回调不能改固定目标或追加操作。早期9/9定向source-atomic-current.log为固定目标补测之前的记录；最终10项以完整核心为准。中间实现回调改变输入导致目标变化的失败source-batch-serialization-initial-failure.log保留，修正捕获清单后完整通过。
- 实际Electron四组原IPC/SQL.js通过，source-atomic-ui-current.json/log：新增/改名/移除真实SQL拒绝仍保留原收藏与选择，健康保存/移除正常；四组全部关闭重启，并用Node原生SQLite只读再查两类记录。没有替换UI或返回值；无网站、登录、游戏写入。SQL触发器仅故障夹具，不当远程漏洞或合法安装游戏测试。
- 桌面日志和真实外部DB拒绝回归通过desktop-log-source-atomic-regression.log；desktop-log-ui-current.json为本轮最新复核，历史0.1.17源码归档保留旧证据。批量导入/告警仍正常，原生SQLite外部提交仍拒绝保存且不覆盖，不把原子保存改成强制覆盖。
- TypeScript/Vite/Electron最终构建通过build-source-atomic-current.log，原Framer Motion指令提示不阻断。深色1440×940错误对话框ui/source-atomic-refused-dark.png、浅色1024×768滚动后的原收藏表单source-atomic-preserved-light-1024.png已目视检查，无中文裁切/横向溢出。初次浅色图只拍到商店上部，增加等待真实原名称/滚动再核验；随后固定目标代码变化重跑受影响构建/核心/UI，不重复公网下载。
- 12:42香港时间后端只读刷新game-environment-current.json：1.0.1158.16、valid=true、running=true；Steam清单StateFlags4、构建25261616、下载/部署完成，PID9960。未进行普通安装UI、故事模式/助手、E盘写入、Steam/系统安全更改或未签名发行物重试。
- writeBatch为128项/JSON合计16MiB/标识1024字符的受限内存SQL事务和单次数据库副本提交，不是有效大库压力/原生跨程序锁/断电保证。仅来源关联保存接入；下载多记录和游戏文件跨事务、最终rename竞态、三通道告警持久化及商业签名/转换许可/RPF/DLC/助手/完整游戏终验仍阻碍。无新增生产依赖或第三方再分发，本版仅核验源码。

## 0.1.18 下载结果与日志告警分离（2026-10-12）

- R24/P2：旧版本日志硬链接拒绝后，实际原包/报告/import/已分析记录已完成，却被catch改成失败并halt。6项初始失败download-log-initial-failures.log含真实reportId存在但失败断言；没有公网或游戏夹具冒充。修复仅日志分离，关键数据保存/通知故障停止保留。
- **新增6项，核心220/220、0跳过**，core-tests-download-log-current.log：硬链接下两个实际ZIP/文件/SQL.js报告完成及哈希保留、坏ZIP原错误后合法包、取消真实数据流后下一包、日志SQL/文件追加故障仍已分析、修复测试日志路径后继续并清除告警。旧marketplace日志停止断言按新行为调整，仍验证不产生未处理拒绝、原错误及后续合法包；关键下载DB保存失败和通知失败的独立停止测试仍通过。
- 实际Electron原IPC/公开GitHub下载通过，download-log-live-current.json/log。指定发布包ScriptHookVDotNetEnhanced-v1.1.0.6.zip实际SHA256=f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a，16文件扫描；日志硬链接不改私人文件，状态保持已分析。三通道告警显示/JSON真实落盘、查看安装检查入口、重启原状态/哈希/报告保留，mods/transactions为0。新公网任务接收后立即取消（最终已取消），不是第二包完成；完整后续成功由隔离队列测试证明。仅导出文件选择器替换，无来源/TLS/IPC/scanner/游戏守卫替换。
- 最初深色截图在页面轮询前仍显示旧进度，保留ui/download-log-warning-poll-transition.png，不当最终完成界面。增加实际DOM两条终态等待及报告入口检查，重测此UI链路后通过；最终ui/download-log-warning-real.png、download-log-warning-light-1024.png已目视检查，已分析/已取消、中文告警、哈希、无横向溢出，滚动正常。为此只重跑受影响公网UI，没有重新整套核心或重复失败发行物启动。
- TypeScript/Vite/Electron构建通过build-download-log-current.log，既有Framer Motion指令提示不阻断。旧test:download-failure-ui保持命令兼容并转新的download-log-ui，另提供test:download-log-ui；历史download-error-ui-current.json保留旧故障证据，不覆盖成新通过结果。
- 12:09香港时间只读后端刷新game-environment-current.json：1.0.1158.16、valid=true、running=true；Steam清单StateFlags4、构建25261616、下载/部署完成，实际PID9960。未进行游戏安装、故事模式/助手、E盘写入、Steam设置或Device Guard改变；下载此组件不证明当前游戏支持它。
- 没有新增生产依赖/第三方商业授权或分发文件；公网包仅临时本地测试，随后清理。交付核验源码，不交付可信签名EXE；三通道告警会话化、下载多记录原子性、续传/去重/缓存清理、原生锁/压力/断电、签名凭据及转换许可/RPF/DLC/助手/完整游戏终验仍阻碍。

## 0.1.17 桌面批量操作与观察日志（2026-10-12）

- R23/P2：旧0.1.16真实Electron在日志硬链接下批量导入，仅source-a实际保存，返回ok=false；来源收藏也返回false但实际已落库1条。初始JSON观测/断言见desktop-log-ui-initial-failure.log，非假后端或操作成功数据。源码已改为不抛出观察日志，关键动作独立执行，告警经IPC即时更新。
- **新增4项，核心214/214、0跳过**，artifacts/core-tests-desktop-log-current.log。包括真实硬链接保护/成功清除、实际SQL日志已提交后文件追加故障无假兜底、日志SQL失败保留已有数据、错误详情getter/console故障不引出二次异常；故障注入仅测试观察器。之前Installer10项与真实SQL重开/R22逻辑同时完整回归。
- 实际Electron原IPC/SQL.js/扫描通过，desktop-log-ui-current.json/log。有效文件夹A/坏ZIP/有效B批量返回正常处理结果（不是全部包成功）：2个真实扫描记录、1个原始包错误；随后文件夹C扫描到3条。来源保存/真实按钮中文改名、无需重载告警显示、JSON报告实际落盘、私人硬链接字节未改、无网络访问。真实原生SQLite外部提交后来源保存仍ok=false、原数据库错误保留、磁盘字节不变；关闭/重启后扫描3条、收藏改名保留，mods/transactions为0，未冒充安装或游戏效果。仅导入/导出文件选择器替换，没有安全/认证或游戏守卫替换。
- 共用观察器及renderer回复处理的R22实际Electron回归通过 installer-log-desktop-regression-current.log；脚本的installer-log-ui-current.json为本轮最新复核，历史0.1.16源码归档保持原证据。无效离线游戏仍待处理，不把请求正常返回叫恢复成功。
- TypeScript/Vite/Electron构建通过 build-desktop-log-current.log，Framer Motion既有指令提示不阻断。深色1440×940、浅色1024×768实际截图ui/desktop-log-warning-dark.png、desktop-log-warning-light-1024.png已目视检查，中文告警和卡片布局无横向溢出，页面正常滚动。收藏为明确离线夹具，仓库是否存在未确认，也未请求它。
- 11:38香港时间后端只读刷新 game-environment-current.json：1.0.1158.16、valid=true、running=true；Steam清单StateFlags4、构建25261616、下载/部署完成，实际PID9960。没有普通安装UI、故事模式/助手、E盘写入、未签名发行物重试或系统安全策略更改。
- 无新增生产依赖/第三方商业授权。仅源码核验交付；桌面与Installer各一条会话告警不持久化，下载日志策略/多记录原子性/原生并发锁与商业签名/转换授权/RPF/DLC/助手及游戏终验仍未完成。共用日志接口不是RPF/快照等各类故障或实际游戏效果的完整验收。

## 0.1.16 事务结果与日志故障分离（2026-10-12）

- R22/P1：真实日志硬链接被保护拒绝后，原安装catch错误回滚已经提交的文件，留下已启用mod/已回滚tx；重新打开SQLite确认文件实际不存在。9项原始失败installer-log-initial-failures.log，追加重开确证installer-log-persisted-initial-failure.log。均临时文件，没有真实游戏修改。
- **新增10项，核心210/210、0跳过**，artifacts/core-tests-installer-log-current.log；最终定向10/10 installer-log-current.log。新增/覆盖真实文件与备份保护、写入失败原异常和真实回滚、停用/已启用卸载/已停用卸载保留后来文件、恢复状态校正及幂等、日志数据库保存与文件追加拒绝、成功日志清除、关键mod记录失败仍拒绝及恢复原文件、真实SQL.js重开记录一致性。离线核心/种子guard仅用于临时夹具，不冒充游戏兼容验证。
- 实际Electron原IPC/SQL.js通过，installer-log-ui-current.json/log。种子由实际Installer在隔离目录创建文件/备份/交易记录；桌面本身未替换游戏守卫，无效离线游戏目录仍阻止恢复并显示待处理，恢复接口正常返回也未标为已恢复。日志硬链接下启动/告警/重试/真实JSON导出含operationWarnings及读取问题/主题保存/重启通过；原目标和私人硬链接字节未变化。只用启动错误框记录器、导出文件选择器，无安全确认或认证替换。
- 旧0.1.15开发UI于firstWindow前退出，installer-log-ui-initial-failure.log保留；未记录其通知正文，不能用这条UI错误单独断言唯一原因或安全策略影响。核心已有确定复现。扩展导出测试时nullable类型错误阻断构建，却误跑旧dist，产生缺字段失败；build-installer-log-fixture-type-failure.log和installer-log-export-stale-build-failure.log保留。纠正断言类型、先检查构建退出码再启动，最终构建/10项定向/扩展UI通过，不作为产品新增缺陷。
- 最终 TypeScript/Vite/Electron构建通过 build-installer-log-current.log；Framer Motion既有非阻断指令提示保留。深色1440×940、浅色1024×768实际截图ui/installer-log-warning-dark.png、installer-log-warning-light-1024.png已目视检查，告警/事务真实待处理、中文换行、无横向溢出。浅色页面可正常滚动，非原生错误框视觉验收。
- 11:09香港时间只读后端刷新 game-environment-current.json：游戏版本1.0.1158.16、valid=true、running=true；Steam清单StateFlags4、构建25261616、下载/部署完成，实际PID9960。没有普通安装UI、故事模式/助手、E盘写入、未签名发行物重试或系统安全策略更改。
- 本版仅核验源码交付。会话告警不持久化，只保留最近一条并在成功日志后清除，其他IPC日志仍待审查；原生并发锁/完整恢复、可信签名和转换授权、RPF/DLC/助手及商业/游戏终验仍阻碍。核心完整210在导出字段扩展前通过，扩展只改桌面导出，随后重跑受影响构建/UI及定向10项，不伪称再次完整核心。

## 0.1.15 文件补充日志检索与有界导出（2026-10-12）

- R21/P2：旧0.1.14实际Electron构建在临时库外部真实SQLite提交导致关闭拒绝后，文件有logFailure记录，但重启State没有该记录。初始失败 artifacts/operation-logs-ui-initial-failure.log。新读取器不重写文件/数据库，区分补充来源和数据库，State与导出使用相同受限规则。
- **新增10项，核心200/200，0跳过**，artifacts/core-tests-operation-logs-current.log；定向10/10 operation-logs-current.log。双写去重/文件补充、缺失文件和坏DB行、类型/日期/scope/UTF8/超长/未完成、ID冲突、真实硬链接/目录连接、4MiB尾部UTF8/换行边界、SQL样本1001及显示1000/排序、读取时实际追加、字节容量/巨大ID/BLOB通过。SQLite内部构造真实NUL并核对BLOB长度，不把JS绑定截断误当完整NUL数据。
- 实际Electron原IPC通过，artifacts/operation-logs-ui-current.json/log：实际关闭拒绝种子产生文件补充；中文搜索/空搜索结果、双写去重、坏行提示、JSON实际落盘带范围/问题、导出到受保护日志路径拒绝并保留原前缀（正常追加错误记录）、实际logFailure外部追加后刷新、退出重启仍可检索、补充ID未插入SQLite、外部记录保留。只有测试文件选择器替换；没有真实游戏写入或伪造安装成功。
- 最初测试夹具的字符/字节边界错误见operation-logs-fixture-initial-failure.log；NUL绑定被SQL.js截断见operation-logs-byte-cap-fixture-failure.log；拒绝导出正常追加误判见operation-logs-export-fixture-failure.log；辅助进程强制process.exit导致Node libuv断言见operation-logs-append-fixture-failure.log。修正为真实字节/SQL内部NUL/保留前缀及核对错误追加/自然退出后通过，不作为产品缺陷或系统安全阻拦证据。
- 深色1440×940、浅色1024×768实际截图ui/operation-logs-dark-real.png、operation-logs-light-1024.png已目视检查，中文正常换行、无横向溢出；较长列表可以滚动。TypeScript/Vite/Electron构建通过 build-operation-logs-current.log，扩展测试后typecheck-operation-logs-current.log通过。既有Framer Motion指令提示不阻断；没有新增生产依赖。
- 10:43 香港时间后端只读刷新 artifacts/game-environment-current.json：实际版本1.0.1158.16、valid=true、running=true；Steam清单StateFlags4、构建25261616、下载/部署完成，实际PID9960。没有普通安装UI、故事模式/助手实测、游戏写入或受策略阻止发行物重试。
- 展示/导出最多1000条，数据库最近插入1001条样本，文件尾4MiB（边界额外1字节）、每行64KiB；不是所有历史按时间的完整分页或高压力验收。无日志轮转/防篡改签名、无数据库热恢复，原生并发锁仍缺。签名/转换许可、资源/DLC/助手与商业完整终验保持未完成；本版只交付核验源码。

## 0.1.14 外部数据库更改保护（2026-10-12）

- R20/P1：两个真实Store的旧状态会覆盖另一实例提交；删除后仍重建，WAL/journal/shm存在也未停止保存。初始五项失败 artifacts/database-concurrency-initial-failures.log，仅临时数据。保存前/临时文件fsync后复核SHA及读取稳定性，外部变化/删除拒绝并保留磁盘；存在SQLite日志拒绝打开/保存、不删除或自动恢复。
- **新增9项，核心190/190通过，0跳过**，artifacts/core-tests-database-concurrency-current.log。早期八项定向通过见database-concurrency-current.log；最终九项以完整核心为准。含同库多实例、删除、三类sidecar、提交前改动清理、真正原生WAL、关闭释放/文件日志硬链接保护、读取期间原地改写。Node内置SQLite只用在测试，不新增生产依赖，生产仍SQL.js。
- 扩大读取竞态时首次尝试在Windows已打开句柄上重命名，系统EPERM阻止，因此不是产品漏洞证明；失败database-concurrency-read-race-fixture-failure.log保留。改为真实可执行的原地同大小写入，只有旧内容hash/大小检查的中间实现未拒绝，database-concurrency-read-race-initial-failure.log保留。现核对文件身份、纳秒mtime/ctime及当前路径后通过；不声称获得原生锁。
- 实际Electron两场景及其中重启通过：原生SQLite在GEMS运行中真正提交外部记录，实际设置保存被拒绝，当前内存基线保留，关闭不会再覆盖外部字节，重启读取外部主题与记录；原生SQLite实际WAL仍打开时启动拒绝，主库和WAL逐字节未变。artifacts/database-concurrency-ui-current.json/log。真实IPC/SQL.js未替换；启动错误通知由记录器观察，不宣称原生错误框视觉验收。
- 用户看到中文保存拒绝且未假报成功：ui/database-external-change-real.png已目视检查，文本换行/对话框正常。退出保存/窗口位置保存失败以operations.jsonl补充“仅文件日志”，不假报SQLite日志记录；日志硬链接拒绝。当前数据库日志列表/导出尚不读取补充文件，这是剩余功能缺口。
- TypeScript、Vite、Electron构建通过，artifacts/build-database-concurrency-current.log。首次八项时核心189通过；新增读取竞态夹具的中途EPERM失败已纠正，最终190通过。为测试中间实现曾暂时关闭新增时间判断，仅在隔离核心测试执行后恢复，并通过完整最终测试；未在真实游戏或发行物上运行弱化版本。
- 最后复核至rename之间仍有竞态，没有跨工具事务锁，也未做所有恶意并发/路径/断电验收。两次全量hash增加成本，有效大库速度/内存未验收；外部状态不热同步、恢复/合并/迁移未提供。不能把检测已观察的改动称为“所有并发已解决”。
- 10:16香港时间只读后端仍为E盘1.0.1158.16安装就绪且运行；Steam StateFlags=4，buildid/TargetBuildID=25261616，下载/部署完成，PID9960。game-environment-current.json已刷新。没有游戏写入、故事模式/助手实测、普通安装UI或Device Guard失败发行物重试。
- 本版交付校验源码。签名/许可、转换/DLC/助手和完整商业/游戏终验未通过。

## 0.1.13 数据库准入保护（2026-10-12）

- R19/P1：已有SQLite缺少/空版本表、多行版本(1,2)/(1,1)、错误记录主键原本未拒绝；超限数据库尝试全量读取。真实SQLite夹具与初始失败见 artifacts/database-admission-initial-failures.log。超限文件256MiB+1实际扩展，但旧全量读取由测试拦截避免分配，不冒充测得进程OOM或有效大库性能。
- 修复：仅不存在的数据库初始化；已有库先受限读取/核对大小，恰好一条整数版本1、支持的列/主键及quick_check只读检查后才使用，未知/损坏不自动补版本。失败关闭WASM对象，已有库打开不重写，保留原字节。读取前和导出保存时最大256MiB，保存超限恢复内存和磁盘基线。
- **新增9项，核心181/181通过，0跳过**：六类SQLite结构问题，读取超限，正常写入/关闭/重开，导出超限内存/磁盘恢复。artifacts/core-tests-database-admission-current.log。早期定向7项见 database-admission-current.log；最终新增两项以完整核心日志为准。追加版本列缺失时曾得到原始 no such column，现统一中文数据库错误并保留cause，失败见 database-admission-column-initial-failure.log。
- 实际Electron三个场景通过：歧义版本/缺少版本拒绝启动，失败通知调用被记录且原文件逐字节未变；正常库通过真实设置页面保存浅色主题，退出重启后恢复。artifacts/database-admission-ui-current.json/log。错误通知用显式测试记录器代替阻塞原生错误框，未声称验收原生错误框视觉；真实Store.open未被替换，没有模拟成功数据库。
- TypeScript、Vite、Electron构建通过，artifacts/build-database-admission-current.log；无新增依赖，既有Framer Motion非阻断提示仍保留。首次完整核心180项通过后补上缺失版本列边界，最终181项通过，不把中途数量作为最终结果。
- 256MiB为拒绝边界，不是有效大库压力实测。导出容量测试通过模拟第二次export超限检查恢复，非有效256MiB数据库benchmark。全库映像/JSON/State、并发外部编辑、WAL/日志、断电、迁移和自动清理仍未验收。超过容量的历史库应保留并交维护者迁移，不能直接删除。
- 09:39香港时间只读后端：E盘1.0.1158.16、安装就绪且仍运行；Steam清单StateFlags=4，buildid/TargetBuildID=25261616，下载/部署计数完成，PID9960。game-environment-current.json已刷新。未写游戏、未做故事模式/助手或普通安装UI，没有重试被Device Guard拒绝的发行物。
- 本版只交付校验源码，商业签名、许可、转换/DLC/助手和完整终验缺口继续保留。

## 0.1.12 启动期间退出（2026-10-12）

- R18/P2：隔离实际 Electron 中，关闭启动文档加载的窗口后，旧代码将迟到拒绝传到启动失败通知。artifacts/startup-ui-initial-failure.log、startup-ui-initial-error.json 保存 document-reject 的断言和 GEMS 无法启动通知。故障是启动 Promise 延迟/拒绝注入；未声称有真实用户损坏、任意执行或实际原生弹窗阻塞证据。
- 仅修改 desktop/main.ts 启动文档 await 后的退出检查与异常传播：退出后不访问窗口/数据库、不应用缩放；非退出加载错误保留通知。安装/恢复事务与数据库初始化错误路径未被这条退出处理屏蔽。
- 实际 Electron **4/4 启动场景通过**：已有绑定的启动环境检查取消、自有 Node 检测子进程结束；文档拒绝和成功迟到后退出都不误报；非退出时真正 Chromium 读取不存在测试文档产生 ERR_FILE_NOT_FOUND，保留启动失败通知调用。每项均独立重新打开实际 SQLite，核对原设置及零模组/事务记录。artifacts/startup-ui-current.json/log。
- 引导测试脚本通过显式 -r 仅加载到本次隔离开发进程；没有改产品 IPC、把测试环境变量接成产品功能、改名或更换发行父进程，也没有更改系统策略。真实 renderer 有加载，测试只控制启动 Promise 完成时机；非退出错误使用实际缺失文件。dialog.showErrorBox 被记录器替代，不称为实际原生弹窗的视觉/点击验收。最初非退出分支使用人工拒绝，随后扩展为真正缺失文件并重新完整通过；最终证据以现版为准。
- 普通启动并扫描中关窗回归通过，12 个真实本地文件/50,331,648 字节，报告保存：artifacts/shutdown-ui-current.json、shutdown-startup-current.log。只有临时模组数据，不写游戏或伪造已安装车辆。
- TypeScript、Vite、Electron 构建通过，artifacts/build-startup-current.log；无新增依赖，Framer Motion既有非阻断提示保留。最近完整核心是0.1.11的**172/172**，本轮仅桌面启动处理改变，未重复整个核心，不能把历史核心日志写成本轮新增测试。
- 09:05 香港时间只读后端确认 E 盘游戏1.0.1158.16仍运行；Steam清单StateFlags=4、buildid/TargetBuildID=25261616、下载/部署均完成，PID9960。artifacts/game-environment-current.json已刷新。没有实际游戏写入、故事模式/助手、普通安装UI或Device Guard失败发行物重试。
- 0.1.12交付源码/逐文件归档核验和可复现测试，本版无可信签名安装器或便携EXE；商业许可、转换/DLC/助手等完整终验仍未满足。

## 0.1.11 进程未知状态与只读命令取消（2026-10-12）

- R17/P1：旧成功命令的空/异常输出没有包含游戏名称，返回 false，使隔离 PE/RPF 夹具上的 guardGame 意外允许预览。旧环境在进程命令失败时直接抛错，没有未知状态；相似文件名被误识别。修复前四项失败为 artifacts/process-status-initial-failures.log。第一版测试执行器遗漏 execFile 的 custom promisify 约定，出现测试 TypeError，已纠正后再保留有效初始失败；夹具错误单独保存 process-status-fixture-initial-failure.log，不作为产品漏洞证据。
- 新增完整 CSV 五列/数值/PID 校验、精确文件名、负结果系统标记；空、异常、截断、重复 PID 与 stderr 均不能证明游戏已退出。Environment.running=null 为未知，守卫拒绝修改；保留证据，首页明确显示。非 Windows 也不虚报未运行。只保存判断及错误证据，不保存完整系统进程列表。
- 系统命令固定 SystemRoot/System32 下 tasklist 与 WindowsPowerShell，拒绝未知命令，路径连接检查，无 shell/包内命令；10秒、4MiB 上限，只读环境可取消。安装事务里的 guardGame 不传退出取消信号；启动只读检查加入等待门禁和关闭后不再加载窗口的保护。SystemRoot/OS 命令签名与进程启动竞态未终验。
- **新增 8 项，核心172/172通过，0跳过**：空/异常守卫拒绝、失败未知证据、精确名字、坏/重复/不完整列表、中文转义及多进程与 stderr、固定系统命令、预取消不执行、真正检测夹具子进程取消结束。artifacts/core-tests-process-status-current.log、process-status-current.log。真实子进程为本次自有 Node 等待夹具，不是 tasklist 卡顿或实际游戏。
- 实际 Electron 原 IPC 的两种场景通过：tasklist 失败注入后真实 E 盘只读检查显示未知，安装预览拒绝，无事务/模组记录；关闭环境读取时取消并结束自有 Node 检测子进程，不等待10秒。无故障重启读取原始 tasklist/PE 元数据，版本1.0.1158.16、游戏正在运行。artifacts/process-status-ui-current.json/log。只替换本次测试执行器/文件选择器，未写游戏、未绕过运行守卫或终止真实游戏。启动阶段单独取消故障夹具尚未扩展，本次验证的是启动正常读取及运行中环境检查取消。
- 深色1440×940、浅色1024×768 的真实未知状态截图已目视检查，中文无裁切、浅色主区域无横向溢出：ui/process-unknown-real.png、process-unknown-1024-light.png。初次截图处于淡入中，已改为等待动画完成后重新检查，属于测试截图时机修正。
- TypeScript、Vite、Electron 构建通过，artifacts/build-process-status-current.log；无新增依赖，既有 Framer Motion 非阻断提示保留。首次整套/桌面测试时为0.1.10包标记，随后更新0.1.11并扩展截图，功能代码相同；不代表安装器或最终EXE验收。
- 08:37 香港时间独立新后端只读环境验证仍为安装就绪/版本1.0.1158.16/游戏运行。Steam清单StateFlags=4、buildid/TargetBuildID=25261616、下载/部署均完成，PID9960。artifacts/game-environment-current.json 已刷新。未进行普通安装 UI 或故事模式/助手测试，未重试 Device Guard 拒绝的发行物。
- 本版为校验源码，可信商业签名、相关许可、转换/DLC/游戏助手终验仍未完成。

## 0.1.10 连接等待截止与取消（2026-10-12）

- R16/P2：旧 request.setTimeout 在 socket 未连接时不覆盖等待阶段。实际 Node ClientRequest 的 Agent 不提供 socket，旧版资产/DNS 用例直到 5 秒测试限制都不能及时结束；本地真实 TCP 接受连接后不回应 TLS，旧版仅由调用方 watchdog 中止。artifacts/network-deadline-initial-failures.log 保留了两项测试超时和一项断言失败，不称为真实公网 SYN 故障。
- 新增 http-lifecycle.ts，独立计时资产/API 每跳 30 秒、公共 DNS HTTPS 10 秒，覆盖连接/握手/响应头等待。用户取消直接拒绝等待并销毁请求，不等 Agent 迟到回调。清理 GEMS 自有监听/计时，迟到 socket 销毁；正文继续受原空闲、容量、调用方总时限保护，不能将连接上限描述为整个下载只有 30 秒。
- 新增 **7 项**，核心 **164/164 通过，0 跳过**：两个无 socket、真实 TCP/TLS 停滞、用户取消、截止后的迟到 socket、有效正文跨过连接上限、实际 Downloads 队列超时后下一本地 ZIP 继续扫描。最后一项真实文件、SQLite、扫描，但第二包内容为现场生成的本地 ZIP 夹具，不冒充作者公网下载或游戏安装。证据 artifacts/core-tests-http-deadline-current.log；早期六项定向通过为 network-deadline-current.log，最终完整七项以核心日志为准。
- 实际 Electron 原 IPC 两项通过：未分配 socket 时中文超时反馈、错误后操作锁释放并可保存设置；退出取消请求、进程结束、数据库保留。artifacts/http-deadline-ui-current.json/log；ui/http-deadline-real.png 已目视检查，无文字裁切。仅测试 Agent/时钟故障注入，30 秒缩为 150 毫秒，未改变 Windows DNS/路由、安全策略或产品公共接口。
- 扩展正常 TLS 响应夹具时，发现既有内存证书的 ASN.1 日期含非法 T。改为规范 UTC/Generalized 时间并增加有效期检查，正向本地 TLS 和正文通过，未导入系统信任。初始 artifacts/network-deadline-fixture-failure.log 保留。随后完整核心中的两个不安全环境证书拒绝测试通过，实际 Electron 拒绝仍在 HTTP 读取前发生，请求数 0：artifacts/tls-policy-http-deadline-current.log、tls-policy-ui-current.json。这次 UI 运行时包版本仍为 0.1.9，之后源码标记 0.1.10，功能代码相同；不是最终发行 EXE 验收。
- 正常响应测试原来错误要求 Node native keep-alive 监听也立即为 0，实际可保留一个 native 监听，已将断言限定为没有额外 GEMS 等待监听。取消/迟到 socket 场景完整清理断言仍为 0。修正前证据 artifacts/network-deadline-fixture-listener-failure.log；不声称控制 Node 所有内部操作。
- 公网公开 GitHub API 未注入故障仍通过，取得 7 个真实发布包元数据，artifacts/network-live-current.json、network-live-http-deadline-current.log；没有重复下载或安装插件。TypeScript、Vite、Electron 构建通过，artifacts/build-http-deadline-current.log；无新增依赖，Framer Motion 既有非阻断提示保留。
- 08:08 香港时间只读环境：Steam StateFlags=4，buildid/TargetBuildID=25261616，下载与部署计数完成；EXE 1.0.1158.16、GTA5_Enhanced PID 9960 仍运行，game-environment-current.json 已刷新。未做普通安装 UI、游戏写入、故事模式/助手，未重试 Device Guard 拒绝的发行物。
- 本版校验源码交付；可信商业签名、资源许可、转换/DLC/助手和完整终验阻碍仍保留。

## 0.1.9 网站生命周期（2026-10-12）

- R15/P2 初始缺陷已复现：隔离 Electron 开发进程的首次 loadURL Promise 不返回，关闭主窗口后超过测试 2.5 秒仍不能退出；原始失败保存为 artifacts/site-lifecycle-initial-failure.log。只注入加载故障，没有替换 IPC、改系统网络或写游戏。
- 修复：首次加载 45 秒总时限，用户关闭返回取消，退出销毁本函数创建的远程窗口并释放等待，文件事务仍经原门禁收尾。关闭移除 session 的下载监听；下载通知的异步拒绝被消费。后续网页导航不持有操作锁，不在本次初次加载超时范围内。
- 实际 Electron **4/4 生命周期用例通过**：加载中退出、加载完成后带 beforeunload 的页面退出、用户关闭取消并继续 settings 写入、超时拒绝并继续 settings 写入。迟到加载拒绝被消费，子窗口销毁后下载监听数为 0；沙箱/上下文隔离启用、Node 关闭、无 preload。证据 artifacts/site-lifecycle-ui-current.json/log。加载夹具先真实打开 about:blank，再悬挂返回 Promise；超时仅在该测试进程把 45 秒缩成 150 毫秒，不声称测得真实网站 45 秒故障。
- 扩展第四项夹具时曾在未建立页面的窗口调用 JavaScript，测试等待不结束；已停止经父子进程与 EXE 路径核对的本次测试子进程，修正为先加载 about:blank，并增加夹具等待上限后完整通过。诊断见 artifacts/site-lifecycle-fixture-failure.log；不是产品或游戏进程退出验收。
- 真实 GitHub 网站窗口→Chromium 下载事件→受限下载器→扫描再次通过，因为本次改变了下载监听生命周期。实际作者 ZIP 2,716,327 字节，SHA-256 f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a；无安装或插件执行。证据 artifacts/site-download-ui-current.json、site-download-lifecycle-current.log。未复测 GTA5-Mods/Nexus 全下载链路。
- 核心 **157/157 通过，0 跳过**，数量未增长，新增四项在实际 Electron 脚本中；artifacts/core-tests-site-lifecycle-current.log。TypeScript、Vite、Electron 构建通过，artifacts/build-site-lifecycle-current.log；首次事件监听类型标注不匹配 Electron overload，已修正，未将该失败时刻报告为通过。无新增依赖，既有 Framer Motion 非阻断提示保留。
- 07:37 香港时间只读检测：Steam StateFlags=4，buildid/TargetBuildID=25261616，下载与部署计数均完成；实际 EXE 为 1.0.1158.16，GTA5_Enhanced PID 9960 仍运行。artifacts/game-environment-current.json 已刷新。没有普通安装 UI、真实游戏写入、故事模式或助手实测，也没有尝试被 Device Guard 拒绝的发行 EXE。
- 0.1.9 交付校验源码及可复现测试；商业签名、相关资源许可、Legacy 转换、加密 RPF/DLC 和游戏助手终验缺口仍未消除。

## 0.1.2 初始历史记录

| 验证 | 结果 | 证据与限制 |
|---|---|---|
| TypeScript 类型检查 + Vite + Electron 主进程构建 | 通过 | `npm run build`；Framer Motion 的 use client 打包提示对本地 React 页面不构成编译失败 |
| 核心与 RPF 自动测试 | 78 / 78 通过 | `npm test`；64 个文件安全/事务/备份/环境测试 + 14 个 RPF/资源头测试 |
| 游戏助手构建 | 通过 | net48 x64，0 警告/0 错误；SHVDNE 官方 API v3 固定引用 |
| 助手离线守卫/桥接测试 | 76 项通过 | 不连接游戏，无网络服务，目录遍历/联接点和状态守卫覆盖 |
| 助手中文菜单栅格 | 目视检查通过 | 实际 Windows GDI PNG；长名称、8 行、提示栏；非游戏截图 |
| Electron 桌面导航与 IPC | 通过 | 21 页面实际 Electron 启动；通过真实 IPC 安装/恢复临时文件、嵌套 RPF 浏览/提取/返回与原文件覆盖拒绝；本地数据库与导入调用 |
| 桌面视觉 | 已检查 | dark/light、1024×768、1440×940、空数据、长中文文件名弹窗、120 个真实隔离事务生成的车库记录和搜索；PNG 位于 `artifacts/ui/` |
| 渲染隔离 | 通过 | window.require 不存在，最小 gems IPC 入口存在；contextIsolation / sandbox / CSP |
| Windows 0.1.2 安装包构建 | 被系统阻止 | 编译与打包已完成至 NSIS 阶段，但中间安装器执行被 Device Guard 拒绝（3077），artifacts/distribution-current.log。124 KiB 中间文件已隔离为 failed-build.bin，不能交付为安装包。保留 0.1.1 历史安装包。 |
| Windows 0.1.2 便携构建 | 已生成；本机启动被阻止 | release/GEMS-0.1.2-x64-portable.exe，正常 portable 目标构建；artifacts/portable-build-final.log。启动记录 artifacts/portable-tests-current.log，系统 3077 指向该便携 EXE。未签名。 |
| 实际 NSIS 安装 / 卸载 | 0.1.1 历史通过 | 安装到全新系统临时目录；运行已安装 exe 完成上述完整 UI/IPC 回归；卸载移除 exe，保留 `%APPDATA%/GEMS/Studio` 中的独立校验文件；`artifacts/installer-tests.log` |
| 便携 EXE 运行 | 0.1.1 历史通过；0.1.2 被系统阻止 | 实际 NSIS 包装器解包启动、中文首页、真实 SQLite 空库/IPC、渲染隔离、正常关闭；`node tests/portable.mjs`；本机临时调试端口仅测试使用并随关闭退出 |
| 先前单独截屏辅助程序 | 未通过（历史问题保留） | 解包版辅助启动明确被 Device Guard 拒绝（Code Integrity 3077），`artifacts/scale-native-tests.log`；额外安装版 smoke 启动也失败，`artifacts/scale-installed-tests.log`。普通 NSIS 安装后的完整 UI 回归另行通过。该辅助启动失败保留；本轮正常 Electron UI 回归直接使用 BrowserWindow.capturePage 成功取得完整 1024×768、120% 缩放窗口图（artifacts/ui/native-120percent.png），已目视检查。未测试其他物理 DPI/多显示器 |
| 生产依赖安全审核 | 0 项已知漏洞 | `npm audit --omit=dev`；不能证明文件或软件安全无漏洞 |
| 游戏真实加载、资源转换与 DLC 注册 | 未通过验收 | 未实施；E 盘游戏仍在下载/部署，尚不能游戏内验收；相关执行入口禁用 |

自动测试覆盖真实临时目录中的文件写入：非法路径、ZIP Slip、异常压缩比例、junction、目录递归包含、错误资源、Legacy 阻止、未知安装目标、原包保存、正常安装、重复安装、覆盖确认、源缓存变化、预览后目标变化、外部修改保护、多模组共享所有权、模拟写入失败回滚、持久数据库重启恢复、待处理恢复、备份去重与损坏、16 MiB 文件、50 个模组独立事务、无游戏和复杂 OIV 拒绝。

新增覆盖：有限 OIV 顶层 add 实际安装、根目录 DLL 只能从可信快照恢复且可撤销、伪造快照来源拒绝、PE 架构和 RPF 文件头检查。UI 隔离安装测试只给文件选择器提供测试路径，安装和恢复后端没有替换为模拟结果。大量车库 UI 使用 120 次真实临时文件事务，不代表 120 辆真实游戏车辆。

0.1.1 新增 22 项核心回归：停用卸载保留用户文件、覆盖型重新启用与明确批准、外部修改、同内容后续所有权、不同游戏目录、逐文件游戏守卫、待恢复事务拦截、恢复失败日志、备份阶段源/目标变化、预览报告绑定、目标 junction、缺失事务、并发写入，以及损坏恢复副本、提交前目标变化、磁盘刷新失败和临时文件清理。该轮总计 67 / 67；本轮为 78 / 78。

新增真实 Electron 流程：修改导入目标后仍执行服务端已预览报告；覆盖确认取消时不写文件；停用后卸载保留用户后来文件；覆盖型重新启用后卸载恢复原配置；取消 RPF 提取没有成功提示。使用真实安装事务模拟进程恢复中断，重启后保留外部修改，继续恢复后文件还原且待处理通知消失。仅测试文件选择器和隔离覆盖确认响应；文件/数据库后端实际执行。重新启用预览截图已目视检查，位于 `artifacts/ui/reenable-overwrite-plan.png`。

新增缩放检查通过字号与设备像素比计算实际字体缩放比例，验证 120% 设置只应用一次；多显示器和其他物理 DPI 环境仍未实测。

上一版 0.1.1 仅更新文档的打包阶段，对 `resources/app.asar` 做 SHA-256 对比，程序内容与已测试版本逐字节一致，记录于 `artifacts/verified-desktop.json`。随后对最终安装包再次执行完整安装/已安装程序回归/卸载保留数据测试并通过。额外启动失败仍保留在本报告，未改变安全策略；未签名构建不能视为所有 Windows 策略下均可运行的正式发行。

实际 UI 回归发现并修复：退出时过早关闭 SQLite 使窗口位置保存失败；后台快照读取与恢复请求竞争。退出顺序调整为 will-quit 关闭数据库，只读快照查询不占写事务入口。测试以最终 UI 状态而不是未完成的异步条件判断恢复成功。

RPF 使用合成格式夹具，助手使用离线 API/菜单检查；没有使用真实车辆、付费图形包或伪造 GTA5 运行结果。50 项测试是文件事务队列，不是 50 辆车已在游戏中加载。

尚需：安装向导逐页人工验收、高 DPI/多显示器、2万文件/大库压力、超长路径、真实断电、实际 NVE/LWE 版本清单、有效转换后端、实际 DLC 加载与故事模式中文助手测试。发布前仍需安全审查和合法签名发布源。

## 0.1.2 本轮验证

新增 11 项测试，总计 78 / 78 通过，见 artifacts/core-tests-current.log。覆盖 Steam 尚未完成时拒绝使用、计数/部署核对、目录不匹配/暂存目录/损坏或重复清单/越界联接点、预览后 Steam 状态变化，及恢复文件占用时的中文待处理记录。

真实 Electron UI 回归通过（artifacts/ui-tests-current.log）：未完成游戏下载不替换已有绑定；Tab/Shift+Tab 留在弹窗、后台 inert、Esc 关闭与焦点恢复；实际预览后外部修改被保留，错误反馈显示在安装预览上方。性能采集异常已处理，离开页面不更新旧状态。

只读检查实际 E 盘 appmanifest_3240220.acf：目录 E:/SteamLibrary/steamapps/common/Grand Theft Auto V Enhanced，StateFlags=1026、buildid=0，Steam 记录中下载/部署未确认完成。未改写 Steam 清单、下载目录或游戏文件，未启动游戏、未安装插件。此记录只是检查时刻，可能滞后于 Steam 实际下载进度。

安全策略：只接受安装记录状态值 4、正构建号以及存在的下载/部署计数对都完成；其他或无法解析的状态拒绝修改，不猜测复合状态。随后仍检查实际 PE/RPF。这个保守门禁不替代 Steam 完整性验证，不确认授权或游戏兼容性。SteamCMD 自报安装状态不足以单独证明无更新，参考 [Valve 官方仓库问题记录](https://github.com/ValveSoftware/steam-for-linux/issues/8075)，GEMS 不调用 SteamCMD 修改状态。

0.1.2 分发阻碍：Windows Code Integrity 3077 指向 release/GEMS-0.1.2-x64-setup.exe，Node 启动 NSIS 生成卸载器的阶段被拒绝。没有关闭安全策略、改名执行、使用其他父进程重试或自签名添加信任。当前用户证书存储没有可用代码签名证书。Windows CI 提供可复现构建，但本轮没有远程执行 CI。

最终 0.1.2 开发桌面回归再次通过：artifacts/ui-tests-current.log。核心最终 78/78 与 TypeScript 检查通过：artifacts/core-tests-current.log。包内 6 个桌面程序文件与已测试 dist 逐字节一致：artifacts/verified-desktop-current.json；这不代替 EXE 启动验收。

最终便携启动被 Device Guard 拒绝（Code Integrity 3077 指向 GEMS-0.1.2-x64-portable.exe）。未尝试更换父进程、改名运行或修改安全策略。发行需合法签名和受支持机器实测。便携内文档为打包时刻的快照，最新状态以源码本报告及旁附发行说明为准。

## 0.1.3 商业发行与实际目录回归

2026-10-12。本轮最终核心测试 **98 / 98 通过，无跳过**，artifacts/core-tests-commercial-current.log。TypeScript 与桌面构建通过，artifacts/build-commercial-current.log。新增 20 项：9 项签名/归档门禁、8 项组件/日志证据、3 项真实进程终止恢复。签名实际读取测试使用已安装 Node 程序，仅验证读取通道，不代表 GEMS 已签名。

进程中断：创建独立测试 Node 子进程，在文件写入后暂停，父测试终止该进程，使 finally 回滚没有机会运行，再由新数据库连接恢复磁盘上的事务。覆盖部分写入、首次安装提交与重新启用提交。初始重新启用案例失败，确认旧模组记录存在但指向旧事务时漏恢复；已修复并通过全部回归。artifacts/process-recovery-initial.log 保留初始失败，最终结果见核心日志。这不是断电硬件实测。

实际游戏目录：E:/SteamLibrary/steamapps/common/Grand Theft Auto V Enhanced，Steam StateFlags=4、buildid=25261616，下载 99890851584/99890851584 字节、部署 103219693669/103219693669 字节，进度 100%。GTA5_Enhanced.exe 版本 1.0.1158.16，PE/RPF 文件头检查通过，未执行平台完整性校验。此状态替代上文 0.1.2 检查时的下载未完成记录，不抹除历史。

Steam 真实 UI 启动后观测到 GTA V 主菜单；Windows 防火墙提示待用户处理。未点击 Online，未安装 GEMS 或第三方插件。故事模式和游戏内功能仍未验收。ScriptHookV 官方本地记录为 Enhanced 1.0.1158.13，不能把本机 .16 宣称为支持。

真实 Electron 只读回归通过，artifacts/live-environment-current.log、artifacts/live-environment-test.json：实际版本、组件、进程、运行中禁止生成写入计划，未产生模组/事务记录；深浅主题全部导航页在 1024×768 检查无横向溢出，实际退出后重启首次查询有真实环境结果。截图 actual-environment-live.png 与 actual-environment-live-1024-light.png 已目视检查。测试只写独立用户数据和临时导入夹具，不写实际游戏。

0.1.3 未重新执行普通安装全流程 UI 回归：实际游戏尚在运行，生产守卫会按设计拒绝夹具文件修改。上文 0.1.2 完整文件安装/启停/恢复 UI 回归为历史结果，不能替代 0.1.3 的这项测试。已通过当前 98 项独立后端测试及新的只读真实目录桌面回归，后续在正常退出游戏后执行完整桌面回归。

签名发行：实际无凭据的 signing:preflight 非零退出，artifacts/signing-preflight-current.log；两个配置通过 electron-builder 26 实际 schema 校验；Win Authenticode 读取通道实际工作，不更改 ExecutionPolicy 或证书信任。新的签名 CI YAML 可解析，但未远程执行，未签署 GEMS、未验证当前安装器/卸载器，0.1.3 只交付源码。首次使用 PowerShell 脚本文件的签名读取测试被执行策略拒绝；最终采用系统只读证书命令，不加载项目脚本。没有改变系统保护。

生产依赖 npm audit --omit=dev 本轮 0 项已知漏洞，artifacts/production-audit-current.json；不等于安全无漏洞。20 个生产依赖与原始许可重新生成于 DEPENDENCIES.json。收费范围、可信签名、实际转换/RPF/DLC/助手仍有验收缺口，详见 COMMERCIAL_RELEASE.md。

## 0.1.4 模组商店实际验收（2026-10-12）

- 核心回归 **121 / 121 通过，0 跳过**；其中新增商店与下载安全 **23 项**。原有扫描、安装、备份、中断恢复和签名预检均通过。证据：`artifacts/core-tests-marketplace-current.log`。
- TypeScript、Vite 与 Electron 主进程构建通过。证据：`artifacts/build-marketplace-current.log`。Framer Motion 的 `use client` 指令提示仍存在，不影响本地 Electron 构建。
- 真实 GitHub 公开接口与 ZIP 下载：作者 Chiheb-Bacha、ScriptHookVDotNetEnhanced v1.1.0.6、2,716,327 字节，SHA-256 `f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a`，与 API 中作者提供的值匹配。自动扫描 16 文件，未知安装目标正确阻止安装。证据：`artifacts/marketplace-live-current.json`。
- 实际 Electron 商店读取 / 下载 / 扫描 / 导入页自动更新 / 安装检查跳转通过；25 品牌、15 车型，深浅主题 1024 布局无横向溢出，稳定动画状态截图实际目视检查。证据：`artifacts/marketplace-ui-current.json`、`artifacts/ui/marketplace-*.png`、`artifacts/ui/download-real-dark.png`。
- GTA5-Mods 奔驰 + SUV 原站已实际加载且页面内容核验；无 Node / preload / 本地 GEMS 桥，沙箱和 contextIsolation 启用，本地 HTTP 导航被阻止。该站真实模组下载尚未完成全链条验收。
- 独立网站下载交接已通过**实际 GitHub 浏览窗口 Chromium 下载事件**验收；受限下载器生成同一作者文件哈希与扫描报告。未伪造 DownloadItem 或替换下载器。证据：`artifacts/site-download-ui-current.json`。
- 本机代理 DNS 返回 fake-IP，最初实际下载因公网门禁被拒绝。增加固定公网 HTTPS DNS 回查后完成真实下载；仍拒绝私网 / 保留地址，TLS 证书验证未禁用。
- 最新实际 E 盘环境只读回归通过：1.0.1158.16，22 页深浅主题、运行中安装门禁，以及真实退出重启后首次显示绑定环境。证据：`artifacts/live-environment-marketplace-current.log`。没有写入游戏。
- 本轮没有执行完整普通安装桌面回归：实际游戏仍运行，安装守卫不会被测试绕过。核心隔离安装测试通过，不能替代真实游戏加载。
- 0.1.4 没有可信签名 EXE、安装器或便携包。本轮交付源码；CI 增加可选商店联网验收，尚未远程运行。Nexus API 授权、跨站统一目录、DLC 注册、真实转换、助手游戏内和商业许可验收仍未完成。参见 `MOD_STORE.md`。


## 0.1.5 来源收藏与重启恢复（2026-10-12）

- 本轮完成来源收藏的真实数据库保存、中文命名、选择与移除、上次读取时间/文件数。50 个收藏上限，大小写去重；未读取的收藏不显示仓库验证通过。
- 核心回归 **132/132 通过、0 跳过**，新增 11 项来源/数据库测试。覆盖真实 SQLite 关闭重开、大小写去重与改名保留证据、非法网址和凭据、名称限制、收藏上限、删除边界、未知记录保留、无效读取证据拒绝及参数化数据库删除。证据：artifacts/core-tests-sources-current.log。
- TypeScript、Vite、Electron 主进程构建通过，artifacts/build-sources-current.log；既有 Framer Motion 指令提示仍存在。无新增第三方依赖。
- 实际 Electron UI 使用原 IPC、原 SQLite 和真实公开 GitHub API，读取作者 Chiheb-Bacha/ScriptHookVDotNetEnhanced 的 7 个发布文件。真实退出进程并重新启动后收藏、中文名、上次读取证据仍在；当前发布目录为空，过期 ID 下载被拒绝。选择其他收藏清除目录，切回后仍需重新读取。中文改名、移除及真实本地文件导入副本保留通过。证据：artifacts/source-library-ui-current.json/log。没有模拟下载结果或联网失败降级夹具。
- 深浅主题 1024×768、78 字中文收藏名的稳定动画截图已目视检查，控件没有横向溢出、按钮和中文提示可见，长下拉项正常省略。证据：artifacts/ui/sources-1024-dark.png 与 sources-1024-light.png。多显示器和其他 DPI 未补测。
- 本轮未重复既有作者 ZIP 下载与全页面大回归：下载器未改变；新的来源切换、过期目录和数据库边界已针对性测试。132 项包含既有下载/扫描/安装隔离回归。没有执行实际游戏写入或普通安装 UI；实际游戏正在运行，守卫保持启用。
- 05:43 香港时间只读更新实际环境记录：Steam 安装记录就绪、版本 1.0.1158.16、游戏进程正在运行。artifacts/game-environment-current.json。没有修改 Steam 更新设置、系统策略或游戏文件；没有开展故事模式或插件加载验收。
- 0.1.5 仍只交付源码和可复现构建工程；不重复尝试已有 Device Guard 阻碍的未签名发行启动。可信商业签名、平台授权与完整需求终验未完成，未远程执行 CI。本轮没有增加第三方再分发材料或使用网站内容建立镜像。


## 0.1.6 严格代码审查与故障回归（2026-10-12）

- 确认并修复 12 类问题，按 P1/P2 排序、复现步骤、代码位置、修复和剩余范围见 CODE_REVIEW.md。初始失败日志保留；没有把既有功能缺失冒充新漏洞。
- 完整核心 **149/149 通过，0 跳过**，新增 17 项：12 个审查回归、2 个退出门禁、3 个下载二次错误。包括持久化失败后的磁盘检查、文件连接外部保护、失败事务依赖恢复，以及 64 MiB 堆限制的真实子进程说明压力测试。证据 artifacts/core-tests-review-current.log。
- TypeScript 与 Electron 桌面构建通过，artifacts/build-review-current.log。初次新 statfs 故障注入测试有类型标注错误，已修正；Framer Motion 的既有非阻断指令提示仍在。无新增依赖。
- 实际 Electron 在真实 48 MiB / 12 文件扫描中关窗，等待任务后退出；退出后的实际 SQLite 有完整报告，没有模组/事务。证据 artifacts/shutdown-ui-current.json/log；初始版本报告 0 文件，日志 shutdown-initial-failure.log 保留。没有用真实游戏安装去复现。
- 实际 Electron 来源改名、选择、移除、退出重启、公开 API、双主题 / 1024 布局通过，artifacts/source-library-ui-current.json 与 source-library-ui-review-current.log。
- 最新实际商店下载 / 扫描 / 自动刷新、SHA-256、网站隔离回归通过，artifacts/marketplace-ui-current.json 与 marketplace-ui-review-current.log。下载作者 ScriptHookVDotNetEnhanced-v1.1.0.6.zip，实际 SHA-256 f10da8819fa6814fb0a04553567d2516934eac96b16af06ad8f315f0da00473a，扫描 16 文件；没有安装或加载该插件。
- 额外真实 Electron 故障验收：真实公开 ZIP 下载，在隔离用户数据把日志设为测试保护文件的真实硬链接。软件阻止追加、保留保护文件原文，显示下载服务停止原因并拒绝新任务；扫描副本和报告保留，未假报完整成功。证据 artifacts/download-error-ui-current.json/log，截图 ui/download-error-real.png 已目视检查；没有替换下载器或网页数据。
- 06:24 香港时间只读检查 E 盘，安装记录仍就绪、版本 1.0.1158.16、实际进程运行。artifacts/game-environment-current.json。没有写游戏或改 Steam/系统设置，未进行故事模式/助手实测。
- 未重复受 Device Guard 阻止的发行启动；缺签名和完整许可/真实资源/游戏功能验收。0.1.6 仍只交付源码，commercialReady=false、fullRequirementsPassed=false，完整商业终验没有通过。


## 0.1.7 网络取消和退出（2026-10-12）

- R13 / P2：系统 DNS 的 Promise 不返回时，取消/总时限不会结束 await，下载服务 close 等待 active，发布目录读取退出等待也被阻塞。两项初始失败与实际 Electron 初始关闭失败保存于 artifacts/network-cancellation-initial-failures.log、network-close-ui-initial-failure.log。
- 修复：awaitAbort 等待器接收取消，移除监听并消费晚到结果/拒绝；系统 DNS 等待另限 10 秒，调用方仍有效时才允许已有受限 HTTPS 公共回查。退出向只读发布目录请求发送取消，同时保留文件事务/下载收尾等待。没有修改 Windows DNS、Steam 或安全策略，没有放行私网/保留地址或关闭 TLS 验证。
- 核心 **155/155 通过，0 跳过**，新增 6 项：系统 DNS 取消、实际下载服务 close 取消持久化、预取消不发请求、总时限、晚到 DNS 拒绝不发 HTTPS、正常/异常监听清理。证据 artifacts/core-tests-network-current.log；定向初次修复 6 项通过见 network-cancellation-current.log。最终完整核心包括扩展后的非固定耗时顺序断言，避免把繁忙机器的速度抖动误认成逻辑错误。
- TypeScript 与桌面构建通过，artifacts/build-network-current.log。初次测试夹具的 DNS overload 标注错误已修正；无新增依赖，既有 Framer Motion 非阻断提示保留。
- 真实 Electron 的原 IPC/目录读取路径中，仅本次测试进程注入一个不返回的 DNS Promise，关窗后请求取消、进程正常退出、数据库保留。没有替换生产 IPC、更改系统 DNS或网络设置。证据 artifacts/network-close-ui-current.json/log；此为故障注入验收，不能称为真实 Windows DNS 故障实测。首次修复后测试清理错误读取已销毁的 Playwright process 对象，脚本非零退出；已保存失败并修正为预先持有进程引用，最终完整脚本通过。
- 未注入故障的实际公开 GitHub API 读取通过，取得 7 个受支持发布包元数据。证据 artifacts/network-live-current.json/log。没有再次下载插件、安装、调用游戏内接口或把元数据当作游戏验证。
- 06:37 香港时间只读环境检查：Steam StateFlags=4，buildid=25261616，下载/部署计数均完成；版本 1.0.1158.16、实际 GTA5_Enhanced 进程 9960 仍运行。初次 PowerShell 混合表格未显示进程列，曾误判退出；在执行任何安装测试前用只读后端和独立 JSON 确认仍运行，并已更正。没有执行普通安装 UI 回归、没有绕过生产运行守卫、没有实际游戏写入。
- 未重试被 Device Guard 拒绝的 EXE，没有可信签名/新许可凭据；本版仍只交付源码，完整商业与游戏终验未通过。


## 0.1.8 HTTPS 证书验证（2026-10-12）

- R14 / P1：继承 NODE_TLS_REJECT_UNAUTHORIZED=0 的启动环境时，旧下载及公共 DNS 请求未显式要求证书验证。两条实际本地 TLS 握手接受不受信任的证书，初始失败见 artifacts/tls-policy-initial-failures.log。没有声称普通默认环境会绕过证书或已发现远程代码执行。
- 修复：两个 HTTPS 调用都明确 rejectUnauthorized=true、minVersion=TLSv1.2。没有增加 CA、关闭验证、修改 Windows 信任或 Device Guard。证书为测试进程内动态生成的 RSA/SHA-256 X509，仅用本地回环服务器，不保存私钥到源码或系统存储。故障环境变量只传入独立测试子进程，没有更改用户/系统持久环境。
- 核心 **157/157 通过，0 跳过**，新增两项资产请求和公共 DNS 请求的真实 TLS 测试。证据 artifacts/core-tests-tls-current.log。最终定向测试沿用 HTTPS 默认 Agent，仅在测试进程注入 DNS 和回环路由，不伪造握手结果：artifacts/tls-policy-current.log。
- TypeScript、Vite 与 Electron 主进程构建通过，artifacts/build-tls-current.log；无新增依赖，Framer Motion 既有非阻断提示仍在。TLS 夹具只用 Node 标准 crypto/https，不需要 OpenSSL 命令或额外开发工具。
- 真实 Electron 原 IPC/发布读取后端在不安全测试启动环境下拒绝证书：HTTP 请求数 0，未保存未验证的目录，中文错误弹窗正常，没有页面异常。证据 artifacts/tls-policy-ui-current.json/log，ui/tls-rejection-real.png 已目视检查。TLS 和本地服务器真实运行，域名路由仅是本次测试内的故障注入；不是对真实网站发起攻击或关闭系统保护。
- 未注入故障的公网 GitHub API 仍通过，真实读取 7 个发布包元数据；没有再次下载或安装插件。证据 artifacts/network-live-current.json、network-live-tls-current.log。原站网页 Chromium 证书/权限流程及网站窗口退出不在本轮已验证范围。
- E 盘 Steam 清单 StateFlags=4、buildid=25261616、下载及部署计数已完成；最新只读后端仍检测 1.0.1158.16 和运行中的游戏。没有真实游戏写入、故事模式/助手或普通安装 UI 回归，不绕过游戏守卫。
- 没有生成或尝试未签名发行 EXE，也没有新增商业授权资料；本版源码交付，可信商业签名、转换/资源/助手和完整终验仍未完成。

最后复查另封存RpfArchive实例，阻止通过替换整个limits属性绕过已冻结配置，并在同一限制测试覆盖。该运行逻辑变化后重新跑定向/核心及构建；不是任意受信JavaScript的安全沙箱。
