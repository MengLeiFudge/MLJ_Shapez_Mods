# MLJ_Shapez_Mods

面向 shapez（第一代）的独立模组仓库，使用 TypeScript 开发，输出游戏可加载的 JavaScript。按模组分目录、共用 AfterBuildEvent 和版本化 ModZips 的组织方式参考 MLJ_DSPmods。

当前模组为 **十二工坊 / Twelvefold**，独立标识 `mlj-twelvefold`。玩法合同见 [NEW-MOD-DESIGN.md](NEW-MOD-DESIGN.md)，安装与玩法见 [Twelvefold/README.md](Twelvefold/README.md)。首版针对 shapez 1.5.6 的实际 Mod API 实现。

## 仓库结构

```text
AfterBuildEvent/src/     共用检查、构建与打包程序
Twelvefold/mod.json     模组版本与游戏元数据
Twelvefold/src/domain/  十二槽图形、加工规则、目标、研究、账本与订单
Twelvefold/src/game/    建筑、系统、物流、电路、地图、HUD 与存档接入
Twelvefold/src/i18n/    本体支持的全部 24 种语言
Twelvefold/assets/      内嵌参考图片与逐文件来源清单
Twelvefold/dist/        构建生成的 JS、说明与产物清单（忽略）
ModZips/                独立 JS、版本化 ZIP、SHA-256 与清单（忽略）
DefaultPath.example.json 本机路径配置示例
NEW-MOD-DESIGN.md       玩法设计与数值合同
```

各模组自行维护名称、ID、版本、源码和说明，依赖与构建工具集中在仓库根目录。Git 仓库已初始化在 `master` 分支；生成物、依赖、本机配置和工作记录不进入版本控制。

## 开发与打包

需要 Node.js 22.18.0 或更高版本与 npm。在仓库根目录执行：

```bash
npm ci
npm run check
npm run build -- --mod Twelvefold
npm run pack -- --mod Twelvefold
```

`check` 执行 TypeScript 静态诊断、元数据和语言数据校验；`build` 检查后生成单文件 `Twelvefold/dist/Twelvefold.js`，将图片与译文内嵌；`pack` 检查并重新构建，生成 `ModZips/Twelvefold.js`、`ModZips/Twelvefold-<版本>.zip`、同名 `.sha256` 和 `.manifest.json`，并按本机配置将 JS 复制到游戏模组目录。省略 `--mod` 或使用 `--all` 会处理全部模组。

版本唯一来自各模组的 `mod.json`。ZIP 明确收录本次构建的 JS、元数据、安装说明、更新记录和带哈希的清单。脚本说明见 [AfterBuildEvent/README.md](AfterBuildEvent/README.md)。

可把 `DefaultPath.example.json` 复制为被 Git 忽略的 `DefaultPath.json`：`packageOutput` 指定 ZIP 与独立 JS 的输出目录，`modsDirectory` 指定自动复制 JS 的游戏模组目录。示例为 `C:\Users\MLJ\AppData\Roaming\shapez.io\mods`，Windows 和 WSL 均支持。打包时的 `--output` 只覆盖产物输出目录，保留配置的 JS 复制行为；省略 `modsDirectory` 时只生成产物。没有本机配置时默认输出到 `ModZips`。

## 实现与验证边界

Twelvefold 实现十二槽、三层图形与连续块，主要及辅助加工，共用的实体/虚拟运算，六个里程碑与支线、代表图形档位、研究商店、蓝图与超链接经济、MAM 订单、电路分析、地图与存档。统一建筑目录驱动分类工具栏、逻辑角色端口和建筑图片；H/V 镜像态随 code 保存，T/数字键切小类，Tab 换大类。顶部常驻五个并行目标，实际操作推动六步开局引导，Alt/点击打开分层详情；自有 HUD 统一明暗主题。草案存档版本为 2，不迁移旧档。

语言清单固定来自 shapez 1.5.6：`en zh-CN zh-TW ja kor cs da de es-419 fr it hu nl no pl pt-PT pt-BR ro ru fi sv tr uk he`。各语言提供 172 个基础文案、由基础文案组成的变体名称，以及安装说明。构建检查所有语言的键覆盖、非空译文及占位符一致性。

允许的交付检查为源码核对、TypeScript 静态诊断、构建和实际打包。实际游玩、速度与平衡、MAM 难度、译文质量和界面显示效果尚未验证。

## 参考资料

本仓库以外的 `D:\project\shapez` 内容都是只读参考，主要包括原草案与 shapez 一代模组接口示例 `shapez-mods\SQ-X`、物流与模块组织参考 `shapez-industries`；仓库组织参考为 `D:\project\dsp\MLJ_DSPmods`。Twelvefold 的源码、自制矢量图、数据与存档合同由本仓库维护；同时内嵌 11 张尺寸与端口吻合的参考 PNG，逐文件作者和路径见 [Twelvefold/assets/SOURCES.md](Twelvefold/assets/SOURCES.md)，构建携带 CREDITS.md。参考模组目录未见许可文件，发布前由用户确认授权。
