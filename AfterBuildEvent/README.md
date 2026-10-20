# AfterBuildEvent

仓库共用的 TypeScript 构建与打包程序，运行在 Node.js 22.18.0 及以上版本。它按根目录下的 `mod.json` 发现模组，读取 `src/main.ts`，生成一代 shapez 可加载的单文件 JavaScript 和版本化安装包。

## 命令

在仓库根目录执行：

```bash
npm ci
npm run check
npm run build -- --mod Twelvefold
npm run pack -- --mod Twelvefold
npm run pack -- --all
npm run pack -- --mod Twelvefold --output ModZips
node --experimental-strip-types AfterBuildEvent/src/main.ts list
```

默认选择全部模组；`--mod` 按模组目录名选择一个，不能与 `--all` 同时使用。`--help` 显示命令说明。

| 命令 | 行为 |
| --- | --- |
| check | 模组元数据、TypeScript 静态诊断、全语言文案与安装说明检查 |
| build | 完成 check 后，用 esbuild 生成自包含 IIFE JavaScript |
| pack | 完成 check 并重新 build，输出独立 JS、版本化 ZIP、哈希与清单，并按本机配置复制 JS 到游戏模组目录 |
| list | 只列出已发现模组的名称、版本和 ID |

失败返回非零退出状态。元数据 JSON、入口或说明缺失，文案缺项、空译文、占位符不同以及外部构建依赖都会阻止产物生成。

## 模组约定

每个模组目录包含：

```text
<ModName>/mod.json
<ModName>/src/main.ts
<ModName>/README.md
<ModName>/CHANGELOG.md
```

`mod.json` 是版本与游戏元数据的唯一来源。源码通过 `__MOD_METADATA__` 读取构建时嵌入的对象，并调用 shapez 一代的 `$shapez_registerMod` 注册。图片等资源随 JavaScript 内嵌。

有多语言数据的模组同时提供 `src/i18n/schema.json`、`catalogs.json` 与 `install.json`。schema 保存核对过的目标游戏版本、完整语言清单与有序文案键；catalogs 按语言和分组保存等长译文行；install 保存每种语言的安装说明。工具检查覆盖、分组、键唯一、数量、非空字符串和 `{name}` 占位符一致性。

TypeScript Program 只读取所选模组及其导入依赖、共用工具的源码，获取诊断，不执行模组模块。打包明确使用本次构建的文件集合，排除 dist 旧文件、源代码、依赖、本机配置和存档。

## 输出

```text
<ModName>/dist/<ModName>.js
<ModName>/dist/mod.json
<ModName>/dist/README.md
<ModName>/dist/CHANGELOG.md
<ModName>/dist/INSTALL.txt       有多语言安装数据时
<ModName>/dist/manifest.json
build/<ModName>.metafile.json   esbuild 依赖清单
ModZips/<ModName>.js
ModZips/<ModName>-<version>.zip
ModZips/<ModName>-<version>.zip.sha256
ModZips/<ModName>-<version>.zip.manifest.json
```

ZIP 内使用上述 dist 文件名，时间戳固定。输出目录中的独立 JS 与 ZIP 内 JS 使用同一份构建数据，可直接安装。manifest 记录版本、语言、静态验证边界，以及各文件字节数与 SHA-256；ZIP 旁的清单额外记录整个包的大小与哈希。产物与复制到游戏目录的 JS 均通过临时文件替换写入，保留文件的完整性。

## 本机路径

将根目录的 `DefaultPath.example.json` 复制为 `DefaultPath.json`：

```json
{
  "packageOutput": "ModZips",
  "modsDirectory": "C:\\Users\\MLJ\\AppData\\Roaming\\shapez.io\\mods"
}
```

`packageOutput` 决定 ZIP 与独立 JS 的输出目录，`modsDirectory` 是可选的游戏模组目录；配置后，`pack` 会复制本次构建的 `<ModName>.js`，覆盖同名旧文件。复制失败会返回非零退出状态。相对路径以仓库根目录为基准；Windows 下支持盘符路径，WSL 下 `C:\\...` 形式映射到 `/mnt/c/...`。`--output` 只覆盖产物输出目录，仍使用本机配置中的 `modsDirectory`。没有本机配置时输出到根目录 ModZips，不自动复制。本机文件被 Git 忽略。

## 验证边界

该工具完成静态诊断、语言结构检查、构建和真实打包。游戏行为、界面显示、译文质量、数值平衡与性能需要相应的游玩验证。
