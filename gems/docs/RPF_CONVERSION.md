# GEMS RPF 和兼容检测：实现范围与许可核对

核对日期：2026-10-12。下面的状态描述实际工程，不代表 Enhanced 游戏内实测。

## 当前实现

`packages/rpf-engine/index.ts` 提供独立 Node.js/TypeScript 后端，无 OpenIV 依赖，不包含游戏密钥。

| 能力 | 状态 | 范围 |
|---|---|---|
| 打开 RPF / 列出目录 | 已测试 | 目录表未加密的 RPF7；ASCII 名称；默认档案最大 512 MiB |
| 二进制文件提取 | 已测试 | 未加密、未压缩或原始 Deflate；校验输出大小；默认最大 128 MiB |
| RSC7 资源提取 | 已测试 | 提取独立资源封装，不提供模型/纹理渲染 |
| 嵌套 RPF | 已测试 | 受限递归，记录每个无法打开的档案及原因 |
| 替换普通二进制条目 | 已测试 | 只生成内存中的独立副本，回读核对修改内容；禁止加密条目和超大扩展资源 |
| 原始游戏写入 | 无接口 | 后端只返回 Buffer；应用必须另行使用备份事务保护 mods 中的写入 |
| 解密 / 加密 / 资源替换 / 新增 / 删除 | 未实现 | 不尝试猜测密钥，不把 ZIP 当作 RPF |
| 模型预览、材质与引用分析 | 未实现 | 禁止用演示模型冒充解析结果 |
| Enhanced 实际游戏加载 | 未验证 | 缺少真实游戏资源及单机游戏测试结果 |

独立副本重建只支持已经成功读取的未加密档案。它不保留原始文件数据偏移，而按 512 字节块重新排列；资源封装字节保留。将加密的原始 `update.rpf` 转成可修改副本仍不受支持，因此不能承诺自动修改任意游戏 DLC 加载列表。

## 兼容性检测

`packages/converter/index.ts` 从真实 RSC7 头读取版本，核对系统和图形标志中的版本。版本表来自下述固定官方源文件中的版本定义：YFT 162/171、YTD 13/5、YDR 和 YDD 165/159（Legacy/Enhanced）。这只是**头版本分类**，不证明载荷结构有效，亦不证明模组可以在游戏中正常工作。

三种实际检测模式：

- 快速：仅核对头部、标志和已知版本。
- 标准：另计算 SHA-256，并受限解压以验证压缩封装。
- 深度：另核对解压后字节数是否符合资源页面标志；模型图与资源引用尚未支持，报告中明确说明。

所有结果始终分别记录 `headerValid`、`envelopeValid`、`staticValidation`、`converted`、`gameLoaded`、`inGameTested`。只有压缩封装校验时，`staticValidation` 为 `envelope-only`；不会显示完整静态验证通过。

## CodeWalker 调查结论

官方 [dexyfex/CodeWalker](https://github.com/dexyfex/CodeWalker/tree/485d56bec00262ed7fa472261cce7bbc6202b96e) 固定提交：`485d56bec00262ed7fa472261cce7bbc6202b96e`。

[Readme_Src.txt](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Readme_Src.txt) 写明源码仅供教育用途。[Notice.txt](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/Notice.txt) 对列出的第三方部分提供 MIT 文本，并提到 FBX 部分的 GPL；不能据此认定整个项目获得 MIT 分发许可。

官方 [Gen9Converter.cs](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/Utils/Gen9Converter.cs) 确实包含 Gen9 转换逻辑和 RPF 遍历，而不是名称占位。工程因此没有伪造转换，也没有下载、编译、分发或调用这个未经许可确认的后端。当前 `convertResources` 会给出明确中文阻碍并停止，且不写输出目录或修改输入。

后续接入真实转换器需要：明确许可证、固定版本及哈希、合法发行渠道、独立输出目录、资源夹具回归验证、输入输出哈希、失败恢复，以及兼容 Enhanced 游戏的实际单机测试。`ConversionBackend` 保留来源、许可证、版本、支持资源和验证状态接口；当前没有注册任何后端。

## 格式研究来源

RPF7 二进制格式研究参考 MIT 授权的 [Neodymium146/gta-toolkit RageArchive7.cs](https://github.com/Neodymium146/gta-toolkit/blob/f287c66a38315fa6eb36b721fc090c62285ead1d/RageLib.GTA5/Archives/RageArchive7.cs)，固定提交 `f287c66a38315fa6eb36b721fc090c62285ead1d`。相关许可声明保存在 `packages/rpf-engine/NOTICE.txt`。当前解析器为独立 TypeScript 实现，没有内置上游 SDK 或游戏密钥。

## 测试与调用

在项目根目录执行：

```powershell
node node_modules/tsx/dist/cli.mjs --test packages/rpf-engine/rpf.test.ts
```

14 项合成夹具测试已通过，覆盖二进制/压缩读取、嵌套档案、损坏档案、加密标记、路径穿越、设备名、循环、重复引用分配限制、索引/数据范围、解压上限、资源头、独立副本二进制替换及回读、三个检测模式，以及未接入转换时拒绝执行。这些测试不使用真实付费模组或游戏文件，不能代替真实资源和游戏加载测试。

```typescript
const archive = await openRpf(userSelectedPath);
const entries = archive.list();
const bytes = archive.extractBinary(fileEntryId);
const independentCopy = archive.replaceBinaryEntries(new Map([[fileEntryId, editedXmlBytes]]));
// 由 GEMS Installer 创建备份、核对冲突和 SHA-256，再事务写入授权的 mods 目标。
const resourceReport = await analyzeResourceFile(resourcePath, 'deep');
```

所有 RPF 错误提供稳定 `RpfError.code` 与中文原因；加密或未知资源不会显示读取成功。
